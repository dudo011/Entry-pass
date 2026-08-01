import legacyWorker from './worker-v6.js';

const SESSION_COOKIE = '__Host-ep_session';
const CSRF_COOKIE = 'ep_csrf';
const STAFF_MAX_AGE = 48 * 60 * 60;
const DRIVER_MAX_AGE = 30 * 24 * 60 * 60;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/staff-applications',
]);

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
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
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

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function requestWithCookieAuthorization(request, cookieToken) {
  if (!cookieToken) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${cookieToken}`);
  return new Request(request, { headers });
}

async function handleFetch(request, env, ctx) {
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

  const forwardedRequest = requestWithCookieAuthorization(request, cookieToken);
  let response = await legacyWorker.fetch(forwardedRequest, env, ctx);

  if (path === '/api/auth/logout') {
    return withCookies(response, [clearSessionCookie(), clearCsrfCookie()]);
  }

  if ((path === '/api/auth/login' || path === '/api/auth/register') && response.ok) {
    const data = await response.clone().json().catch(() => null);
    if (data?.token && data?.user?.role) {
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
  fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    return legacyWorker.scheduled(event, env, ctx);
  },
};
