// 자재센터 출입 신청 Worker (단일 파일)
// 과거 worker.js + worker-v2..v10 의 "레이어 오버라이드" 체인을 동작 보존하며 하나로 합침.
// 실행 순서(바깥→안): v10 → v9 → v8 → v7 → v6 → v5 → v4 → v3 → v2 → base
// 각 레이어는 자체 라우트/처리 후 안쪽 레이어로 위임한다. 레이어는 블록 스코프로
// 격리되어 헬퍼 이름이 서로 충돌하지 않는다. 기능별 모듈(company-*, password-reset-*,
// driver-account-*, security-hardening 등)은 그대로 import 한다.

import { Hono } from 'hono';
import vehicleTypes from '../data/vehicleTypes.js';
import { handlePasswordResetApi } from './password-reset-api-v2.js';
import { handleDriverAccountAdminV2 } from './driver-account-admin-v2.js';
import { preflightSecurity, withSecurityHeaders } from './security-hardening.js';
import { handleDriverAccountStaffApi } from './driver-account-staff-api.js';
import { handlePasswordResetStaffApi } from './password-reset-staff-api.js';
import { handleCompanyFlowApi, isCompanyFlowPath } from './company-flow-api.js';
import { handleCompanyRegistrationV2 } from './company-registration-v2.js';
import { handleCompanyContractRequestV2 } from './company-contract-request-v2.js';
import { handleCompanyDriverShareV2 } from './company-driver-share-v2.js';
import { handleCompanyDriverAccessV3 } from './company-driver-access-v3.js';

let LAYER_base, LAYER_v2, LAYER_v3, LAYER_v4, LAYER_v5, LAYER_v6, LAYER_v7, LAYER_v8, LAYER_v9, LAYER_v10;

// ======================================================================
// 레이어: worker.js  →  LAYER_base
// ======================================================================
{
/**
 * 자재센터 출입 사전승인 앱 - Cloudflare Workers 백엔드 (Hono + D1)
 *
 *  - D1(SQLite): 사용자/세션/신청 + 첨부 서류(base64) 저장 (R2 미사용, 카드 불필요)
 *  - 비밀번호  : Web Crypto PBKDF2-SHA256 (Workers 런타임 호환)
 *  - 정적 파일 : public/ (wrangler [assets] 로 서빙)
 *  - 서류는 신청 기록과 함께 보존기간(retain_until)까지 유지
 */

const RETENTION_YEARS = 3;
const PBKDF2_ITERS = 100000;

const app = new Hono();

// ---- 유틸 ----------------------------------------------------------------
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
const randHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
const nowISO = () => new Date().toISOString();

// 첨부 서류는 R2 없이 D1에 base64 로 저장합니다 (결제카드 불필요).
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 개별 서류 최대 5MB (업로드 시 이미지 자동 압축)
function base64FromBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function bytesFromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMaterial, 256);
  return toHex(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt) };
}
async function verifyPassword(password, saltHex, hashHex) {
  const candidate = await derive(password, fromHex(saltHex));
  if (candidate.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

function addYears(iso, years) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

function visitDateCode(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return key.slice(2).replaceAll('-', '');
}

async function nextPassNo(env, vehicleTypeId, visitAt) {
  // 신청번호 접두 알파벳은 방문 목적 순서(A~E)를 따른다.
  // 각 차량유형에 passPrefix 를 명시(없으면 배열 순서로 대체).
  const typeIndex = vehicleTypes.findIndex((type) => type.id === vehicleTypeId);
  const letter = vehicleTypes[typeIndex]?.passPrefix
    || String.fromCharCode(65 + Math.max(0, typeIndex));
  const dateCode = visitDateCode(visitAt);
  if (!dateCode) throw new Error('출입날짜 형식이 올바르지 않습니다.');
  const prefix = `${letter}-${dateCode}-`;
  const latest = await env.DB.prepare(
    'SELECT pass_no FROM requests WHERE pass_no LIKE ? ORDER BY pass_no DESC LIMIT 1')
    .bind(`${prefix}%`).first();
  const lastSequence = latest?.pass_no ? Number(String(latest.pass_no).split('-').at(-1)) || 0 : 0;
  return `${prefix}${String(lastSequence + 1).padStart(3, '0')}`;
}

const publicUser = (u) => ({
  id: u.id, role: u.role, staffRole: u.staff_role, loginId: u.login_id, name: u.name,
  phone: u.phone, company: u.company, defaultVehicleNumber: u.default_vehicle_number,
  defaultVehicleTypeId: u.default_vehicle_type_id,
});

// 신청 레코드를 기존 프런트엔드가 기대하는 형태로 변환
async function shapeRequest(env, row) {
  const docs = await env.DB.prepare(
    'SELECT id, label, size, content_type FROM documents WHERE request_id = ?').bind(row.id).all();
  let history = [];
  try { history = JSON.parse(row.history || '[]'); } catch { /* noop */ }
  return {
    id: row.id, passNo: row.pass_no, driverUserId: row.driver_user_id,
    vehicleTypeId: row.vehicle_type_id, vehicleTypeName: row.vehicle_type_name,
    driverName: row.driver_name, phone: row.phone, vehicleNumber: row.vehicle_number,
    company: row.company, purpose: row.purpose, visitAt: row.visit_at,
    agreedRequired: !!row.agreed_required, agreedOther: !!row.agreed_other,
    status: row.status, rejectReason: row.reject_reason,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    createdAt: row.created_at, retainUntil: row.retain_until,
    history,
    documents: (docs.results || []).map((d) => ({
      label: d.label, url: `/uploads/${d.id}`, size: d.size, contentType: d.content_type,
    })),
  };
}

// ---- 인증 미들웨어 -------------------------------------------------------
async function getUser(c) {
  const auth = c.req.header('Authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) token = c.req.query('t') || null; // CSV 다운로드 등 헤더를 못 붙이는 경우
  if (!token) return null;
  const sess = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!sess) return null;
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(sess.user_id).first();
  if (!user) return null;
  user._token = token;
  return user;
}
function requireAuth(role) {
  return async (c, next) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);
    if (role && user.role !== role) return c.json({ error: '권한이 없습니다.' }, 403);
    c.set('user', user);
    await next();
  };
}
function requireStaff(minRole) {
  return async (c, next) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);
    if (user.role !== 'staff') return c.json({ error: '직원 전용 기능입니다.' }, 403);
    if (minRole === 'admin' && user.staff_role !== 'admin') {
      return c.json({ error: '관리자 권한이 필요합니다.' }, 403);
    }
    c.set('user', user);
    await next();
  };
}

