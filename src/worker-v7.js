import legacyWorker from './worker-v6.js';

const SESSION_COOKIE = '__Host-ep_session';
const CSRF_COOKIE = 'ep_csrf';
const STAFF_MAX_AGE = 48 * 60 * 60;
const DRIVER_MAX_AGE = 30 * 24 * 60 * 60;
const PBKDF2_ITERS = 100000;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/staff-applications',
]);

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)]
  .map((value) => value.toString(16).padStart(2, '0')).join('');
const randHex = (bytes = 24) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

let driverSchemaReady;

async function ensureDriverAccountSchema(env) {
  if (!driverSchemaReady) {
    driverSchemaReady = (async () => {
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
        env.DB.prepare(
          'CREATE INDEX IF NOT EXISTS idx_driver_account_events_user ON driver_account_events(driver_user_id)'
        ),
      ]);
    })().catch((error) => {
      driverSchemaReady = null;
      throw error;
    });
  }
  return driverSchemaReady;
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

function randomHex(bytes = 24) {
  return randHex(bytes);
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function csrfCookie(token, maxAge) {
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}

function withCookies(response, values) {
  const headers = new Headers(response.headers);
  for (const value of values) headers.append('Set-Cookie', value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

function jsonError(message, status) {
  return jsonResponse({ error: message }, status);
}

function requestWithCookieAuthorization(request, cookieToken) {
  if (!cookieToken) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${cookieToken}`);
  return new Request(request, { headers });
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
  return { user };
}

async function writeDriverEvent(env, driverUserId, action, actor, details = {}) {
  await env.DB.prepare(`
    INSERT INTO driver_account_events
      (id, driver_user_id, action, actor_user_id, actor_name, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randHex(12),
    driverUserId,
    action,
    actor.id,
    actor.name,
    JSON.stringify(details),
    new Date().toISOString()
  ).run();
}

async function handleDriverAdminApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith('/api/admin/driver-accounts')) return null;
  await ensureDriverAccountSchema(env);

  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  if (request.method === 'GET' && path === '/api/admin/driver-accounts') {
    const rows = await env.DB.prepare(`
      SELECT id, login_id, name, phone, company, default_vehicle_number,
             default_vehicle_type_id, created_at, must_change_password
        FROM users
       WHERE role = 'driver'
       ORDER BY name, login_id
    `).all();
    return jsonResponse((rows.results || []).map((row) => ({
      id: row.id,
      loginId: row.login_id,
      vehicleNumber: row.default_vehicle_number || row.login_id,
      name: row.name,
      phone: row.phone,
      company: row.company,
      defaultVehicleTypeId: row.default_vehicle_type_id,
      createdAt: row.created_at,
      mustChangePassword: !!row.must_change_password,
      archived: String(row.login_id).includes('#sold#'),
    })));
  }

  const resetMatch = path.match(/^\/api\/admin\/driver-accounts\/([^/]+)\/reset-password$/);
  if (request.method === 'POST' && resetMatch) {
    const targetId = decodeURIComponent(resetMatch[1]);
    const target = await env.DB.prepare(
      "SELECT id, role, login_id, name FROM users WHERE id = ? AND role = 'driver'"
    ).bind(targetId).first();
    if (!target) return jsonError('차량기사 계정을 찾을 수 없습니다.', 404);
    if (String(target.login_id).includes('#sold#')) {
      return jsonError('차주 변경으로 보관 중인 이전 계정은 초기화할 수 없습니다.', 409);
    }

    const password = temporaryPassword();
    const { salt, hash } = await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE users SET salt = ?, hash = ?, must_change_password = 1 WHERE id = ?'
      ).bind(salt, hash, target.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
    ]);
    await writeDriverEvent(env, target.id, 'password_reset', auth.user, {
      loginId: target.login_id,
    });
    return jsonResponse({
      ok: true,
      temporaryPassword: password,
      message: '임시 비밀번호가 발급되었습니다. 기사에게 안전하게 전달해 주세요.',
    });
  }

  const transferMatch = path.match(/^\/api\/admin\/driver-accounts\/([^/]+)\/transfer$/);
  if (request.method === 'POST' && transferMatch) {
    const targetId = decodeURIComponent(transferMatch[1]);
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const company = String(body.company || '').trim();
    if (!name || !phone) return jsonError('새 차주의 이름과 연락처를 입력해 주세요.', 400);

    const target = await env.DB.prepare(
      `SELECT id, role, login_id, name, phone, company, default_vehicle_number,
              default_vehicle_type_id
         FROM users WHERE id = ? AND role = 'driver'`
    ).bind(targetId).first();
    if (!target) return jsonError('차량기사 계정을 찾을 수 없습니다.', 404);
    if (String(target.login_id).includes('#sold#')) {
      return jsonError('이미 차주 변경 처리된 계정입니다.', 409);
    }

    const vehicleNumber = target.default_vehicle_number || target.login_id;
    const archiveLoginId = `${target.login_id}#sold#${Date.now()}`;
    const newUserId = randHex(8);
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
        newUserId,
        vehicleNumber,
        name,
        salt,
        hash,
        phone,
        company,
        vehicleNumber,
        target.default_vehicle_type_id || '',
        createdAt
      ),
    ]);

    await writeDriverEvent(env, target.id, 'vehicle_owner_archived', auth.user, {
      vehicleNumber,
      previousName: target.name,
      newDriverUserId: newUserId,
    });
    await writeDriverEvent(env, newUserId, 'vehicle_owner_created', auth.user, {
      vehicleNumber,
      previousDriverUserId: target.id,
    });

    return jsonResponse({
      ok: true,
      newDriverUserId: newUserId,
      loginId: vehicleNumber,
      temporaryPassword: password,
      message: '기존 차주의 기록은 보존하고 새 차주 계정을 생성했습니다.',
    }, 201);
  }

  return jsonError('지원하지 않는 요청입니다.', 404);
}

