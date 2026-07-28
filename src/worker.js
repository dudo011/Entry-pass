/**
 * 자재센터 출입 사전승인 앱 - Cloudflare Workers 백엔드 (Hono + D1)
 *
 *  - D1(SQLite): 사용자/세션/신청 + 첨부 서류(base64) 저장 (R2 미사용, 카드 불필요)
 *  - 비밀번호  : Web Crypto PBKDF2-SHA256 (Workers 런타임 호환)
 *  - 정적 파일 : public/ (wrangler [assets] 로 서빙)
 *  - 서류는 신청 기록과 함께 보존기간(retain_until)까지 유지
 */
import { Hono } from 'hono';
import vehicleTypes from '../data/vehicleTypes.js';

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

const publicUser = (u) => ({
  id: u.id, role: u.role, staffRole: u.staff_role, loginId: u.login_id, name: u.name,
  phone: u.phone, company: u.company, defaultVehicleNumber: u.default_vehicle_number,
  defaultVehicleTypeId: u.default_vehicle_type_id,
});

// 신청 레코드를 기존 프런트엔드가 기대하는 형태로 변환
async function shapeRequest(env, row) {
  const docs = await env.DB.prepare(
    'SELECT id, label, size FROM documents WHERE request_id = ?').bind(row.id).all();
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
      label: d.label, url: `/uploads/${d.id}`, size: d.size,
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
    return c.json({ error: '아이디·비밀번호·이름·연락처는 필수입니다.' }, 400);
  }
  if (String(b.password).length < 4) return c.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE login_id = ?').bind(b.loginId).first();
  if (exists) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409);

  const { salt, hash } = await hashPassword(b.password);
  const id = randHex(8);
  await c.env.DB.prepare(
    `INSERT INTO users (id, role, login_id, name, salt, hash, phone, company,
      default_vehicle_number, default_vehicle_type_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, 'driver', b.loginId, b.name, salt, hash, b.phone, b.company || '',
      b.defaultVehicleNumber || '', b.defaultVehicleTypeId || '', nowISO()).run();

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
  const fields = {
    name: b.name ?? u.name, phone: b.phone ?? u.phone, company: b.company ?? u.company,
    default_vehicle_number: b.defaultVehicleNumber ?? u.default_vehicle_number,
    default_vehicle_type_id: b.defaultVehicleTypeId ?? u.default_vehicle_type_id,
  };
  await c.env.DB.prepare(
    `UPDATE users SET name=?, phone=?, company=?, default_vehicle_number=?, default_vehicle_type_id=?
     WHERE id=?`)
    .bind(fields.name, fields.phone, fields.company, fields.default_vehicle_number,
      fields.default_vehicle_type_id, u.id).run();
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
  if (String(get('agreedRequired')) !== 'true') {
    return c.json({ error: '필수 안전수칙 동의가 필요합니다.' }, 400);
  }

  const user = c.get('user');
  const created = nowISO();
  const retainUntil = addYears(created, RETENTION_YEARS);
  const id = randHex(8);
  const passNo = 'EP-' + Date.now().toString().slice(-8);
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
  const csv = '﻿' + cols.join(',') + '\n' + body;
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

export default app;
