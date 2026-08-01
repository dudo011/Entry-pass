import { Hono } from 'hono';
import legacyApp from './worker.js';

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

export default app;