import { Hono } from 'hono';
import legacyApp from './worker-v3.js';

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
export default app;
