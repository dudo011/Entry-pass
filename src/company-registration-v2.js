import vehicleTypes from '../data/vehicleTypes.js';

const PBKDF2_ITERS = 100000;
const enc = new TextEncoder();

const nowISO = () => new Date().toISOString();
const toHex = (buf) => [...new Uint8Array(buf)].map((v) => v.toString(16).padStart(2, '0')).join('');
const randHex = (bytes = 24) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const normLogin = (value) => String(value || '').trim().toLocaleLowerCase('en-US');
const normBusiness = (value) => String(value || '').replace(/\D/g, '');

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function derive(password, saltBytes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt) };
}

async function ensureCompanySchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS company_accounts (
      id TEXT PRIMARY KEY,
      login_id TEXT NOT NULL,
      login_id_norm TEXT NOT NULL UNIQUE,
      company_name TEXT NOT NULL,
      business_no TEXT NOT NULL,
      business_no_norm TEXT NOT NULL UNIQUE,
      contact_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      contract_type_id TEXT NOT NULL DEFAULT '',
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      account_status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS company_sessions (
      token TEXT PRIMARY KEY,
      company_account_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
  ]);

  const columns = await env.DB.prepare('PRAGMA table_info(company_accounts)').all();
  const names = new Set((columns.results || []).map((row) => row.name));
  if (!names.has('contract_type_id')) {
    await env.DB.prepare("ALTER TABLE company_accounts ADD COLUMN contract_type_id TEXT NOT NULL DEFAULT ''").run();
  }
}

async function loginTaken(env, loginId) {
  const normalized = normLogin(loginId);
  if (!normalized) return true;

  const company = await env.DB.prepare('SELECT id FROM company_accounts WHERE login_id_norm = ? LIMIT 1')
    .bind(normalized).first();
  if (company) return true;

  const user = await env.DB.prepare('SELECT id FROM users WHERE LOWER(login_id) = ? LIMIT 1')
    .bind(normalized).first().catch(() => null);
  if (user) return true;

  const staffApplication = await env.DB.prepare(
    "SELECT id FROM staff_applications WHERE LOWER(employee_no) = ? AND status IN ('pending','approved') LIMIT 1"
  ).bind(normalized).first().catch(() => null);
  return !!staffApplication;
}

async function registerCompanyV2(request, env) {
  await ensureCompanySchema(env);

  const body = await request.json().catch(() => ({}));
  const companyName = String(body.companyName || '').trim();
  const businessNo = String(body.businessNo || '').trim();
  const businessNorm = normBusiness(businessNo);
  const loginId = String(body.loginId || '').trim();
  const loginNorm = normLogin(loginId);
  const password = String(body.password || '');
  const phone = String(body.phone || '').trim();
  const contractTypeId = String(body.contractTypeId || '').trim();
  const contractType = vehicleTypes.find((type) => type.id === contractTypeId);

  if (!companyName || !businessNorm || !loginId || !password || !phone || !contractType) {
    return error('모든 항목을 입력하고 계약유형을 선택해 주세요.');
  }
  if (businessNorm.length !== 10) return error('사업자등록번호 10자리를 입력해 주세요.');
  if (password.length < 4) return error('비밀번호는 4자 이상이어야 합니다.');
  if (await loginTaken(env, loginId)) return error('이미 사용 중인 로그인 아이디입니다.');

  const business = await env.DB.prepare('SELECT id FROM company_accounts WHERE business_no_norm = ? LIMIT 1')
    .bind(businessNorm).first();
  if (business) return error('이미 가입된 사업자등록번호입니다.');

  const id = `company_${randHex(12)}`;
  const token = randHex(32);
  const createdAt = nowISO();
  const passwordData = await hashPassword(password);

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO company_accounts (
          id, login_id, login_id_norm, company_name, business_no, business_no_norm,
          contact_name, phone, contract_type_id, salt, hash, account_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'active', ?)
      `).bind(
        id, loginId, loginNorm, companyName, businessNo, businessNorm,
        phone, contractTypeId, passwordData.salt, passwordData.hash, createdAt,
      ),
      env.DB.prepare(`
        INSERT INTO company_sessions (token, company_account_id, created_at)
        VALUES (?, ?, ?)
      `).bind(token, id, createdAt),
    ]);
  } catch (e) {
    const message = String(e?.message || '');
    if (/UNIQUE|constraint/i.test(message)) return error('이미 사용 중인 아이디 또는 사업자등록번호입니다.');
    throw e;
  }

  return json({
    token,
    account: {
      id,
      loginId,
      companyName,
      businessNo,
      contactName: '',
      phone,
      contractTypeId,
      contractTypeName: contractType.name,
      accountStatus: 'active',
      createdAt,
    },
  }, 201);
}

export async function handleCompanyRegistrationV2(request, env) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/company/register') {
    return registerCompanyV2(request, env);
  }
  return null;
}
