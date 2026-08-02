import worker from './worker-v8.js';
import { handleDriverAccountStaffApi } from './driver-account-staff-api.js';
import { handlePasswordResetStaffApi } from './password-reset-staff-api.js';
import { preflightSecurity, withSecurityHeaders } from './security-hardening.js';

function isStaffManagementPath(path) {
  return path === '/api/admin/driver-accounts'
    || path.startsWith('/api/admin/driver-accounts/')
    || path === '/api/admin/password-reset-requests'
    || path.startsWith('/api/admin/password-reset-requests/');
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (!isStaffManagementPath(path)) return worker.fetch(request, env, ctx);

    const blocked = await preflightSecurity(request, env);
    if (blocked) return withSecurityHeaders(blocked, request);

    let response = await handleDriverAccountStaffApi(request, env);
    if (!response) response = await handlePasswordResetStaffApi(request, env);
    if (!response) response = new Response(JSON.stringify({ error: '지원하지 않는 요청입니다.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
    return withSecurityHeaders(response, request);
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};
