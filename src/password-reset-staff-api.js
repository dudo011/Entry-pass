const SESSION_COOKIE = '__Host-ep_session';
const CSRF_COOKIE = 'ep_csrf';
const PBKDF2_ITERS = 100000;
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
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS driver_account_events (
          id TEXT PRIMARY KEY,
          driver_user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          actor_user_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          details TEXT DEFAULT '{}',
          created_at TEXT NOT NULL
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

async function listRequests(request, env) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const allowed = new Set(['pending', 'approved', 'rejected', 'all']);
  if (!allowed.has(status)) return jsonError('올바르지 않은 요청 상태입니다.', 400);

  const where = status === 'all' ? '' : 'WHERE r.status = ?';
  const statement = env.DB.prepare(`
    SELECT r.id, r.driver_user_id, r.vehicle_number, r.request_name, r.request_phone,
           r.request_company, r.status, r.created_at, r.processed_at,
           r.processed_by_name, r.resolution_note,
           u.login_id, u.name AS account_name, u.phone AS account_phone,
           u.company AS account_company, u.must_change_password
      FROM password_reset_requests r
      JOIN users u ON u.id = r.driver_user_id
      ${where}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
  `);
  const rows = status === 'all' ? await statement.all() : await statement.bind(status).all();
  return jsonResponse((rows.results || []).map((row) => ({
    id: row.id,
    driverUserId: row.driver_user_id,
    vehicleNumber: row.vehicle_number,
    name: row.request_name,
    phone: row.request_phone,
    company: row.request_company,
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    processedByName: row.processed_by_name,
    resolutionNote: row.resolution_note,
    accountName: row.account_name,
    accountPhone: row.account_phone,
    accountCompany: row.account_company,
    mustChangePassword: !!row.must_change_password,
  })));
}

async function approveRequest(request, env, requestId) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const item = await env.DB.prepare(`
    SELECT r.id, r.driver_user_id, r.status, r.vehicle_number,
           u.login_id, u.name, u.role
      FROM password_reset_requests r
      JOIN users u ON u.id = r.driver_user_id
     WHERE r.id = ?
  `).bind(requestId).first();
  if (!item) return jsonError('비밀번호 발급 요청을 찾을 수 없습니다.', 404);
  if (item.status !== 'pending') return jsonError('이미 처리된 요청입니다.', 409);
  if (item.role !== 'driver' || isArchived(item.login_id)) {
    return jsonError('현재 사용할 수 없는 차량기사 계정입니다.', 409);
  }

  const password = temporaryPassword();
  const { salt, hash } = await hashPassword(password);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET salt = ?, hash = ?, must_change_password = 1 WHERE id = ?'
    ).bind(salt, hash, item.driver_user_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(item.driver_user_id),
    env.DB.prepare(`
      UPDATE password_reset_requests
         SET status = 'approved', processed_at = ?, processed_by_user_id = ?,
             processed_by_name = ?, resolution_note = 'temporary_password_issued'
       WHERE id = ? AND status = 'pending'
    `).bind(now, auth.user.id, auth.user.name, item.id),
    env.DB.prepare(`
      INSERT INTO driver_account_events
        (id, driver_user_id, action, actor_user_id, actor_name, details, created_at)
      VALUES (?, ?, 'password_reset_request_approved', ?, ?, ?, ?)
    `).bind(
      randomHex(), item.driver_user_id, auth.user.id, auth.user.name,
      JSON.stringify({ requestId: item.id, loginId: item.login_id }), now
    ),
  ]);

  return jsonResponse({
    ok: true,
    status: 'approved',
    loginId: item.login_id,
    temporaryPassword: password,
    message: '임시 비밀번호가 발급되었습니다. 등록된 연락처로 본인 확인 후 안내해 주세요.',
  });
}

async function rejectRequest(request, env, requestId) {
  const auth = await requireStaff(request, env);
  if (auth.error) return auth.error;
  const item = await env.DB.prepare(
    'SELECT id, driver_user_id, status FROM password_reset_requests WHERE id = ?'
  ).bind(requestId).first();
  if (!item) return jsonError('비밀번호 발급 요청을 찾을 수 없습니다.', 404);
  if (item.status !== 'pending') return jsonError('이미 처리된 요청입니다.', 409);

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || '직원 반려').trim().slice(0, 200);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE password_reset_requests
         SET status = 'rejected', processed_at = ?, processed_by_user_id = ?,
             processed_by_name = ?, resolution_note = ?
       WHERE id = ? AND status = 'pending'
    `).bind(now, auth.user.id, auth.user.name, reason, item.id),
    env.DB.prepare(`
      INSERT INTO driver_account_events
        (id, driver_user_id, action, actor_user_id, actor_name, details, created_at)
      VALUES (?, ?, 'password_reset_request_rejected', ?, ?, ?, ?)
    `).bind(
      randomHex(), item.driver_user_id, auth.user.id, auth.user.name,
      JSON.stringify({ requestId: item.id, reason }), now
    ),
  ]);
  return jsonResponse({ ok: true, status: 'rejected', message: '비밀번호 발급 요청을 반려했습니다.' });
}

export async function handlePasswordResetStaffApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const base = '/api/admin/password-reset-requests';
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  await ensureSchema(env);

  if (request.method === 'GET' && path === base) return listRequests(request, env);

  const approveMatch = path.match(/^\/api\/admin\/password-reset-requests\/([^/]+)\/approve$/);
  if (request.method === 'POST' && approveMatch) {
    return approveRequest(request, env, decodeURIComponent(approveMatch[1]));
  }

  const rejectMatch = path.match(/^\/api\/admin\/password-reset-requests\/([^/]+)\/reject$/);
  if (request.method === 'POST' && rejectMatch) {
    return rejectRequest(request, env, decodeURIComponent(rejectMatch[1]));
  }

  return jsonError('지원하지 않는 요청입니다.', 404);
}
