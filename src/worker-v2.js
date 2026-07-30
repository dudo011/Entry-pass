import { Hono } from 'hono';
import legacyApp from './worker.js';

const app = new Hono();
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const nowISO = () => new Date().toISOString();
const randHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

function base64FromBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function validVisitDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10));
}

async function getDriver(c) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?')
    .bind(token).first();
  if (!session) return null;
  return c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'driver'")
    .bind(session.user_id).first();
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

  const changes = [];
  const addChange = (field, label, before, after) => {
    if (String(before ?? '') !== String(after ?? '')) changes.push({ field, label, before: before ?? '', after: after ?? '' });
  };
  addChange('visitAt', '방문일자', String(row.visit_at || '').slice(0, 10), visitAt);
  addChange('company', '소속업체', row.company || '', company);
  addChange('purpose', '방문목적', row.purpose || '', purpose);

  const files = form.getAll('documents').filter((file) => file && typeof file !== 'string' && file.name);
  if (files.length) {
    const oldDocs = await c.env.DB.prepare('SELECT label FROM documents WHERE request_id = ?').bind(id).all();
    changes.push({
      field: 'documents',
      label: '제출서류',
      before: (oldDocs.results || []).map((d) => d.label).join(', ') || '없음',
      after: files.map((file) => file.name).join(', '),
    });
  }

  if (!changes.length) return c.json({ error: '변경된 내용이 없습니다.' }, 400);

  const at = nowISO();
  let history = [];
  try { history = JSON.parse(row.history || '[]'); } catch { /* noop */ }
  history.push({
    at,
    action: 'updated',
    by: user.name,
    previousStatus: row.status,
    changes,
  });

  await c.env.DB.prepare(
    `UPDATE requests
       SET visit_at=?, company=?, purpose=?, status='pending', reviewed_by='', reviewed_at='', reject_reason='', history=?
     WHERE id=?`)
    .bind(visitAt, company, purpose, JSON.stringify(history), id).run();

  if (files.length) {
    await c.env.DB.prepare('DELETE FROM documents WHERE request_id = ?').bind(id).run();
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > MAX_DOC_BYTES) {
        return c.json({ error: `${file.name} 파일은 5MB를 초과할 수 없습니다.` }, 400);
      }
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