// ==========================================================================
// 인증 API
// ==========================================================================
app.post('/api/auth/register', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.loginId || !b.password || !b.name || !b.phone) {
    return c.json({ error: '모든 항목을 입력해 주세요.' }, 400);
  }
  if (String(b.password).length < 4) return c.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE login_id = ?').bind(b.loginId).first();
  if (exists) return c.json({ error: '이미 사용 중인 차량번호(아이디)입니다.' }, 409);

  const { salt, hash } = await hashPassword(b.password);
  const id = randHex(8);
  await c.env.DB.prepare(
    `INSERT INTO users (id, role, login_id, name, salt, hash, phone, company,
      default_vehicle_number, default_vehicle_type_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, 'driver', b.loginId, b.name, salt, hash, b.phone, b.company || '',
      b.loginId, b.defaultVehicleTypeId || '', nowISO()).run();

  const token = randHex(24);
  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)')
    .bind(token, id, nowISO()).run();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return c.json({ token, user: publicUser(user) }, 201);
});

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE login_id = ?').bind(b.loginId || '').first();
  if (!user || !(await verifyPassword(b.password || '', user.salt, user.hash))) {
    return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }
  const token = randHex(24);
  await c.env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)')
    .bind(token, user.id, nowISO()).run();
  return c.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', requireAuth(), async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(c.get('user')._token).run();
  return c.json({ ok: true });
});

app.get('/api/auth/me', requireAuth(), (c) => c.json({ user: publicUser(c.get('user')) }));

app.put('/api/auth/profile', requireAuth('driver'), async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = c.get('user');
  if (!b.name || !b.phone) return c.json({ error: '이름과 연락처를 입력해 주세요.' }, 400);
  if (b.password && String(b.password).length < 4) {
    return c.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400);
  }

  const fields = {
    name: b.name ?? u.name,
    phone: b.phone ?? u.phone,
    company: b.company ?? u.company,
    default_vehicle_type_id: b.defaultVehicleTypeId ?? u.default_vehicle_type_id,
  };

  if (b.password) {
    const { salt, hash } = await hashPassword(String(b.password));
    await c.env.DB.prepare(
      `UPDATE users SET name=?, phone=?, company=?, default_vehicle_type_id=?, salt=?, hash=?
       WHERE id=?`)
      .bind(fields.name, fields.phone, fields.company, fields.default_vehicle_type_id,
        salt, hash, u.id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE users SET name=?, phone=?, company=?, default_vehicle_type_id=? WHERE id=?`)
      .bind(fields.name, fields.phone, fields.company, fields.default_vehicle_type_id, u.id).run();
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
  return c.json({ user: publicUser(user) });
});

// ==========================================================================
// 차량 유형 / 보존 정책
// ==========================================================================
app.get('/api/vehicle-types', (c) => c.json(vehicleTypes));
app.get('/api/retention', (c) => c.json({ retentionYears: RETENTION_YEARS }));

// ==========================================================================
// 출입 신청
// ==========================================================================
app.post('/api/requests', requireAuth('driver'), async (c) => {
  const form = await c.req.formData();
  const get = (k) => form.get(k);
  const vType = vehicleTypes.find((v) => v.id === get('vehicleTypeId'));
  if (!vType) return c.json({ error: '유효하지 않은 차량 유형입니다.' }, 400);
  if (!get('driverName') || !get('phone') || !get('vehicleNumber')) {
    return c.json({ error: '기사명, 연락처, 차량번호는 필수입니다.' }, 400);
  }
  if (!visitDateCode(get('visitAt'))) {
    return c.json({ error: '출입날짜를 선택해 주세요.' }, 400);
  }
  if (String(get('agreedRequired')) !== 'true') {
    return c.json({ error: '필수 안전수칙 동의가 필요합니다.' }, 400);
  }

  const user = c.get('user');
  const created = nowISO();
  const retainUntil = addYears(created, RETENTION_YEARS);
  const id = randHex(8);
  const passNo = await nextPassNo(c.env, vType.id, get('visitAt'));
  const history = JSON.stringify([{ at: created, action: 'created', by: user.name }]);

  await c.env.DB.prepare(
    `INSERT INTO requests (id, pass_no, driver_user_id, vehicle_type_id, vehicle_type_name,
      driver_name, phone, vehicle_number, company, purpose, visit_at,
      agreed_required, agreed_other, status, history, created_at, retain_until)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?,?,?)`)
    .bind(id, passNo, user.id, vType.id, vType.name,
      get('driverName'), get('phone'), get('vehicleNumber'), get('company') || '',
      get('purpose') || '', get('visitAt') || '',
      1, String(get('agreedOther')) === 'true' ? 1 : 0, history, created, retainUntil).run();

  // 서류를 D1에 base64 로 저장 (신청 기록과 함께 보존기간까지 유지)
  const files = form.getAll('documents');
  for (const file of files) {
    if (!file || typeof file === 'string' || !file.name) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_DOC_BYTES) continue; // 과대 파일 방지 (클라이언트에서 압축)
    await c.env.DB.prepare(
      `INSERT INTO documents (id, request_id, label, content_type, data, size, created_at, retain_until)
       VALUES (?,?,?,?,?,?,?,?)`)
      .bind(randHex(8), id, file.name, file.type || 'application/octet-stream',
        base64FromBytes(bytes), bytes.byteLength, created, retainUntil).run();
  }

  const row = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  return c.json(await shapeRequest(c.env, row), 201);
});

app.get('/api/my/requests', requireAuth('driver'), async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE driver_user_id = ? ORDER BY created_at DESC')
    .bind(c.get('user').id).all();
  const out = [];
  for (const r of rows.results || []) out.push(await shapeRequest(c.env, r));
  return c.json(out);
});

// CSV 내보내기 — '/:id' 보다 먼저 선언 (관리자 전용)
app.get('/api/requests/export.csv', requireStaff('admin'), async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  const cols = ['pass_no', 'created_at', 'vehicle_type_name', 'driver_name', 'phone',
    'vehicle_number', 'company', 'purpose', 'visit_at', 'status', 'reviewed_by',
    'reviewed_at', 'reject_reason', 'retain_until'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const body = (rows.results || []).map((r) => cols.map((k) => esc(r[k])).join(',')).join('\n');
  const csv = '\ufeff' + cols.join(',') + '\n' + body;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="entry-records.csv"',
    },
  });
});

app.get('/api/requests/:id', requireAuth(), async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: '신청을 찾을 수 없습니다.' }, 404);
  if (user.role === 'driver' && row.driver_user_id !== user.id) {
    return c.json({ error: '권한이 없습니다.' }, 403);
  }
  return c.json(await shapeRequest(c.env, row));
});

