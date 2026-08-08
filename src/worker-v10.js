import worker from './worker-v9.js';
import { handleCompanyFlowApi, isCompanyFlowPath } from './company-flow-api.js';
import { preflightSecurity, withSecurityHeaders } from './security-hardening.js';

function mayHandle(path, method) {
  if (isCompanyFlowPath(path)) return true;
  if (method === 'POST' && (path === '/api/auth/register' || path === '/api/staff-applications')) return true;
  return method === 'POST' && /^\/api\/requests\/[^/]+\/(approve|reject)$/.test(path);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = String(request.method || 'GET').toUpperCase();
    if (!mayHandle(path, method)) return worker.fetch(request, env, ctx);

    const blocked = await preflightSecurity(request, env);
    if (blocked) return withSecurityHeaders(blocked, request);

    const response = await handleCompanyFlowApi(request, env);
    if (!response) return worker.fetch(request, env, ctx);
    return withSecurityHeaders(response, request);
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};
