const COMPANY_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function bearer(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

async function currentCompany(request, env) {
  const token = bearer(request);
  if (!token) return null;

  const row = await env.DB.prepare(`
    SELECT a.*, s.created_at AS session_created_at
      FROM company_sessions s
      JOIN company_accounts a ON a.id = s.company_account_id
     WHERE s.token = ?
  `).bind(token).first();

  if (!row || row.account_status !== 'active') return null;
  const created = Date.parse(row.session_created_at || '');
  if (!Number.isFinite(created) || Date.now() - created >= COMPANY_SESSION_MS) {
    await env.DB.prepare('DELETE FROM company_sessions WHERE token = ?').bind(token).run().catch(() => {});
    return null;
  }
  return row;
}

function expired(value) {
  const ms = Date.parse(value || '');
  return !Number.isFinite(ms) || Date.now() > ms;
}

export async function handleCompanyDriverShareV2(request, env) {
  const url = new URL(request.url);
  const method = String(request.method || 'GET').toUpperCase();
  const match = url.pathname.match(/^\/api\/company\/requests\/([^/]+)\/driver-link$/);
  if (!match || method !== 'GET') return null;

  const account = await currentCompany(request, env);
  if (!account) return error('업체 로그인이 필요합니다.', 401);

  const requestId = decodeURIComponent(match[1]);
  const row = await env.DB.prepare(`
    SELECT id, pass_no, vehicle_number, driver_name, phone, visit_at,
           status, workflow_status, driver_access_token, driver_access_expires_at
      FROM requests
     WHERE id = ? AND company_account_id = ?
  `).bind(requestId, account.id).first();

  if (!row) return error('신청을 찾을 수 없습니다.', 404);

  const workflow = row.workflow_status || row.status || 'pending';
  if (row.status !== 'approved' || !['safety_pending', 'photo_pending', 'completed'].includes(workflow)) {
    return error('승인 후 기사 안내 링크를 사용할 수 있습니다.', 409);
  }
  if (!row.driver_access_token) return error('기사 안내 링크가 아직 생성되지 않았습니다.', 409);
  if (expired(row.driver_access_expires_at)) return error('기사 안내 링크 사용기한이 만료되었습니다.', 410);

  return json({
    requestId: row.id,
    passNo: row.pass_no,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    driverPhone: row.phone,
    visitAt: row.visit_at,
    workflowStatus: workflow,
    driverLink: `${url.origin}/#driverAccess=${encodeURIComponent(row.driver_access_token)}`,
    expiresAt: row.driver_access_expires_at || '',
  });
}
