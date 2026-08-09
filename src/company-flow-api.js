import vehicleTypes from '../data/vehicleTypes.js';

const SESSION_COOKIE = '__Host-ep_session';
const CSRF_COOKIE = 'ep_csrf';
const PBKDF2_ITERS = 100000;
const COMPANY_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const enc = new TextEncoder();
let schemaReady;

const nowISO = () => new Date().toISOString();
const toHex = (buf) => [...new Uint8Array(buf)].map((v) => v.toString(16).padStart(2, '0')).join('');
const randHex = (bytes = 24) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const fromHex = (hex) => new Uint8Array((String(hex || '').match(/.{1,2}/g) || []).map((v) => parseInt(v, 16)));
const normLogin = (value) => String(value || '').trim().toLocaleLowerCase('en-US');
const normBusiness = (value) => String(value || '').replace(/\D/g, '');
const normVehicle = (value) => String(value || '').replace(/\s+/g, '').trim();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
function error(message, status = 400) { return json({ error: message }, status); }

function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function bearer(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
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
async function verifyPassword(password, salt, hash) {
  const candidate = await derive(password, fromHex(salt));
  if (candidate.length !== String(hash || '').length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

async function ensureRequestColumns(env) {
  const rows = await env.DB.prepare('PRAGMA table_info(requests)').all();
  const names = new Set((rows.results || []).map((r) => r.name));
  const additions = [
    ['workflow_status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['company_account_id', "TEXT DEFAULT ''"],
    ['company_vehicle_id', "TEXT DEFAULT ''"],
    ['is_temporary_vehicle', 'INTEGER NOT NULL DEFAULT 0'],
    ['driver_access_token', "TEXT DEFAULT ''"],
    ['driver_access_expires_at', "TEXT DEFAULT ''"],
    ['safety_confirmed_at', "TEXT DEFAULT ''"],
    ['photo_uploaded_at', "TEXT DEFAULT ''"],
    ['completed_at', "TEXT DEFAULT ''"],
  ];
  for (const [name, type] of additions) {
    if (!names.has(name)) await env.DB.prepare(`ALTER TABLE requests ADD COLUMN ${name} ${type}`).run();
  }
}

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS company_accounts (
          id TEXT PRIMARY KEY,
          login_id TEXT NOT NULL,
          login_id_norm TEXT NOT NULL UNIQUE,
          company_name TEXT NOT NULL,
          business_no TEXT NOT NULL,
          business_no_norm TEXT NOT NULL UNIQUE,
          contact_name TEXT NOT NULL,
          phone TEXT NOT NULL,
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
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS company_vehicles (
          id TEXT PRIMARY KEY,
          company_account_id TEXT NOT NULL,
          vehicle_number TEXT NOT NULL,
          driver_name TEXT NOT NULL,
          driver_phone TEXT NOT NULL,
          default_vehicle_type_id TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(company_account_id, vehicle_number)
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_company_sessions_account ON company_sessions(company_account_id)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_company_vehicles_account ON company_vehicles(company_account_id)'),
      ]);
      await ensureRequestColumns(env);
      await env.DB.batch([
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_requests_company_account ON requests(company_account_id)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_requests_workflow ON requests(workflow_status)'),
      ]).catch(() => {});
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

async function loginTaken(env, loginId) {
  const normalized = normLogin(loginId);
  if (!normalized) return true;
  const company = await env.DB.prepare('SELECT id FROM company_accounts WHERE login_id_norm = ?').bind(normalized).first();
  if (company) return true;
  const user = await env.DB.prepare('SELECT id FROM users WHERE LOWER(login_id) = ?').bind(normalized).first();
  if (user) return true;
  const staffApplication = await env.DB.prepare(
    "SELECT id FROM staff_applications WHERE LOWER(employee_no) = ? AND status IN ('pending','approved') LIMIT 1"
  ).bind(normalized).first().catch(() => null);
  return !!staffApplication;
}

async function currentCompany(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT a.*, s.created_at AS session_created_at
      FROM company_sessions s JOIN company_accounts a ON a.id = s.company_account_id
     WHERE s.token = ?
  `).bind(token).first();
  if (!row || row.account_status !== 'active') return null;
  const created = Date.parse(row.session_created_at || '');
  if (!Number.isFinite(created) || Date.now() - created >= COMPANY_SESSION_MS) {
    await env.DB.prepare('DELETE FROM company_sessions WHERE token = ?').bind(token).run().catch(() => {});
    return null;
  }
  row._token = token;
  return row;
}

async function requireCompany(request, env) {
  const account = await currentCompany(request, env);
  return account ? { account } : { error: error('업체 로그인이 필요합니다.', 401) };
}

async function currentStaff(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE] || bearer(request);
  if (!token) return null;
  const user = await env.DB.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
  `).bind(token).first();
  if (!user || user.role !== 'staff') return null;
  const disabled = await env.DB.prepare('SELECT user_id FROM staff_disabled WHERE user_id = ?').bind(user.id).first().catch(() => null);
  if (disabled) return null;
  user._token = token;
  user._cookieSession = !!cookies[SESSION_COOKIE];
  user._csrfCookie = cookies[CSRF_COOKIE] || '';
  return user;
}

async function requireStaff(request, env, write = false) {
  const user = await currentStaff(request, env);
  if (!user) return { error: error('자재센터 직원 로그인이 필요합니다.', 401) };
  if (write && user._cookieSession) {
    const csrf = request.headers.get('X-CSRF-Token') || '';
    if (!csrf || !user._csrfCookie || csrf !== user._csrfCookie) {
      return { error: error('보안 확인 정보가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.', 403) };
    }
  }
  return { user };
}

function publicAccount(row) {
  return {
    id: row.id,
    loginId: row.login_id,
    companyName: row.company_name,
    businessNo: row.business_no,
    contactName: row.contact_name,
    phone: row.phone,
    accountStatus: row.account_status,
    createdAt: row.created_at,
  };
}
function publicVehicle(row) {
  return {
    id: row.id,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    defaultVehicleTypeId: row.default_vehicle_type_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function visitDateCode(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return key.slice(2).replaceAll('-', '');
}
async function nextPassNo(env, vehicleTypeId, visitAt) {
  const index = vehicleTypes.findIndex((t) => t.id === vehicleTypeId);
  const letter = vehicleTypes[index]?.passPrefix || String.fromCharCode(65 + Math.max(0, index));
  const code = visitDateCode(visitAt);
  if (!code) throw new Error('출입날짜 형식이 올바르지 않습니다.');
  const prefix = `${letter}-${code}-`;
  const latest = await env.DB.prepare('SELECT pass_no FROM requests WHERE pass_no LIKE ? ORDER BY pass_no DESC LIMIT 1')
    .bind(`${prefix}%`).first();
  const last = latest?.pass_no ? Number(String(latest.pass_no).split('-').at(-1)) || 0 : 0;
  return `${prefix}${String(last + 1).padStart(3, '0')}`;
}

function driverExpiry(visitAt) {
  const [y, m, d] = String(visitAt || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d + 1, 14, 59, 59, 999)).toISOString();
}
function isExpired(row) {
  const ms = Date.parse(row.driver_access_expires_at || '');
  return !Number.isFinite(ms) || Date.now() > ms;
}

function detectedType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  return '';
}
function base64FromBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function fileExt(type) {
  return type === 'application/pdf' ? '.pdf' : type === 'image/png' ? '.png' : '.jpg';
}
async function validateFile(file, allowed = new Set(['application/pdf', 'image/jpeg', 'image/png'])) {
  if (!file || typeof file === 'string' || !file.name) throw new Error('파일을 선택해 주세요.');
  if (file.size > MAX_DOC_BYTES) throw new Error(`${file.name} 파일은 5MB를 초과할 수 없습니다.`);
  if (!allowed.has(file.type)) throw new Error(`${file.name} 파일 형식이 올바르지 않습니다.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const actual = detectedType(bytes);
  if (!actual || actual !== file.type) throw new Error(`${file.name} 파일의 실제 형식이 올바르지 않습니다.`);
  return { bytes, type: actual };
}

async function documentsFor(env, requestId) {
  const rows = await env.DB.prepare('SELECT id, label, size, content_type FROM documents WHERE request_id = ? ORDER BY created_at')
    .bind(requestId).all();
  return (rows.results || []).map((d) => ({ id: d.id, label: d.label, size: d.size, contentType: d.content_type, url: `/uploads/${d.id}` }));
}
function parseHistory(row) {
  try { return JSON.parse(row.history || '[]'); } catch { return []; }
}
async function shapeRequest(env, row) {
  return {
    id: row.id,
    passNo: row.pass_no,
    driverUserId: row.driver_user_id,
    companyAccountId: row.company_account_id || '',
    companyVehicleId: row.company_vehicle_id || '',
    temporaryVehicle: !!row.is_temporary_vehicle,
    vehicleTypeId: row.vehicle_type_id,
    vehicleTypeName: row.vehicle_type_name,
    driverName: row.driver_name,
    phone: row.phone,
    vehicleNumber: row.vehicle_number,
    company: row.company,
    purpose: row.purpose,
    visitAt: row.visit_at,
    agreedRequired: !!row.agreed_required,
    agreedOther: !!row.agreed_other,
    status: row.status,
    workflowStatus: row.workflow_status || row.status,
    rejectReason: row.reject_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    safetyConfirmedAt: row.safety_confirmed_at || '',
    photoUploadedAt: row.photo_uploaded_at || '',
    completedAt: row.completed_at || '',
    driverAccessExpiresAt: row.driver_access_expires_at || '',
    createdAt: row.created_at,
    retainUntil: row.retain_until,
    history: parseHistory(row),
    documents: await documentsFor(env, row.id),
  };
}

async function registerCompany(request, env) {
  const body = await request.json().catch(() => ({}));
  const loginId = String(body.loginId || '').trim();
  const companyName = String(body.companyName || '').trim();
  const businessNorm = normBusiness(body.businessNo);
  const contactName = String(body.contactName || '').trim();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');
  if (!companyName || !businessNorm || !loginId || !contactName || !phone || !password) return error('모든 항목을 입력해 주세요.');
  if (businessNorm.length !== 10) return error('사업자등록번호 10자리를 입력해 주세요.');
  if (password.length < 4) return error('비밀번호는 4자 이상이어야 합니다.');
  if (await loginTaken(env, loginId)) return error('이미 사용 중인 로그인 아이디입니다.', 409);
  const businessDup = await env.DB.prepare('SELECT id FROM company_accounts WHERE business_no_norm = ?').bind(businessNorm).first();
  if (businessDup) return error('이미 가입된 사업자등록번호입니다.', 409);

  const { salt, hash } = await hashPassword(password);
  const id = randHex(12);
  const at = nowISO();
  const formattedBusiness = `${businessNorm.slice(0, 3)}-${businessNorm.slice(3, 5)}-${businessNorm.slice(5)}`;
  await env.DB.prepare(`
    INSERT INTO company_accounts
      (id, login_id, login_id_norm, company_name, business_no, business_no_norm,
       contact_name, phone, salt, hash, account_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, loginId, normLogin(loginId), companyName, formattedBusiness, businessNorm, contactName, phone, salt, hash, at).run();
  const token = randHex(24);
  await env.DB.prepare('INSERT INTO company_sessions (token, company_account_id, created_at) VALUES (?, ?, ?)')
    .bind(token, id, at).run();
  const row = await env.DB.prepare('SELECT * FROM company_accounts WHERE id = ?').bind(id).first();
  return json({ token, account: publicAccount(row) }, 201);
}

async function loginCompany(request, env) {
  const body = await request.json().catch(() => ({}));
  const loginId = normLogin(body.loginId);
  const password = String(body.password || '');
  const row = await env.DB.prepare('SELECT * FROM company_accounts WHERE login_id_norm = ?').bind(loginId).first();
  if (!row || row.account_status !== 'active' || !(await verifyPassword(password, row.salt, row.hash))) {
    return error('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
  }
  const token = randHex(24);
  await env.DB.prepare('INSERT INTO company_sessions (token, company_account_id, created_at) VALUES (?, ?, ?)')
    .bind(token, row.id, nowISO()).run();
  return json({ token, account: publicAccount(row) });
}

async function listVehicles(request, env) {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const rows = await env.DB.prepare('SELECT * FROM company_vehicles WHERE company_account_id = ? ORDER BY vehicle_number')
    .bind(auth.account.id).all();
  return json((rows.results || []).map(publicVehicle));
}

async function saveVehicle(request, env, id = '') {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const vehicleNumber = normVehicle(body.vehicleNumber);
  const driverName = String(body.driverName || '').trim();
  const driverPhone = String(body.driverPhone || '').trim();
  const typeId = String(body.defaultVehicleTypeId || '').trim();
  if (!vehicleNumber || !driverName || !driverPhone) return error('차량번호, 기본 운전자, 연락처를 입력해 주세요.');
  if (typeId && !vehicleTypes.some((t) => t.id === typeId)) return error('올바르지 않은 차량 유형입니다.');
  const duplicate = await env.DB.prepare(
    'SELECT id FROM company_vehicles WHERE company_account_id = ? AND vehicle_number = ? AND id <> ?'
  ).bind(auth.account.id, vehicleNumber, id || '').first();
  if (duplicate) return error('이미 등록된 차량번호입니다.', 409);
  const at = nowISO();
  if (id) {
    const result = await env.DB.prepare(`
      UPDATE company_vehicles SET vehicle_number=?, driver_name=?, driver_phone=?, default_vehicle_type_id=?, updated_at=?
       WHERE id=? AND company_account_id=?
    `).bind(vehicleNumber, driverName, driverPhone, typeId, at, id, auth.account.id).run();
    if (!result.meta?.changes) return error('차량을 찾을 수 없습니다.', 404);
  } else {
    id = randHex(10);
    await env.DB.prepare(`
      INSERT INTO company_vehicles
        (id, company_account_id, vehicle_number, driver_name, driver_phone, default_vehicle_type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, auth.account.id, vehicleNumber, driverName, driverPhone, typeId, at, at).run();
  }
  const row = await env.DB.prepare('SELECT * FROM company_vehicles WHERE id = ?').bind(id).first();
  return json(publicVehicle(row));
}

async function deleteVehicle(request, env, id) {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const result = await env.DB.prepare('DELETE FROM company_vehicles WHERE id = ? AND company_account_id = ?')
    .bind(id, auth.account.id).run();
  if (!result.meta?.changes) return error('차량을 찾을 수 없습니다.', 404);
  return json({ ok: true });
}

async function createCompanyRequest(request, env) {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const form = await request.formData().catch(() => null);
  if (!form) return error('신청정보를 확인할 수 없습니다.');
  const get = (k) => String(form.get(k) || '').trim();
  const type = vehicleTypes.find((t) => t.id === get('vehicleTypeId'));
  if (!type) return error('차량 유형을 선택해 주세요.');
  const visitAt = get('visitAt').slice(0, 10);
  if (!visitDateCode(visitAt)) return error('출입일자를 선택해 주세요.');

  const temporary = get('temporaryVehicle') === 'true';
  const vehicleId = temporary ? '' : get('companyVehicleId');
  let vehicleNumber = normVehicle(get('vehicleNumber'));
  let baseDriverName = '';
  let baseDriverPhone = '';
  if (!temporary) {
    const vehicle = await env.DB.prepare('SELECT * FROM company_vehicles WHERE id = ? AND company_account_id = ?')
      .bind(vehicleId, auth.account.id).first();
    if (!vehicle) return error('등록 차량을 선택해 주세요.');
    vehicleNumber = vehicle.vehicle_number;
    baseDriverName = vehicle.driver_name;
    baseDriverPhone = vehicle.driver_phone;
  }
  const driverName = get('driverName') || baseDriverName;
  const driverPhone = get('driverPhone') || baseDriverPhone;
  if (!vehicleNumber || !driverName || !driverPhone) return error('차량번호와 실제 운전자 정보를 입력해 주세요.');

  const files = form.getAll('documents').filter((f) => f && typeof f !== 'string' && f.name);
  const keys = form.getAll('documentKeys').map((v) => String(v || ''));
  if (files.length !== keys.length) return error('첨부서류 정보를 확인할 수 없습니다.');
  const required = (type.requiredDocuments || []).filter((d) => d.required && d.key !== 'sitePhoto');
  const included = new Set(keys);
  for (const doc of required) if (!included.has(doc.key)) return error(`${doc.label} 서류를 첨부해 주세요.`);

  const validated = [];
  for (let i = 0; i < files.length; i++) {
    const doc = (type.requiredDocuments || []).find((d) => d.key === keys[i]);
    if (!doc || doc.key === 'sitePhoto') continue;
    try {
      const checked = await validateFile(files[i]);
      validated.push({ doc, ...checked });
    } catch (e) { return error(e.message); }
  }

  const created = nowISO();
  const retainDate = new Date(created);
  retainDate.setFullYear(retainDate.getFullYear() + 3);
  const retainUntil = retainDate.toISOString();
  const id = randHex(10);
  const passNo = await nextPassNo(env, type.id, visitAt);
  const history = JSON.stringify([{ at: created, action: 'created', by: auth.account.company_name }]);
  await env.DB.prepare(`
    INSERT INTO requests (
      id, pass_no, driver_user_id, vehicle_type_id, vehicle_type_name, driver_name, phone,
      vehicle_number, company, purpose, visit_at, agreed_required, agreed_other,
      status, workflow_status, history, created_at, retain_until,
      company_account_id, company_vehicle_id, is_temporary_vehicle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'pending', 'pending', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, passNo, auth.account.id, type.id, type.name, driverName, driverPhone,
    vehicleNumber, auth.account.company_name, get('purpose') || type.name, visitAt,
    history, created, retainUntil, auth.account.id, vehicleId, temporary ? 1 : 0,
  ).run();

  for (const item of validated) {
    await env.DB.prepare(`
      INSERT INTO documents (id, request_id, label, content_type, data, size, created_at, retain_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      randHex(10), id, `${item.doc.label}${fileExt(item.type)}`, item.type,
      base64FromBytes(item.bytes), item.bytes.byteLength, created, retainUntil,
    ).run();
  }
  const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  return json(await shapeRequest(env, row), 201);
}

async function listCompanyRequests(request, env) {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const rows = await env.DB.prepare('SELECT * FROM requests WHERE company_account_id = ? ORDER BY created_at DESC')
    .bind(auth.account.id).all();
  const result = [];
  for (const row of rows.results || []) result.push(await shapeRequest(env, row));
  return json(result);
}

async function companyRequestDetail(request, env, id) {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ? AND company_account_id = ?').bind(id, auth.account.id).first();
  if (!row) return error('신청을 찾을 수 없습니다.', 404);
  return json(await shapeRequest(env, row));
}

async function deleteCompanyRequest(request, env, id) {
  const auth = await requireCompany(request, env); if (auth.error) return auth.error;
  const row = await env.DB.prepare('SELECT status FROM requests WHERE id = ? AND company_account_id = ?').bind(id, auth.account.id).first();
  if (!row) return error('신청을 찾을 수 없습니다.', 404);
  if (row.status !== 'pending') return error('승인 대기 중인 신청만 취소할 수 있습니다.', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM documents WHERE request_id = ?').bind(id),
    env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function reviewCompanyRequest(request, env, id, action) {
  const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!row || !row.company_account_id) return null;
  const auth = await requireStaff(request, env, true); if (auth.error) return auth.error;
  if (row.status !== 'pending') return error('이미 처리된 신청입니다.', 409);
  const at = nowISO();
  const history = parseHistory(row);
  if (action === 'reject') {
    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || '').trim() || '자재센터 직원 반려';
    history.push({ at, action: 'rejected', by: auth.user.name, reason });
    await env.DB.prepare(`
      UPDATE requests SET status='rejected', workflow_status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=?, history=? WHERE id=?
    `).bind(reason, auth.user.name, at, JSON.stringify(history), id).run();
  } else {
    const token = randHex(24);
    const expires = driverExpiry(row.visit_at);
    history.push({ at, action: 'approved', by: auth.user.name });
    await env.DB.prepare(`
      UPDATE requests SET status='approved', workflow_status='safety_pending', reject_reason='',
        reviewed_by=?, reviewed_at=?, driver_access_token=?, driver_access_expires_at=?, history=? WHERE id=?
    `).bind(auth.user.name, at, token, expires, JSON.stringify(history), id).run();
  }
  const updated = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  return json(await shapeRequest(env, updated));
}

function routeImage(typeId) {
  if (typeId === 'construction') return '/route-images/construction.jpg?v=20260806-002';
  if (typeId === 'scrap') return '/route-images/scrap.jpg?v=20260802-102';
  if (typeId === 'pcbs') return '/route-images/pcbs.jpg?v=20260802-102';
  return '/route-images/transport.jpg?v=20260802-102';
}
async function driverAccessRow(env, token) {
  if (!token || token.length < 32) return null;
  return env.DB.prepare('SELECT * FROM requests WHERE driver_access_token = ? AND company_account_id <> ?').bind(token, '').first();
}
async function driverAccessPayload(env, row) {
  const type = vehicleTypes.find((t) => t.id === row.vehicle_type_id);
  return {
    id: row.id,
    passNo: row.pass_no,
    company: row.company,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    visitAt: row.visit_at,
    vehicleTypeId: row.vehicle_type_id,
    vehicleTypeName: row.vehicle_type_name,
    workflowStatus: row.workflow_status,
    safetyConfirmedAt: row.safety_confirmed_at || '',
    completedAt: row.completed_at || '',
    expiresAt: row.driver_access_expires_at || '',
    requiredSafetyRules: type?.requiredSafetyRules || [],
    otherSafetyRules: type?.otherSafetyRules || [],
    route: type?.route || { summary: '', steps: [] },
    routeImage: routeImage(row.vehicle_type_id),
    canConfirmSafety: row.workflow_status === 'safety_pending',
    canUploadPhoto: row.workflow_status === 'photo_pending',
  };
}

async function getDriverAccess(request, env, token) {
  const row = await driverAccessRow(env, token);
  if (!row) return error('유효하지 않은 출입 링크입니다.', 404);
  if (isExpired(row)) return error('기사 전용 링크의 사용기한이 만료되었습니다.', 410);
  return json(await driverAccessPayload(env, row));
}

async function confirmDriverSafety(request, env, token) {
  const row = await driverAccessRow(env, token);
  if (!row) return error('유효하지 않은 출입 링크입니다.', 404);
  if (isExpired(row)) return error('기사 전용 링크의 사용기한이 만료되었습니다.', 410);
  if (row.workflow_status !== 'safety_pending') {
    if (row.workflow_status === 'photo_pending' || row.workflow_status === 'completed') return json(await driverAccessPayload(env, row));
    return error('안전수칙을 확인할 수 없는 상태입니다.', 409);
  }
  const at = nowISO();
  const history = parseHistory(row); history.push({ at, action: 'driver_safety_confirmed', by: row.driver_name });
  await env.DB.prepare(`
    UPDATE requests SET workflow_status='photo_pending', agreed_required=1, agreed_other=1,
      safety_confirmed_at=?, history=? WHERE id=?
  `).bind(at, JSON.stringify(history), row.id).run();
  const updated = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(row.id).first();
  return json(await driverAccessPayload(env, updated));
}

async function uploadDriverPhoto(request, env, token) {
  const row = await driverAccessRow(env, token);
  if (!row) return error('유효하지 않은 출입 링크입니다.', 404);
  if (isExpired(row)) return error('기사 전용 링크의 사용기한이 만료되었습니다.', 410);
  if (row.workflow_status === 'completed') return error('이미 최종 완료된 신청입니다.', 409);
  if (row.workflow_status !== 'photo_pending') return error('먼저 안전수칙을 확인해 주세요.', 409);
  const form = await request.formData().catch(() => null);
  const file = form?.get('photo');
  let checked;
  try { checked = await validateFile(file, new Set(['image/jpeg', 'image/png'])); }
  catch (e) { return error(e.message); }
  const at = nowISO();
  const ext = fileExt(checked.type);
  const history = parseHistory(row); history.push({ at, action: 'site_photo_uploaded', by: row.driver_name });
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO documents (id, request_id, label, content_type, data, size, created_at, retain_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(randHex(10), row.id, `현장사진${ext}`, checked.type, base64FromBytes(checked.bytes), checked.bytes.byteLength, at, row.retain_until),
    env.DB.prepare(`
      UPDATE requests SET workflow_status='completed', photo_uploaded_at=?, completed_at=?, history=? WHERE id=?
    `).bind(at, at, JSON.stringify(history), row.id),
  ]);
  const updated = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(row.id).first();
  return json(await driverAccessPayload(env, updated));
}

async function companyRequestMeta(request, env, id) {
  const auth = await requireStaff(request, env); if (auth.error) return auth.error;
  const row = await env.DB.prepare('SELECT * FROM requests WHERE id = ? AND company_account_id <> ?').bind(id, '').first();
  if (!row) return error('업체 신청이 아닙니다.', 404);
  const origin = new URL(request.url).origin;
  const link = row.driver_access_token ? `${origin}/#driverAccess=${encodeURIComponent(row.driver_access_token)}` : '';
  return json({
    id: row.id,
    passNo: row.pass_no,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    driverPhone: row.phone,
    visitAt: row.visit_at,
    company: row.company,
    workflowStatus: row.workflow_status,
    driverLink: link,
    expiresAt: row.driver_access_expires_at || '',
  });
}

async function listCompanies(request, env) {
  const auth = await requireStaff(request, env); if (auth.error) return auth.error;
  const rows = await env.DB.prepare(`
    SELECT a.id, a.login_id, a.company_name, a.business_no, a.contact_name, a.phone,
           a.contract_type_id, a.account_status, a.created_at,
           COUNT(v.id) AS vehicle_count
      FROM company_accounts a LEFT JOIN company_vehicles v ON v.company_account_id = a.id
     GROUP BY a.id ORDER BY a.company_name, a.login_id
  `).all();
  return json((rows.results || []).map((r) => ({
    id: r.id, loginId: r.login_id, companyName: r.company_name, businessNo: r.business_no,
    contactName: r.contact_name, phone: r.phone, contractTypeId: r.contract_type_id || '',
    accountStatus: r.account_status,
    vehicleCount: Number(r.vehicle_count || 0), createdAt: r.created_at,
  })));
}

async function deleteCompany(request, env, id) {
  const auth = await requireStaff(request, env, true); if (auth.error) return auth.error;
  const row = await env.DB.prepare('SELECT id FROM company_accounts WHERE id = ?').bind(id).first();
  if (!row) return error('업체 계정을 찾을 수 없습니다.', 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM company_sessions WHERE company_account_id = ?').bind(id),
    env.DB.prepare('DELETE FROM company_vehicles WHERE company_account_id = ?').bind(id),
    env.DB.prepare('DELETE FROM company_accounts WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

export function isCompanyFlowPath(path) {
  return path.startsWith('/api/company/')
    || path.startsWith('/api/driver-access/')
    || path.startsWith('/api/admin/company-requests/')
    || path.startsWith('/api/admin/companies');
}

export async function handleCompanyFlowApi(request, env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/api/auth/register') {
    const body = await request.clone().json().catch(() => ({}));
    if (body.loginId && await env.DB.prepare('SELECT id FROM company_accounts WHERE login_id_norm = ?').bind(normLogin(body.loginId)).first()) {
      return error('이미 사용 중인 로그인 아이디입니다.', 409);
    }
    return null;
  }
  if (method === 'POST' && path === '/api/staff-applications') {
    const body = await request.clone().json().catch(() => ({}));
    if (body.employeeNo && await env.DB.prepare('SELECT id FROM company_accounts WHERE login_id_norm = ?').bind(normLogin(body.employeeNo)).first()) {
      return error('이미 업체 계정에서 사용 중인 아이디입니다.', 409);
    }
    return null;
  }

  const review = path.match(/^\/api\/requests\/([^/]+)\/(approve|reject)$/);
  if (method === 'POST' && review) return reviewCompanyRequest(request, env, decodeURIComponent(review[1]), review[2]);

  if (method === 'GET' && path === '/api/company/check-login') {
    const value = String(url.searchParams.get('loginId') || '').trim();
    if (!value) return error('로그인 아이디를 입력해 주세요.');
    return json({ available: !(await loginTaken(env, value)) });
  }
  if (method === 'GET' && path === '/api/company/check-business') {
    const value = normBusiness(url.searchParams.get('businessNo'));
    if (value.length !== 10) return error('사업자등록번호 10자리를 입력해 주세요.');
    const row = await env.DB.prepare('SELECT id FROM company_accounts WHERE business_no_norm = ?').bind(value).first();
    return json({ available: !row });
  }
  if (method === 'POST' && path === '/api/company/register') return registerCompany(request, env);
  if (method === 'POST' && path === '/api/company/login') return loginCompany(request, env);
  if (method === 'POST' && path === '/api/company/logout') {
    const auth = await requireCompany(request, env); if (auth.error) return auth.error;
    await env.DB.prepare('DELETE FROM company_sessions WHERE token = ?').bind(auth.account._token).run();
    return json({ ok: true });
  }
  if (method === 'GET' && path === '/api/company/me') {
    const auth = await requireCompany(request, env); if (auth.error) return auth.error;
    return json({ account: publicAccount(auth.account) });
  }
  if (method === 'GET' && path === '/api/company/vehicles') return listVehicles(request, env);
  if (method === 'POST' && path === '/api/company/vehicles') return saveVehicle(request, env);
  const vehicleMatch = path.match(/^\/api\/company\/vehicles\/([^/]+)$/);
  if (vehicleMatch && method === 'PUT') return saveVehicle(request, env, decodeURIComponent(vehicleMatch[1]));
  if (vehicleMatch && method === 'DELETE') return deleteVehicle(request, env, decodeURIComponent(vehicleMatch[1]));

  if (method === 'POST' && path === '/api/company/requests') return createCompanyRequest(request, env);
  if (method === 'GET' && path === '/api/company/requests') return listCompanyRequests(request, env);
  const requestMatch = path.match(/^\/api\/company\/requests\/([^/]+)$/);
  if (requestMatch && method === 'GET') return companyRequestDetail(request, env, decodeURIComponent(requestMatch[1]));
  if (requestMatch && method === 'DELETE') return deleteCompanyRequest(request, env, decodeURIComponent(requestMatch[1]));

  const driverMatch = path.match(/^\/api\/driver-access\/([^/]+)$/);
  if (driverMatch && method === 'GET') return getDriverAccess(request, env, decodeURIComponent(driverMatch[1]));
  const safetyMatch = path.match(/^\/api\/driver-access\/([^/]+)\/confirm-safety$/);
  if (safetyMatch && method === 'POST') return confirmDriverSafety(request, env, decodeURIComponent(safetyMatch[1]));
  const photoMatch = path.match(/^\/api\/driver-access\/([^/]+)\/photo$/);
  if (photoMatch && method === 'POST') return uploadDriverPhoto(request, env, decodeURIComponent(photoMatch[1]));

  const metaMatch = path.match(/^\/api\/admin\/company-requests\/([^/]+)\/meta$/);
  if (metaMatch && method === 'GET') return companyRequestMeta(request, env, decodeURIComponent(metaMatch[1]));
  if (method === 'GET' && path === '/api/admin/companies') return listCompanies(request, env);
  const companyMatch = path.match(/^\/api\/admin\/companies\/([^/]+)$/);
  if (companyMatch && method === 'DELETE') return deleteCompany(request, env, decodeURIComponent(companyMatch[1]));

  return null;
}
