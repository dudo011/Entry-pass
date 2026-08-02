const SESSION_COOKIE = '__Host-ep_session';
const CSRF_COOKIE = 'ep_csrf';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

let schemaReady;

const randomHex = (bytes = 12) => [...crypto.getRandomValues(new Uint8Array(bytes))]
  .map((value) => value.toString(16).padStart(2, '0')).join('');

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
    schemaReady = env.DB.batch([
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
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
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

async function requireAdmin(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { error: jsonError('로그인이 필요합니다.', 401) };
  if (user.role !== 'staff' || user.staff_role !== 'admin') {
    return { error: jsonError('관리자 권한이 필요합니다.', 403) };
  }

  if (request.method !== 'GET') {
    const cookies = parseCookies(request);
    if (cookies[SESSION_COOKIE]) {
      const header = request.headers.get('X-CSRF-Token') || '';
      if (!header || !cookies[CSRF_COOKIE] || header !== cookies[CSRF_COOKIE]) {
        return { error: jsonError('보안 확인 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.', 403) };
      }
    }
  }
  return { user };
}

function isArchived(loginId) {
  const value = String(loginId || '');
  return value.includes('#sold#') || value.includes('#deleted#');
}

function toAccount(row) {
  const lastRequestAt = row.last_request_at || '';
  const activityAt = lastRequestAt || row.created_at || '';
  const activityTime = Date.parse(activityAt);
  const dormant = Number.isFinite(activityTime)
    ? Date.now() - activityTime >= ONE_YEAR_MS
    : false;

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
    dormant,
    mustChangePassword: !!row.must_change_password,
    archived: isArchived(row.login_id),
  };
}

async function listAccounts(request, env) {
  const auth = await requireAdmin(request, env);
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

async function deleteAccount(request, env, targetId) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const target = await env.DB.prepare(`
    SELECT id, role, login_id, name, phone, company, default_vehicle_number
      FROM users
     WHERE id = ? AND role = 'driver'
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
    env.DB.prepare(`
      INSERT INTO driver_account_events
        (id, driver_user_id, action, actor_user_id, actor_name, details, created_at)
      VALUES (?, ?, 'account_deleted', ?, ?, ?, ?)
    `).bind(
      randomHex(), target.id, auth.user.id, auth.user.name,
      JSON.stringify({ vehicleNumber, name: target.name, phone: target.phone, company: target.company }),
      now
    ),
  ]);

  return jsonResponse({
    ok: true,
    message: '회원 계정을 삭제했습니다. 기존 출입신청 기록은 보존됩니다.',
  });
}

export async function handleDriverAccountAdminV2(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const base = '/api/admin/driver-accounts';
  if (path !== base && !path.startsWith(`${base}/`)) return null;

  await ensureSchema(env);

  if (request.method === 'GET' && path === base) {
    return listAccounts(request, env);
  }

  const deleteMatch = path.match(/^\/api\/admin\/driver-accounts\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    return deleteAccount(request, env, decodeURIComponent(deleteMatch[1]));
  }

  return null;
}