app.get('/api/requests', requireStaff(), async (c) => {
  const status = c.req.query('status');
  const rows = status
    ? await c.env.DB.prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC').bind(status).all()
    : await c.env.DB.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  const out = [];
  for (const r of rows.results || []) out.push(await shapeRequest(c.env, r));
  return c.json(out);
});

async function review(c, status) {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: '신청을 찾을 수 없습니다.' }, 404);
  const user = c.get('user');
  const at = nowISO();
  const reason = status === 'rejected'
    ? ((await c.req.json().catch(() => ({}))).reason || '') : '';
  let history = [];
  try { history = JSON.parse(row.history || '[]'); } catch { /* noop */ }
  history.push({ at, action: status, by: user.name, reason });
  await c.env.DB.prepare(
    'UPDATE requests SET status=?, reviewed_by=?, reviewed_at=?, reject_reason=?, history=? WHERE id=?')
    .bind(status, user.name, at, reason, JSON.stringify(history), id).run();
  const updated = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  return c.json(await shapeRequest(c.env, updated));
}
app.post('/api/requests/:id/approve', requireStaff(), (c) => review(c, 'approved'));
app.post('/api/requests/:id/reject', requireStaff(), (c) => review(c, 'rejected'));

// ==========================================================================
// 서류 파일 서빙 (D1 에 저장된 base64 를 복원해 반환). 무작위 id 기반 접근.
// ==========================================================================
app.get('/uploads/:id', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT content_type, data FROM documents WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ error: '파일을 찾을 수 없습니다.' }, 404);
  const bytes = bytesFromBase64(row.data);
  const headers = new Headers();
  headers.set('Content-Type', row.content_type || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(bytes, { headers });
});

// API/uploads 외의 요청은 정적 자산(public/)으로 위임
app.all('*', async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.notFound();
});

LAYER_base = app;
}

// ======================================================================
// 레이어: worker-v2.js  →  LAYER_v2
// ======================================================================
{
  const legacyApp = LAYER_base;

const app = new Hono();
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const TEST_RESET_KEY = 'test-request-reset-20260731-01';
const PBKDF2_ITERS = 100000;
const nowISO = () => new Date().toISOString();
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
const randHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

function base64FromBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function derive(password, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMaterial, 256);
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt) };
}

function validVisitDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10));
}

let staffSchemaReady;
async function ensureStaffSchema(env) {
  if (!staffSchemaReady) {
    staffSchemaReady = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_applications (
        id TEXT PRIMARY KEY,
        employee_no TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        salt TEXT NOT NULL,
        hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by TEXT DEFAULT '',
        reviewed_at TEXT DEFAULT '',
        created_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS staff_disabled (
        user_id TEXT PRIMARY KEY,
        disabled_at TEXT NOT NULL,
        disabled_by TEXT NOT NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_staff_app_status ON staff_applications(status)'),
    ]).catch((error) => {
      staffSchemaReady = null;
      throw error;
    });
  }
  return staffSchemaReady;
}

async function resetTestRequestsOnce(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    env.DB.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, 'pending')").bind(TEST_RESET_KEY),
    env.DB.prepare("DELETE FROM documents WHERE EXISTS (SELECT 1 FROM app_meta WHERE key = ? AND value = 'pending')").bind(TEST_RESET_KEY),
    env.DB.prepare("DELETE FROM requests WHERE EXISTS (SELECT 1 FROM app_meta WHERE key = ? AND value = 'pending')").bind(TEST_RESET_KEY),
    env.DB.prepare("UPDATE app_meta SET value = 'done' WHERE key = ? AND value = 'pending'").bind(TEST_RESET_KEY),
  ]);
}

app.use('*', async (c, next) => {
  await Promise.all([resetTestRequestsOnce(c.env), ensureStaffSchema(c.env)]);

  if (c.req.method === 'POST' && new URL(c.req.url).pathname === '/api/auth/login') {
    const body = await c.req.raw.clone().json().catch(() => ({}));
    const loginId = String(body.loginId || '').trim();
    if (loginId) {
      const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE login_id = ?').bind(loginId).first();
      if (user?.role === 'staff') {
        const disabled = await c.env.DB.prepare('SELECT user_id FROM staff_disabled WHERE user_id = ?').bind(user.id).first();
        if (disabled) return c.json({ error: '사용이 중지된 직원 계정입니다. 관리자에게 문의하세요.' }, 403);
      } else if (!user) {
        const application = await c.env.DB.prepare(
          'SELECT status FROM staff_applications WHERE employee_no = ? ORDER BY created_at DESC LIMIT 1')
          .bind(loginId).first();
        if (application?.status === 'pending') {
          return c.json({ error: '직원 가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.' }, 403);
        }
        if (application?.status === 'rejected') {
          return c.json({ error: '직원 가입 신청이 반려되었습니다. 관리자에게 문의하세요.' }, 403);
        }
      }
    }
  }

  await next();
});

async function getUser(c) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return null;
  return c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
}

async function getDriver(c) {
  const user = await getUser(c);
  return user?.role === 'driver' ? user : null;
}

async function requireAdmin(c) {
  const user = await getUser(c);
  if (!user) return { error: c.json({ error: '로그인이 필요합니다.' }, 401) };
  if (user.role !== 'staff' || user.staff_role !== 'admin') {
    return { error: c.json({ error: '관리자 권한이 필요합니다.' }, 403) };
  }
  return { user };
}

async function shapeRequest(env, row) {
  const docs = await env.DB.prepare(
    'SELECT id, label, size, content_type FROM documents WHERE request_id = ?')
    .bind(row.id).all();
  let history = [];
  try { history = JSON.parse(row.history || '[]'); } catch { /* noop */ }
  return {
    id: row.id,
    passNo: row.pass_no,
    driverUserId: row.driver_user_id,
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
    rejectReason: row.reject_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    retainUntil: row.retain_until,
    history,
    documents: (docs.results || []).map((d) => ({
      label: d.label,
      url: `/uploads/${d.id}`,
      size: d.size,
      contentType: d.content_type,
    })),
  };
}

