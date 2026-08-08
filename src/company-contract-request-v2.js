import vehicleTypes from '../data/vehicleTypes.js';
import { handleCompanyFlowApi } from './company-flow-api.js';

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

async function ensureContractColumn(env) {
  const columns = await env.DB.prepare('PRAGMA table_info(company_accounts)').all();
  const names = new Set((columns.results || []).map((row) => row.name));
  if (!names.has('contract_type_id')) {
    await env.DB.prepare("ALTER TABLE company_accounts ADD COLUMN contract_type_id TEXT NOT NULL DEFAULT ''").run();
  }
}

async function currentCompany(request, env) {
  await ensureContractColumn(env);
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

function contractType(row) {
  const id = String(row?.contract_type_id || '').trim();
  return vehicleTypes.find((type) => type.id === id) || null;
}

export async function handleCompanyContractRequestV2(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = String(request.method || 'GET').toUpperCase();

  if (method === 'GET' && path === '/api/company/contract-context') {
    const account = await currentCompany(request, env);
    if (!account) return error('업체 로그인이 필요합니다.', 401);
    const type = contractType(account);
    if (!type) return error('업체 계정의 계약유형이 설정되지 않았습니다. 회원정보를 확인해 주세요.', 409);

    return json({
      companyName: account.company_name,
      contractTypeId: type.id,
      contractTypeName: type.name,
    });
  }

  if (method === 'POST' && path === '/api/company/requests') {
    const account = await currentCompany(request, env);
    if (!account) return error('업체 로그인이 필요합니다.', 401);
    const type = contractType(account);
    if (!type) return error('업체 계정의 계약유형이 설정되지 않았습니다. 회원정보를 확인해 주세요.', 409);

    const form = await request.formData().catch(() => null);
    if (!form) return error('신청정보를 확인할 수 없습니다.');

    // 차량유형은 화면 입력값을 신뢰하지 않고 업체 회원가입 시 선택한 계약유형으로 고정한다.
    form.set('vehicleTypeId', type.id);
    form.delete('purpose');

    const headers = new Headers(request.headers);
    headers.delete('content-type');
    headers.delete('content-length');

    const rewritten = new Request(request.url, {
      method: 'POST',
      headers,
      body: form,
    });
    return handleCompanyFlowApi(rewritten, env);
  }

  return null;
}
