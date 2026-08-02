const SESSION_COOKIE = '__Host-ep_session';
const CSRF_COOKIE = 'ep_csrf';
const PBKDF2_ITERS = 100000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const enc = new TextEncoder();

let schemaReady;

const toHex = (buf) => [...new Uint8Array(buf)]
  .map((value) => value.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes = 12) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

function parseCookies(request) {
  const result = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

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
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS driver_account_events (
          id TEXT PRIMARY KEY,
          driver_user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          actor_user_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          details TEXT DEFAULT '{}',
          created_at TEXT NOT NULL
        )`),
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
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function derive(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt) };
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

async function currentUser(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE] || bearerToken(request);
  if (!token) return null;
  return env.DB.prepare(`
    SELECT u.*
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first();
}

async function requireStaff(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { error: jsonError('로그인이 필요합니다.', 401) };
  if (user.role !== 'staff') {
    return { error: jsonError('자재센터 직원 권한이 필요합니다.', 403) };
  }

  const disabled = await env.DB.prepare(
    'SELECT user_id FROM staff_disabled WHERE user_id = ?'
  ).bind(user.id).first().catch(() => null);
  if (disabled) return { error: jsonError('사용이 중지된 직원 계정입니다.', 403) };

  const cookies = parseCookies(request);
  if (cookies[SESSION_COOKIE] && request.method !== 'GET') {
    const header = request.headers.get('X-CSRF-Token') || '';
    if (!header || !cookies[CSRF_COOKIE] || header !== cookies[CSRF_COOKIE]) {
      return { error: jsonError('보안 확인 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.', 403) };
    }
  }
  return { user };
}

function isArchived(loginId) {
  const value = String(loginId || '');
  return value.includes('#sold#') || value.includes('#deleted#');
}

async function writeEvent(env, driverUserId, action, actor, details = {}) {
  await env.DB.prepare(`
    INSERT INTO driver_account_events
      (id, driver_user_id, action, actor_user_id, actor_name, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomHex(), driverUserId, action, actor.id, actor.name,
    JSON.stringify(details), new Date().toISOString()
  ).run();
}

function toAccount(row) {
  const lastRequestAt = row.last_request_at || '';
  const activityAt = lastRequestAt || row.created_at || '';
  const activityTime = Date.parse(activityAt);
  return {
    id: row.id,
    loginId: row.login_id,
    vehicleNumber: row.default_vehicle_number || row.login_id,
    name: row.name,
    phone: row.phone,
    company: row.company,
    defaultVehicleTypeId: row.default_vehicle_type_id,
    createdAt: row.created_at,
    lastRequestAt,
    dormant: Number.isFinite(activityTime) && Date.now() - activityTime >= ONE_YEAR_MS,
    mustChangePassword: !!row.must_change_password,
    archived: isArchived(row.login_id),
  };
}

async function listAccounts(request, env) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const rows = await env.DB.prepare(`
    SELECT u.id, u.login_id, u.name, u.phone, u.company,
           u.default_vehicle_number, u.default_vehicle_type_id,
           u.created_at, u.must_change_password,
           MAX(r.created_at) AS last_request_at
      FROM users u
      LEFT JOIN requests r ON r.driver_user_id = u.id
     WHERE u.role = 'driver'
     GROUP BY u.id, u.login_id, u.name, u.phone, u.company,
              u.default_vehicle_number, u.default_vehicle_type_id,
              u.created_at, u.must_change_password
     ORDER BY u.name, u.login_id
  `).all();
  return jsonResponse((rows.results || []).map(toAccount));
}

async function resetPassword(request, env, targetId) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const target = await env.DB.prepare(
    "SELECT id, role, login_id, name FROM users WHERE id = ? AND role = 'driver'"
  ).bind(targetId).first();
  if (!target) return jsonError('차량기사 계정을 찾을 수 없습니다.', 404);
  if (isArchived(target.login_id)) return jsonError('보관 또는 삭제된 계정은 초기화할 수 없습니다.', 409);

  const password = temporaryPassword();
  const { salt, hash } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET salt = ?, hash = ?, must_change_password = 1 WHERE id = ?'
    ).bind(salt, hash, target.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
  ]);
  await writeEvent(env, target.id, 'password_reset', auth.user, { loginId: target.login_id });
  return jsonResponse({
    ok: true,
    loginId: target.login_id,
    temporaryPassword: password,
    message: '임시 비밀번호가 발급되었습니다. 기사에게 안전하게 전달해 주세요.',
  });
}

async function transferAccount(request, env, targetId) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const company = String(body.company || '').trim();
  if (!name || !phone) return jsonError('새 차주의 이름과 연락처를 입력해 주세요.', 400);

  const target = await env.DB.prepare(`
    SELECT id, login_id, name, phone, company, default_vehicle_number,
           default_vehicle_type_id
      FROM users WHERE id = ? AND role = 'driver'
  `).bind(targetId).first();
  if (!target) return jsonError('차량기사 계정을 찾을 수 없습니다.', 404);
  if (isArchived(target.login_id)) return jsonError('이미 보관 또는 삭제된 계정입니다.', 409);

  const vehicleNumber = target.default_vehicle_number || target.login_id;
  const archiveLoginId = `${target.login_id}#sold#${Date.now()}`;
  const newUserId = randomHex(8);
  const password = temporaryPassword();
  const { salt, hash } = await hashPassword(password);
  const createdAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
         SET login_id = ?, default_vehicle_number = '', must_change_password = 0
       WHERE id = ?
    `).bind(archiveLoginId, target.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
    env.DB.prepare(`
      INSERT INTO users (
        id, role, staff_role, login_id, name, salt, hash, phone, company,
        default_vehicle_number, default_vehicle_type_id, created_at, must_change_password
      ) VALUES (?, 'driver', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      newUserId, vehicleNumber, name, salt, hash, phone, company,
      vehicleNumber, target.default_vehicle_type_id || '', createdAt
    ),
  ]);

  await writeEvent(env, target.id, 'vehicle_owner_archived', auth.user, {
    vehicleNumber, previousName: target.name, newDriverUserId: newUserId,
  });
  await writeEvent(env, newUserId, 'vehicle_owner_created', auth.user, {
    vehicleNumber, previousDriverUserId: target.id,
  });
  return jsonResponse({
    ok: true,
    newDriverUserId: newUserId,
    loginId: vehicleNumber,
    temporaryPassword: password,
    message: '기존 차주의 기록은 보존하고 새 차주 계정을 생성했습니다.',
  }, 201);
}