// 직원 회원가입 신청: 사번은 로그인 아이디로 사용하며 승인 전에는 users 테이블에 생성하지 않는다.
app.post('/api/staff-applications', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const employeeNo = String(body.employeeNo || '').trim();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  if (!/^\d{4,12}$/.test(employeeNo)) return c.json({ error: '사번은 숫자 4~12자리로 입력해 주세요.' }, 400);
  if (!name) return c.json({ error: '이름을 입력해 주세요.' }, 400);
  if (password.length < 8) return c.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400);

  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE login_id = ?').bind(employeeNo).first();
  if (existingUser) return c.json({ error: '이미 사용 중인 사번입니다.' }, 409);
  const existingApplication = await c.env.DB.prepare(
    "SELECT id, status FROM staff_applications WHERE employee_no = ? AND status IN ('pending','approved') LIMIT 1")
    .bind(employeeNo).first();
  if (existingApplication?.status === 'pending') return c.json({ error: '이미 승인 대기 중인 사번입니다.' }, 409);
  if (existingApplication?.status === 'approved') return c.json({ error: '이미 승인된 직원 계정입니다.' }, 409);

  const { salt, hash } = await hashPassword(password);
  const id = randHex(12);
  await c.env.DB.prepare(
    `INSERT INTO staff_applications (id, employee_no, name, salt, hash, status, created_at)
     VALUES (?,?,?,?,?,'pending',?)
     ON CONFLICT(employee_no) DO UPDATE SET
       name=excluded.name, salt=excluded.salt, hash=excluded.hash, status='pending',
       reviewed_by='', reviewed_at='', created_at=excluded.created_at`)
    .bind(id, employeeNo, name, salt, hash, nowISO()).run();
  return c.json({ ok: true, status: 'pending' }, 201);
});

app.get('/api/admin/staff-applications', async (c) => {
  const auth = await requireAdmin(c); if (auth.error) return auth.error;
  const rows = await c.env.DB.prepare(
    `SELECT id, employee_no, name, status, reviewed_by, reviewed_at, created_at
       FROM staff_applications ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`).all();
  return c.json((rows.results || []).map((row) => ({
    id: row.id, employeeNo: row.employee_no, name: row.name, status: row.status,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, createdAt: row.created_at,
  })));
});

app.post('/api/admin/staff-applications/:id/approve', async (c) => {
  const auth = await requireAdmin(c); if (auth.error) return auth.error;
  const application = await c.env.DB.prepare('SELECT * FROM staff_applications WHERE id = ?').bind(c.req.param('id')).first();
  if (!application) return c.json({ error: '가입 신청을 찾을 수 없습니다.' }, 404);
  if (application.status !== 'pending') return c.json({ error: '이미 처리된 가입 신청입니다.' }, 409);
  const duplicate = await c.env.DB.prepare('SELECT id FROM users WHERE login_id = ?').bind(application.employee_no).first();
  if (duplicate) return c.json({ error: '동일한 사번의 계정이 이미 존재합니다.' }, 409);

  const userId = randHex(8);
  const at = nowISO();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, role, staff_role, login_id, name, salt, hash, phone, company,
        default_vehicle_number, default_vehicle_type_id, created_at)
       VALUES (?, 'staff', 'approver', ?, ?, ?, ?, '', '', '', '', ?)`)
      .bind(userId, application.employee_no, application.name, application.salt, application.hash, at),
    c.env.DB.prepare(
      "UPDATE staff_applications SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?")
      .bind(auth.user.name, at, application.id),
  ]);
  return c.json({ ok: true });
});

app.post('/api/admin/staff-applications/:id/reject', async (c) => {
  const auth = await requireAdmin(c); if (auth.error) return auth.error;
  const at = nowISO();
  const result = await c.env.DB.prepare(
    "UPDATE staff_applications SET status='rejected', reviewed_by=?, reviewed_at=? WHERE id=? AND status='pending'")
    .bind(auth.user.name, at, c.req.param('id')).run();
  if (!result.meta?.changes) return c.json({ error: '처리할 수 있는 가입 신청이 없습니다.' }, 404);
  return c.json({ ok: true });
});

app.get('/api/admin/staff-accounts', async (c) => {
  const auth = await requireAdmin(c); if (auth.error) return auth.error;
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.login_id, u.name, u.staff_role, u.created_at,
            CASE WHEN d.user_id IS NULL THEN 0 ELSE 1 END AS disabled
       FROM users u LEFT JOIN staff_disabled d ON d.user_id = u.id
      WHERE u.role = 'staff' ORDER BY CASE u.staff_role WHEN 'admin' THEN 0 ELSE 1 END, u.name`).all();
  return c.json((rows.results || []).map((row) => ({
    id: row.id, loginId: row.login_id, name: row.name, staffRole: row.staff_role,
    createdAt: row.created_at, disabled: !!row.disabled,
  })));
});

app.post('/api/admin/staff-accounts/:id/disable', async (c) => {
  const auth = await requireAdmin(c); if (auth.error) return auth.error;
  const target = await c.env.DB.prepare("SELECT id, staff_role FROM users WHERE id=? AND role='staff'")
    .bind(c.req.param('id')).first();
  if (!target) return c.json({ error: '직원 계정을 찾을 수 없습니다.' }, 404);
  if (target.staff_role === 'admin') return c.json({ error: '관리자 계정은 이 화면에서 중지할 수 없습니다.' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR REPLACE INTO staff_disabled (user_id, disabled_at, disabled_by) VALUES (?,?,?)')
      .bind(target.id, nowISO(), auth.user.name),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
  ]);
  return c.json({ ok: true });
});

