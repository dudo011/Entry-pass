import worker from './worker-v7.js';

const SESSION_COOKIE = '__Host-ep_session';

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

async function driverChangingPassword(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'PUT' || url.pathname !== '/api/auth/profile') return null;

  const body = await request.clone().json().catch(() => ({}));
  if (!body.password) return null;

  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE] || bearerToken(request);
  if (!token) return null;

  return env.DB.prepare(`
    SELECT u.id, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first();
}

export default {
  async fetch(request, env, ctx) {
    // 하위 워커는 비밀번호 변경 성공 직후 모든 세션을 삭제한다.
    // 따라서 요청 처리 전에 사용자 ID를 확보해야 변경 필요 상태를 확실히 해제할 수 있다.
    const profileUser = await driverChangingPassword(request, env);
    const response = await worker.fetch(request, env, ctx);

    if (response.ok && profileUser?.role === 'driver') {
      await env.DB.prepare(
        'UPDATE users SET must_change_password = 0 WHERE id = ?'
      ).bind(profileUser.id).run();
    }

    return response;
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};