async function handleFetch(request, env, ctx) {
  await ensureDriverAccountSchema(env);

  const url = new URL(request.url);
  const path = url.pathname;
  const cookies = parseCookies(request);
  const cookieToken = cookies[SESSION_COOKIE] || '';
  const legacyToken = bearerToken(request);

  if (cookieToken && UNSAFE_METHODS.has(request.method) && !CSRF_EXEMPT_PATHS.has(path)) {
    const csrfHeader = request.headers.get('X-CSRF-Token') || '';
    const csrfCookieValue = cookies[CSRF_COOKIE] || '';
    if (!csrfHeader || !csrfCookieValue || csrfHeader !== csrfCookieValue) {
      return jsonError('보안 확인 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.', 403);
    }
  }

  const adminResponse = await handleDriverAdminApi(request, env);
  if (adminResponse) return adminResponse;

  const forwardedRequest = requestWithCookieAuthorization(request, cookieToken);
  let response = await legacyWorker.fetch(forwardedRequest, env, ctx);

  if (path === '/api/auth/logout') {
    return withCookies(response, [clearSessionCookie(), clearCsrfCookie()]);
  }

  if ((path === '/api/auth/login' || path === '/api/auth/register') && response.ok) {
    const data = await response.clone().json().catch(() => null);
    if (data?.token && data?.user?.role) {
      const dbUser = await env.DB.prepare(
        'SELECT must_change_password FROM users WHERE id = ?'
      ).bind(data.user.id).first();
      data.user.mustChangePassword = !!dbUser?.must_change_password;

      const maxAge = data.user.role === 'staff' ? STAFF_MAX_AGE : DRIVER_MAX_AGE;
      const csrf = randomHex(24);
      const safeBody = JSON.stringify({ ...data, token: 'cookie-session' });
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Content-Length', String(new TextEncoder().encode(safeBody).byteLength));
      headers.append('Set-Cookie', sessionCookie(data.token, maxAge));
      headers.append('Set-Cookie', csrfCookie(csrf, maxAge));
      response = new Response(safeBody, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  }

  if (path === '/api/auth/me' && response.ok) {
    const data = await response.clone().json().catch(() => null);
    if (data?.user?.id) {
      const dbUser = await env.DB.prepare(
        'SELECT must_change_password FROM users WHERE id = ?'
      ).bind(data.user.id).first();
      const safeBody = JSON.stringify({
        ...data,
        user: { ...data.user, mustChangePassword: !!dbUser?.must_change_password },
      });
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.set('Content-Length', String(new TextEncoder().encode(safeBody).byteLength));
      response = new Response(safeBody, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }

  if (path === '/api/auth/profile' && request.method === 'PUT' && response.ok) {
    const body = await request.clone().json().catch(() => ({}));
    const user = await currentUser(request, env);
    if (body.password && user?.role === 'driver') {
      await env.DB.prepare(
        'UPDATE users SET must_change_password = 0 WHERE id = ?'
      ).bind(user.id).run();
    }
  }

  // 기존 localStorage 토큰 사용자는 인증 확인이 성공하면 쿠키 방식으로 자동 전환한다.
  if (!cookieToken && legacyToken && path === '/api/auth/me' && response.ok) {
    const data = await response.clone().json().catch(() => null);
    if (data?.user?.role) {
      const maxAge = data.user.role === 'staff' ? STAFF_MAX_AGE : DRIVER_MAX_AGE;
      const csrf = randomHex(24);
      response = withCookies(response, [sessionCookie(legacyToken, maxAge), csrfCookie(csrf, maxAge)]);
    }
  }

  return response;
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleFetch(request, env, ctx);
    return withSecurityHeaders(response);
  },
  scheduled(event, env, ctx) {
    return legacyWorker.scheduled(event, env, ctx);
  },
};
