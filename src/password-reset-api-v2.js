import { handlePasswordResetApi as handleLegacyPasswordResetApi } from './password-reset-api.js';

const PUBLIC_PATH = '/api/auth/password-reset-requests';
const GENERIC_MESSAGE = '임시 비밀번호 발급 요청이 접수되었습니다. 입력한 정보와 일치하는 회원이 확인되면 자재센터 관리자가 등록된 연락처로 안내합니다.';

let schemaReady;

const randomHex = (bytes = 16) => [...crypto.getRandomValues(new Uint8Array(bytes))]
  .map((value) => value.toString(16).padStart(2, '0')).join('');
const normalizeVehicle = (value) => String(value || '')
  .normalize('NFKC').toUpperCase().replace(/[\s\-_.]/g, '');
const normalizeName = (value) => String(value || '')
  .normalize('NFKC').trim().replace(/\s+/g, '');
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function jsonError(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const columns = await env.DB.prepare('PRAGMA table_info(users)').all();
      const names = new Set((columns.results || []).map((column) => column.name));
      if (!names.has('must_change_password')) {
        await env.DB.prepare(
          'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0'
        ).run();
      }
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS password_reset_requests (
          id TEXT PRIMARY KEY,
          driver_user_id TEXT NOT NULL,
          vehicle_number TEXT NOT NULL,
          request_name TEXT NOT NULL,
          request_phone TEXT NOT NULL,
          request_company TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          processed_at TEXT,
          processed_by_user_id TEXT,
          processed_by_name TEXT,
          resolution_note TEXT NOT NULL DEFAULT ''
        )`),
        env.DB.prepare(
          'CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status ON password_reset_requests(status, created_at)'
        ),
        env.DB.prepare(
          'CREATE INDEX IF NOT EXISTS idx_password_reset_requests_driver ON password_reset_requests(driver_user_id, created_at)'
        ),
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function findDriver(env, body) {
  const rows = await env.DB.prepare(`
    SELECT id, login_id, name, phone, default_vehicle_number, must_change_password
      FROM users
     WHERE role = 'driver'
       AND login_id NOT LIKE '%#sold#%'
       AND login_id NOT LIKE '%#deleted#%'
  `).all();

  const vehicle = normalizeVehicle(body.vehicleNumber);
  const name = normalizeName(body.name);
  const phone = normalizePhone(body.phone);

  return (rows.results || []).find((row) => (
    normalizeVehicle(row.default_vehicle_number || row.login_id) === vehicle
    && normalizeName(row.name) === name
    && normalizePhone(row.phone) === phone
  )) || null;
}

async function createRequest(request, env) {
  await ensureSchema(env);

  const body = await request.json().catch(() => ({}));
  const vehicleNumber = String(body.vehicleNumber || '').trim();
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();

  if (!vehicleNumber || !name || !phone) {
    return jsonError('차량번호, 이름, 연락처를 모두 입력해 주세요.', 400);
  }
  if (normalizePhone(phone).length < 10) {
    return jsonError('연락처를 정확히 입력해 주세요.', 400);
  }

  const driver = await findDriver(env, { vehicleNumber, name, phone });
  if (!driver || driver.must_change_password) {
    return jsonResponse({ ok: true, status: 'pending', message: GENERIC_MESSAGE }, 202);
  }

  const existing = await env.DB.prepare(`
    SELECT id FROM password_reset_requests
     WHERE driver_user_id = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1
  `).bind(driver.id).first();
  const now = new Date().toISOString();

  if (existing) {
    await env.DB.prepare(`
      UPDATE password_reset_requests
         SET vehicle_number = ?, request_name = ?, request_phone = ?,
             request_company = '', created_at = ?
       WHERE id = ?
    `).bind(vehicleNumber, name, phone, now, existing.id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO password_reset_requests (
        id, driver_user_id, vehicle_number, request_name, request_phone,
        request_company, status, created_at
      ) VALUES (?, ?, ?, ?, ?, '', 'pending', ?)
    `).bind(randomHex(12), driver.id, vehicleNumber, name, phone, now).run();
  }

  return jsonResponse({ ok: true, status: 'pending', message: GENERIC_MESSAGE }, 202);
}

export async function handlePasswordResetApi(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === PUBLIC_PATH) {
    return createRequest(request, env);
  }
  return handleLegacyPasswordResetApi(request, env);
}