app.post('/api/admin/staff-accounts/:id/enable', async (c) => {
  const auth = await requireAdmin(c); if (auth.error) return auth.error;
  await c.env.DB.prepare('DELETE FROM staff_disabled WHERE user_id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// 승인 대기 중인 신청만 운전기사가 직접 삭제할 수 있다.
app.delete('/api/requests/:id', async (c) => {
  const user = await getDriver(c);
  if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: '신청을 찾을 수 없습니다.' }, 404);
  if (row.driver_user_id !== user.id) return c.json({ error: '권한이 없습니다.' }, 403);
  if (row.status !== 'pending') return c.json({ error: '승인 대기 중인 신청만 삭제할 수 있습니다.' }, 409);

  await c.env.DB.prepare('DELETE FROM documents WHERE request_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id).run();
  return c.json({ ok: true, id });
});

// 운전기사가 기존 신청을 수정하면 승인 상태를 다시 '대기'로 전환하고 변경 이력을 남긴다.
app.put('/api/requests/:id', async (c) => {
  const user = await getDriver(c);
  if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: '신청을 찾을 수 없습니다.' }, 404);
  if (row.driver_user_id !== user.id) return c.json({ error: '권한이 없습니다.' }, 403);

  const form = await c.req.formData();
  const visitAt = String(form.get('visitAt') ?? row.visit_at).slice(0, 10);
  const company = String(form.get('company') ?? row.company ?? '').trim();
  const purpose = String(form.get('purpose') ?? row.purpose ?? '').trim();
  if (!validVisitDate(visitAt)) return c.json({ error: '출입날짜를 선택해 주세요.' }, 400);

  const files = form.getAll('documents').filter((file) => file && typeof file !== 'string' && file.name);
  const preparedFiles = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_DOC_BYTES) {
      return c.json({ error: `${file.name} 파일은 5MB를 초과할 수 없습니다.` }, 400);
    }
    preparedFiles.push({ file, bytes });
  }

  const changes = [];
  const addChange = (field, label, before, after) => {
    if (String(before ?? '') !== String(after ?? '')) changes.push({ field, label, before: before ?? '', after: after ?? '' });
  };
  addChange('visitAt', '방문일자', String(row.visit_at || '').slice(0, 10), visitAt);
  addChange('company', '소속업체', row.company || '', company);
  addChange('purpose', '방문목적', row.purpose || '', purpose);

  if (preparedFiles.length) {
    const oldDocs = await c.env.DB.prepare('SELECT label FROM documents WHERE request_id = ?').bind(id).all();
    changes.push({
      field: 'documents',
      label: '제출서류',
      before: (oldDocs.results || []).map((d) => d.label).join(', ') || '없음',
      after: preparedFiles.map(({ file }) => file.name).join(', '),
    });
  }

  if (!changes.length) return c.json({ error: '변경된 내용이 없습니다.' }, 400);

  const at = nowISO();
  let history = [];
  try { history = JSON.parse(row.history || '[]'); } catch { /* noop */ }
  history.push({ at, action: 'updated', by: user.name, previousStatus: row.status, changes });

  await c.env.DB.prepare(
    `UPDATE requests
       SET visit_at=?, company=?, purpose=?, status='pending', reviewed_by='', reviewed_at='', reject_reason='', history=?
     WHERE id=?`)
    .bind(visitAt, company, purpose, JSON.stringify(history), id).run();

  if (preparedFiles.length) {
    await c.env.DB.prepare('DELETE FROM documents WHERE request_id = ?').bind(id).run();
    for (const { file, bytes } of preparedFiles) {
      await c.env.DB.prepare(
        `INSERT INTO documents (id, request_id, label, content_type, data, size, created_at, retain_until)
         VALUES (?,?,?,?,?,?,?,?)`)
        .bind(randHex(8), id, file.name, file.type || 'application/octet-stream',
          base64FromBytes(bytes), bytes.byteLength, at, row.retain_until).run();
    }
  }

  const updated = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  return c.json(await shapeRequest(c.env, updated));
});

// 기존 API와 정적 파일 처리는 원래 Worker에 위임한다.
app.route('/', legacyApp);

LAYER_v2 = app;
}

// ======================================================================
// 레이어: worker-v3.js  →  LAYER_v3
// ======================================================================
{
  const legacyApp = LAYER_v2;

const app = new Hono();

async function getUser(c) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return null;
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (user) user._token = token;
  return user;
}

async function requireAdmin(c) {
  const user = await getUser(c);
  if (!user) return { error: c.json({ error: '로그인이 필요합니다.' }, 401) };
  if (user.role !== 'staff' || user.staff_role !== 'admin') {
    return { error: c.json({ error: '관리자 권한이 필요합니다.' }, 403) };
  }
  return { user };
}

// 직원 권한 변경: approver(직원) ↔ admin(관리자)
app.post('/api/admin/staff-accounts/:id/role', async (c) => {
  const auth = await requireAdmin(c);
  if (auth.error) return auth.error;

  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const nextRole = String(body.staffRole || '');
  if (!['admin', 'approver'].includes(nextRole)) {
    return c.json({ error: '유효하지 않은 직원 권한입니다.' }, 400);
  }

  const target = await c.env.DB.prepare(
    "SELECT id, role, staff_role, login_id, name FROM users WHERE id = ? AND role = 'staff'")
    .bind(targetId).first();
  if (!target) return c.json({ error: '직원 계정을 찾을 수 없습니다.' }, 404);
  if (target.staff_role === nextRole) return c.json({ ok: true, unchanged: true });

  if (target.staff_role === 'admin' && nextRole === 'approver') {
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM users WHERE role='staff' AND staff_role='admin'").first();
    if (Number(count?.cnt || 0) <= 1) {
      return c.json({ error: '최소 1명의 관리자는 반드시 유지되어야 합니다.' }, 409);
    }
  }

  await c.env.DB.prepare('UPDATE users SET staff_role = ? WHERE id = ?')
    .bind(nextRole, targetId).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();

  return c.json({
    ok: true,
    message: nextRole === 'admin' ? '관리자 권한을 부여했습니다.' : '직원 권한으로 변경했습니다.',
  });
});

// 직원 계정 삭제. 본인 계정과 마지막 관리자 계정은 삭제할 수 없다.
app.delete('/api/admin/staff-accounts/:id', async (c) => {
  const auth = await requireAdmin(c);
  if (auth.error) return auth.error;

  const targetId = c.req.param('id');
  if (targetId === auth.user.id) {
    return c.json({ error: '현재 로그인한 본인 계정은 삭제할 수 없습니다.' }, 400);
  }

  const target = await c.env.DB.prepare(
    "SELECT id, role, staff_role, login_id, name FROM users WHERE id = ? AND role = 'staff'")
    .bind(targetId).first();
  if (!target) return c.json({ error: '직원 계정을 찾을 수 없습니다.' }, 404);

  if (target.staff_role === 'admin') {
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM users WHERE role='staff' AND staff_role='admin'").first();
    if (Number(count?.cnt || 0) <= 1) {
      return c.json({ error: '마지막 관리자 계정은 삭제할 수 없습니다.' }, 409);
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
    c.env.DB.prepare('DELETE FROM staff_disabled WHERE user_id = ?').bind(targetId),
    c.env.DB.prepare('DELETE FROM staff_applications WHERE employee_no = ?').bind(target.login_id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId),
  ]);

  return c.json({ ok: true, message: `${target.name} 직원 계정을 삭제했습니다.` });
});

app.route('/', legacyApp);

LAYER_v3 = app;
}

// ======================================================================
// 레이어: worker-v4.js  →  LAYER_v4
// ======================================================================
{
  const legacyApp = LAYER_v3;

const app = new Hono();
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function bytesFromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function detectedType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  return '';
}

async function getUser(c) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return null;
  return c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
}

async function validateMultipartDocuments(c) {
  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) return null;
  const form = await c.req.raw.clone().formData().catch(() => null);
  if (!form) return c.json({ error: '첨부서류를 확인할 수 없습니다.' }, 400);
  const files = form.getAll('documents').filter((file) => file && typeof file !== 'string' && file.name);
  for (const file of files) {
    if (file.size > MAX_DOC_BYTES) return c.json({ error: `${file.name} 파일은 5MB를 초과할 수 없습니다.` }, 400);
    if (!ALLOWED_TYPES.has(file.type)) return c.json({ error: `${file.name} 파일 형식은 PDF, JPG, PNG만 허용됩니다.` }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const actualType = detectedType(bytes);
    if (!actualType || actualType !== file.type) return c.json({ error: `${file.name} 파일의 실제 형식이 올바르지 않습니다.` }, 400);
  }
  return null;
}

