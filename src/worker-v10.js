import worker from './worker-v9.js';
import { handleCompanyFlowApi, isCompanyFlowPath } from './company-flow-api.js';
import { handleCompanyRegistrationV2 } from './company-registration-v2.js';
import { handleCompanyContractRequestV2 } from './company-contract-request-v2.js';
import { handleCompanyDriverShareV2 } from './company-driver-share-v2.js';
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

    const registrationResponse = await handleCompanyRegistrationV2(request, env);
    if (registrationResponse) return withSecurityHeaders(registrationResponse, request);

    const contractRequestResponse = await handleCompanyContractRequestV2(request, env);
    if (contractRequestResponse) return withSecurityHeaders(contractRequestResponse, request);

    const driverShareResponse = await handleCompanyDriverShareV2(request, env);
    if (driverShareResponse) return withSecurityHeaders(driverShareResponse, request);

    const response = await handleCompanyFlowApi(request, env);
    if (!response) return worker.fetch(request, env, ctx);
    return withSecurityHeaders(response, request);
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};