async function deleteAccount(request, env, targetId) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const target = await env.DB.prepare(`
    SELECT id, login_id, name, phone, company, default_vehicle_number
      FROM users WHERE id = ? AND role = 'driver'
  `).bind(targetId).first();
  if (!target) return jsonError('차량기사 회원을 찾을 수 없습니다.', 404);
  if (isArchived(target.login_id)) return jsonError('이미 삭제되었거나 보관 중인 회원입니다.', 409);

  const now = new Date().toISOString();
  const archivedLoginId = `${target.login_id}#deleted#${Date.now()}`;
  const vehicleNumber = target.default_vehicle_number || target.login_id;
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
         SET login_id = ?, default_vehicle_number = '', must_change_password = 0
       WHERE id = ?
    `).bind(archivedLoginId, target.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
    env.DB.prepare(`
      UPDATE password_reset_requests
         SET status = 'rejected', processed_at = ?, processed_by_user_id = ?,
             processed_by_name = ?, resolution_note = 'account_deleted'
       WHERE driver_user_id = ? AND status = 'pending'
    `).bind(now, auth.user.id, auth.user.name, target.id),
  ]);
  await writeEvent(env, target.id, 'account_deleted', auth.user, {
    vehicleNumber, name: target.name, phone: target.phone, company: target.company,
  });
  return jsonResponse({
    ok: true,
    message: '회원 계정을 삭제했습니다. 기존 출입신청 기록은 보존됩니다.',
  });
}

export async function handleDriverAccountStaffApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const base = '/api/admin/driver-accounts';
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  await ensureSchema(env);

  if (request.method === 'GET' && path === base) return listAccounts(request, env);

  const resetMatch = path.match(/^\/api\/admin\/driver-accounts\/([^/]+)\/reset-password$/);
  if (request.method === 'POST' && resetMatch) {
    return resetPassword(request, env, decodeURIComponent(resetMatch[1]));
  }

  const transferMatch = path.match(/^\/api\/admin\/driver-accounts\/([^/]+)\/transfer$/);
  if (request.method === 'POST' && transferMatch) {
    return transferAccount(request, env, decodeURIComponent(transferMatch[1]));
  }

  const deleteMatch = path.match(/^\/api\/admin\/driver-accounts\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    return deleteAccount(request, env, decodeURIComponent(deleteMatch[1]));
  }

  return jsonError('지원하지 않는 요청입니다.', 404);
}