app.use('/api/requests*', async (c, next) => {
  if (c.req.method === 'POST' || c.req.method === 'PUT') {
    const error = await validateMultipartDocuments(c);
    if (error) return error;
  }
  await next();
});

app.get('/uploads/:id', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: '로그인이 필요합니다.' }, 401);

  if (user.role === 'staff') {
    const disabled = await c.env.DB.prepare('SELECT user_id FROM staff_disabled WHERE user_id = ?').bind(user.id).first();
    if (disabled) return c.json({ error: '사용이 중지된 직원 계정입니다.' }, 403);
  }

  const row = await c.env.DB.prepare(
    `SELECT d.label, d.content_type, d.data, d.request_id, r.driver_user_id
       FROM documents d JOIN requests r ON r.id = d.request_id
      WHERE d.id = ?`).bind(c.req.param('id')).first();
  if (!row) return c.json({ error: '파일을 찾을 수 없습니다.' }, 404);

  if (user.role === 'driver' && row.driver_user_id !== user.id) return c.json({ error: '파일 열람 권한이 없습니다.' }, 403);
  if (user.role !== 'driver' && user.role !== 'staff') return c.json({ error: '파일 열람 권한이 없습니다.' }, 403);

  const bytes = bytesFromBase64(row.data);
  const actualType = detectedType(bytes);
  if (!actualType || !ALLOWED_TYPES.has(actualType)) return c.json({ error: '안전하지 않은 파일 형식입니다.' }, 415);

  const safeName = String(row.label || 'document').replace(/[\r\n"\\/]/g, '_');
  const headers = new Headers({
    'Content-Type': actualType,
    'Content-Length': String(bytes.byteLength),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'Cache-Control': 'private, no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Referrer-Policy': 'no-referrer',
  });
  return new Response(bytes, { status: 200, headers });
});

app.route('/', legacyApp);
LAYER_v4 = app;
}

// ======================================================================
// 레이어: worker-v5.js  →  LAYER_v5
// ======================================================================
{
  const legacyApp = LAYER_v4;

const app = new Hono();

const ACCOUNT_FAILURE_LIMIT = 5;
const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const DRIVER_BLOCK_MS = 10 * 60 * 1000;
const STAFF_BLOCK_MS = 30 * 60 * 1000;
const IP_FAILURE_LIMIT = 20;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_BLOCK_MS = 15 * 60 * 1000;
const STAFF_SESSION_MS = 48 * 60 * 60 * 1000;
const DRIVER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const nowISO = () => new Date().toISOString();
const addMs = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();

let schemaReady;
let lastCleanupAt = 0;

async function ensureSecuritySchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
        scope_key TEXT PRIMARY KEY,
        failed_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        blocked_until TEXT DEFAULT '',
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_login_attempts_updated ON login_attempts(updated_at)'),
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function cleanupExpiredSecurityData(env) {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = now;

  const staffCutoff = new Date(now - STAFF_SESSION_MS).toISOString();
  const driverCutoff = new Date(now - DRIVER_SESSION_MS).toISOString();
  const attemptsCutoff = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions
      WHERE created_at < ?
        AND user_id IN (SELECT id FROM users WHERE role = 'staff')`).bind(staffCutoff),
    env.DB.prepare(`DELETE FROM sessions
      WHERE created_at < ?
        AND user_id IN (SELECT id FROM users WHERE role = 'driver')`).bind(driverCutoff),
    env.DB.prepare('DELETE FROM login_attempts WHERE updated_at < ?').bind(attemptsCutoff),
  ]).catch(() => {
    lastCleanupAt = 0;
  });
}

function clientIp(c) {
  return String(
    c.req.header('CF-Connecting-IP')
      || c.req.header('X-Forwarded-For')?.split(',')[0]
      || 'unknown'
  ).trim();
}

function tokenFromRequest(c) {
  const auth = c.req.header('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(c.req.query('t') || '').trim();
}

async function sessionFromToken(env, token) {
  if (!token) return null;
  return env.DB.prepare(`
    SELECT s.user_id, s.created_at, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first();
}

async function enforceSessionExpiry(c) {
  const token = tokenFromRequest(c);
  const row = await sessionFromToken(c.env, token);
  if (!row) return null;

  const createdAt = new Date(row.created_at).getTime();
  const lifetime = row.role === 'staff' ? STAFF_SESSION_MS : DRIVER_SESSION_MS;
  if (!Number.isFinite(createdAt) || Date.now() - createdAt >= lifetime) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return c.json({ error: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.' }, 401);
  }
  return null;
}

async function getAttempt(env, key) {
  return env.DB.prepare(
    'SELECT failed_count, window_started_at, blocked_until FROM login_attempts WHERE scope_key = ?'
  ).bind(key).first();
}

function remainingBlockSeconds(row, now) {
  if (!row?.blocked_until) return 0;
  const remaining = new Date(row.blocked_until).getTime() - new Date(now).getTime();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

async function recordFailure(env, key, limit, windowMs, blockMs, now) {
  const row = await getAttempt(env, key);
  const nowMs = new Date(now).getTime();
  const windowStartedMs = row?.window_started_at ? new Date(row.window_started_at).getTime() : 0;
  const sameWindow = Number.isFinite(windowStartedMs) && nowMs - windowStartedMs < windowMs;
  const failedCount = sameWindow ? Number(row?.failed_count || 0) + 1 : 1;
  const windowStartedAt = sameWindow ? row.window_started_at : now;
  const blockedUntil = failedCount >= limit ? addMs(now, blockMs) : '';

  await env.DB.prepare(`
    INSERT INTO login_attempts (scope_key, failed_count, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET
      failed_count = excluded.failed_count,
      window_started_at = excluded.window_started_at,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at
  `).bind(key, failedCount, windowStartedAt, blockedUntil, now).run();
}

app.use('*', async (c, next) => {
  await ensureSecuritySchema(c.env);
  await cleanupExpiredSecurityData(c.env);

  const expiredResponse = await enforceSessionExpiry(c);
  if (expiredResponse) return expiredResponse;

  const path = new URL(c.req.url).pathname;

  if (c.req.method === 'PUT' && path === '/api/auth/profile') {
    const token = tokenFromRequest(c);
    const session = await sessionFromToken(c.env, token);
    const body = await c.req.raw.clone().json().catch(() => ({}));
    await next();
    if (session?.user_id && body.password && c.res.status >= 200 && c.res.status < 300) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.user_id).run();
    }
    return;
  }

  if (c.req.method !== 'POST' || path !== '/api/auth/login') {
    await next();
    return;
  }

  const body = await c.req.raw.clone().json().catch(() => ({}));
  const loginId = String(body.loginId || '').trim();
  const ip = clientIp(c);
  const accountKey = `account:${loginId || '(empty)'}`;
  const ipKey = `ip:${ip}`;
  const now = nowISO();

  const [accountAttempt, ipAttempt] = await Promise.all([
    getAttempt(c.env, accountKey),
    getAttempt(c.env, ipKey),
  ]);
  const retryAfter = Math.max(
    remainingBlockSeconds(accountAttempt, now),
    remainingBlockSeconds(ipAttempt, now),
  );
  if (retryAfter > 0) {
    c.header('Retry-After', String(retryAfter));
    return c.json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
  }

  await next();

  if (c.res.status >= 200 && c.res.status < 300) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM login_attempts WHERE scope_key = ?').bind(accountKey),
      c.env.DB.prepare('DELETE FROM login_attempts WHERE scope_key = ?').bind(ipKey),
    ]);
    return;
  }

  if (c.res.status === 401) {
    const user = loginId
      ? await c.env.DB.prepare('SELECT role FROM users WHERE login_id = ?').bind(loginId).first()
      : null;
    const accountBlockMs = user?.role === 'staff' ? STAFF_BLOCK_MS : DRIVER_BLOCK_MS;
    await recordFailure(c.env, accountKey, ACCOUNT_FAILURE_LIMIT, ACCOUNT_WINDOW_MS, accountBlockMs, now);
    await recordFailure(c.env, ipKey, IP_FAILURE_LIMIT, IP_WINDOW_MS, IP_BLOCK_MS, now);
  }
});

app.route('/', legacyApp);

LAYER_v5 = app;
}

// ======================================================================
// 레이어: worker-v6.js  →  LAYER_v6
// ======================================================================
{
  const legacyApp = LAYER_v5;

const app = new Hono();
const AUDIT_RETENTION_DAYS = 1095;

const nowISO = () => new Date().toISOString();
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

let schemaReady;

async function ensureAuditSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        actor_user_id TEXT DEFAULT '',
        actor_login_id TEXT DEFAULT '',
        actor_name TEXT DEFAULT '',
        actor_role TEXT DEFAULT '',
        action TEXT NOT NULL,
        target_type TEXT DEFAULT '',
        target_id TEXT DEFAULT '',
        result TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ip_address TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        details TEXT DEFAULT '{}'
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred ON audit_logs(occurred_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id)'),
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function tokenFromRequest(c) {
  const auth = c.req.header('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(c.req.query('t') || '').trim();
}

function clientIp(c) {
  return String(
    c.req.header('CF-Connecting-IP')
      || c.req.header('X-Forwarded-For')?.split(',')[0]
      || ''
  ).trim();
}

async function actorFromRequest(c) {
  const token = tokenFromRequest(c);
  if (!token) return null;
  return c.env.DB.prepare(`
    SELECT u.id, u.login_id, u.name, u.role, u.staff_role
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first();
}

function safeDetails(value) {
  try {
    const text = JSON.stringify(value || {});
    return text.length > 2000 ? text.slice(0, 2000) : text;
  } catch {
    return '{}';
  }
}

async function writeAudit(env, entry) {
  await ensureAuditSchema(env);
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      id, occurred_at, actor_user_id, actor_login_id, actor_name, actor_role,
      action, target_type, target_id, result, status_code, ip_address, user_agent, details
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    randHex(12), nowISO(), entry.actor?.id || '', entry.actor?.login_id || entry.loginId || '',
    entry.actor?.name || '', entry.actor?.role === 'staff' ? (entry.actor.staff_role || 'staff') : (entry.actor?.role || ''),
    entry.action, entry.targetType || '', entry.targetId || '', entry.result,
    Number(entry.statusCode || 0), entry.ip || '', String(entry.userAgent || '').slice(0, 500),
    safeDetails(entry.details),
  ).run();
}

function classifyAudit(method, path) {
  if (method === 'POST' && path === '/api/auth/login') return { action: 'auth.login', targetType: 'account' };
  if (method === 'POST' && path === '/api/auth/logout') return { action: 'auth.logout', targetType: 'session' };
  if (method === 'GET' && /^\/uploads\/[^/]+$/.test(path)) return { action: 'document.view', targetType: 'document', targetId: path.split('/').pop() };
  if (method === 'GET' && /^\/api\/requests\/[^/]+$/.test(path)) return { action: 'request.detail.view', targetType: 'request', targetId: path.split('/').pop() };
  if (method === 'PUT' && /^\/api\/requests\/[^/]+$/.test(path)) return { action: 'request.update', targetType: 'request', targetId: path.split('/').pop() };
  if (method === 'DELETE' && /^\/api\/requests\/[^/]+$/.test(path)) return { action: 'request.delete', targetType: 'request', targetId: path.split('/').pop() };
  if (method === 'POST' && /\/api\/requests\/[^/]+\/(approve|reject)$/.test(path)) {
    const parts = path.split('/');
    return { action: `request.${parts.at(-1)}`, targetType: 'request', targetId: parts.at(-2) };
  }
  if (/\/api\/admin\/staff-applications\/[^/]+\/(approve|reject)$/.test(path)) {
    const parts = path.split('/');
    return { action: `staff.application.${parts.at(-1)}`, targetType: 'staff_application', targetId: parts.at(-2) };
  }
  if (path.includes('/api/admin/staff-accounts/')) {
    const parts = path.split('/');
    return { action: `staff.account.${method.toLowerCase()}`, targetType: 'staff_account', targetId: parts[4] || '' };
  }
  if (method === 'GET' && /(?:export|excel|xlsx|csv)/i.test(path)) return { action: 'data.export', targetType: 'requests' };
  return null;
}

function applySecurityHeaders(response, requestUrl) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  const contentType = headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://raw.githubusercontent.com",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; '));
  }

  if (new URL(requestUrl).pathname.startsWith('/api/')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

app.use('*', async (c, next) => {
  await ensureAuditSchema(c.env);

  const path = new URL(c.req.url).pathname;
  const method = c.req.method;
  const auditType = classifyAudit(method, path);
  const actor = auditType ? await actorFromRequest(c) : null;
  let loginId = '';
  if (auditType?.action === 'auth.login') {
    const body = await c.req.raw.clone().json().catch(() => ({}));
    loginId = String(body.loginId || '').trim();
  }

  await next();
  c.res = applySecurityHeaders(c.res, c.req.url);

  if (auditType) {
    const statusCode = c.res.status;
    await writeAudit(c.env, {
      ...auditType,
      actor,
      loginId,
      result: statusCode >= 200 && statusCode < 400 ? 'success' : 'failure',
      statusCode,
      ip: clientIp(c),
      userAgent: c.req.header('User-Agent') || '',
      details: { method, path },
    }).catch(() => {});
  }
});

app.route('/', legacyApp);

async function runRetentionCleanup(env) {
  await ensureAuditSchema(env);
  const now = nowISO();
  const auditCutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const expiredDocs = await env.DB.prepare('SELECT COUNT(*) AS count FROM documents WHERE retain_until <= ?').bind(now).first();
  const expiredRequests = await env.DB.prepare('SELECT COUNT(*) AS count FROM requests WHERE retain_until <= ?').bind(now).first();

  await env.DB.batch([
    env.DB.prepare('DELETE FROM documents WHERE retain_until <= ?').bind(now),
    env.DB.prepare('DELETE FROM requests WHERE retain_until <= ?').bind(now),
    env.DB.prepare('DELETE FROM audit_logs WHERE occurred_at < ?').bind(auditCutoff),
    env.DB.prepare('DELETE FROM login_attempts WHERE updated_at < ?').bind(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  await writeAudit(env, {
    action: 'system.retention_cleanup',
    targetType: 'system',
    result: 'success',
    statusCode: 200,
    details: {
      deletedDocuments: Number(expiredDocs?.count || 0),
      deletedRequests: Number(expiredRequests?.count || 0),
    },
  });
}

LAYER_v6 = {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runRetentionCleanup(env));
  },
};

}

// ======================================================================
// 레이어: worker-v7.js  →  LAYER_v7
// ======================================================================
{
  const legacyWorker = LAYER_v6;

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

LAYER_v7 = {
  async fetch(request, env, ctx) {
    const response = await handleFetch(request, env, ctx);
    return withSecurityHeaders(response);
  },
  scheduled(event, env, ctx) {
    return legacyWorker.scheduled(event, env, ctx);
  },
};

}

// ======================================================================
// 레이어: worker-v8.js  →  LAYER_v8
// ======================================================================
{
  const worker = LAYER_v7;

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

function withFreshAssetHeaders(response, request) {
  if (request.method !== 'GET') return response;
  const path = new URL(request.url).pathname;
  const isFreshAsset = path === '/'
    || path === '/index.html'
    || path === '/sw.js'
    || path === '/manifest.webmanifest'
    || path.endsWith('.js')
    || path.endsWith('.css')
    || path.endsWith('.html');
  if (!isFreshAsset) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

LAYER_v8 = {
  async fetch(request, env, ctx) {
    const blocked = await preflightSecurity(request, env);
    if (blocked) return withSecurityHeaders(blocked, request);

    let response = await handleDriverAccountAdminV2(request, env);
    if (!response) response = await handlePasswordResetApi(request, env);

    if (!response) {
      // 하위 워커는 비밀번호 변경 성공 직후 모든 세션을 삭제한다.
      // 따라서 요청 처리 전에 사용자 ID를 확보해야 변경 필요 상태를 확실히 해제할 수 있다.
      const profileUser = await driverChangingPassword(request, env);
      response = await worker.fetch(request, env, ctx);

      if (response.ok && profileUser?.role === 'driver') {
        await env.DB.prepare(
          'UPDATE users SET must_change_password = 0 WHERE id = ?'
        ).bind(profileUser.id).run();
      }
    }

    response = withFreshAssetHeaders(response, request);
    return withSecurityHeaders(response, request);
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};

}

// ======================================================================
// 레이어: worker-v9.js  →  LAYER_v9
// ======================================================================
{
  const worker = LAYER_v8;

function isStaffManagementPath(path) {
  return path === '/api/admin/driver-accounts'
    || path.startsWith('/api/admin/driver-accounts/')
    || path === '/api/admin/password-reset-requests'
    || path.startsWith('/api/admin/password-reset-requests/');
}

LAYER_v9 = {
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

}

// ======================================================================
// 레이어: worker-v10.js  →  LAYER_v10
// ======================================================================
{
  const worker = LAYER_v9;

function mayHandle(path, method) {
  if (isCompanyFlowPath(path)) return true;
  if (method === 'GET' && path === '/api/requests') return true;
  if (method === 'POST' && (path === '/api/auth/register' || path === '/api/staff-applications')) return true;
  return method === 'POST' && /^\/api\/requests\/[^/]+\/(approve|reject)$/.test(path);
}

function withSameOriginCamera(response) {
  const headers = new Headers(response.headers);
  headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function withCompanyWorkflowStatus(response, env) {
  if (!response?.ok) return response;
  let records;
  try { records = await response.clone().json(); } catch { return response; }
  if (!Array.isArray(records)) return response;

  let rows;
  try {
    rows = await env.DB.prepare(`
      SELECT id, workflow_status
        FROM requests
       WHERE company_account_id IS NOT NULL
         AND company_account_id <> ''
    `).all();
  } catch {
    return response;
  }

  const workflowById = new Map((rows.results || []).map((row) => [String(row.id), String(row.workflow_status || '')]));
  const output = records.map((record) => {
    const workflowStatus = workflowById.get(String(record?.id || ''));
    if (!workflowStatus) return record;
    return { ...record, workflowStatus, companyFlow: true };
  });

  const body = JSON.stringify(output);
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

LAYER_v10 = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = String(request.method || 'GET').toUpperCase();
    if (!mayHandle(path, method)) {
      return withSameOriginCamera(await worker.fetch(request, env, ctx));
    }

    const blocked = await preflightSecurity(request, env);
    if (blocked) return withSameOriginCamera(withSecurityHeaders(blocked, request));

    const registrationResponse = await handleCompanyRegistrationV2(request, env);
    if (registrationResponse) return withSameOriginCamera(withSecurityHeaders(registrationResponse, request));

    const contractRequestResponse = await handleCompanyContractRequestV2(request, env);
    if (contractRequestResponse) return withSameOriginCamera(withSecurityHeaders(contractRequestResponse, request));

    const driverShareResponse = await handleCompanyDriverShareV2(request, env);
    if (driverShareResponse) return withSameOriginCamera(withSecurityHeaders(driverShareResponse, request));

    const driverAccessResponse = await handleCompanyDriverAccessV3(request, env);
    if (driverAccessResponse) return withSameOriginCamera(withSecurityHeaders(driverAccessResponse, request));

    const response = await handleCompanyFlowApi(request, env);
    if (!response) {
      let legacyResponse = await worker.fetch(request, env, ctx);
      if (method === 'GET' && path === '/api/requests') {
        legacyResponse = await withCompanyWorkflowStatus(legacyResponse, env);
      }
      return withSameOriginCamera(legacyResponse);
    }
    return withSameOriginCamera(withSecurityHeaders(response, request));
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};

}

export default LAYER_v10;
