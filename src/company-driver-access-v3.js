import vehicleTypes from '../data/vehicleTypes.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

const nowISO = () => new Date().toISOString();
const toHex = (buf) => [...new Uint8Array(buf)].map((v) => v.toString(16).padStart(2, '0')).join('');
const randHex = (bytes = 24) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

function parseHistory(row) {
  try {
    const value = JSON.parse(row.history || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function base64FromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  return '';
}

function fileExt(type) {
  return type === 'image/png' ? '.png' : '.jpg';
}

function isExpired(row) {
  const expires = Date.parse(row.driver_access_expires_at || '');
  return !Number.isFinite(expires) || Date.now() > expires;
}

async function driverRow(env, token) {
  if (!token || token.length < 32) return null;
  return env.DB.prepare(
    'SELECT * FROM requests WHERE driver_access_token = ? AND company_account_id <> ?'
  ).bind(token, '').first();
}

function payload(row) {
  const type = vehicleTypes.find((item) => item.id === row.vehicle_type_id);
  return {
    id: row.id,
    passNo: row.pass_no,
    company: row.company,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    driverPhone: row.phone,
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
    canConfirmSafety: row.workflow_status === 'safety_pending',
    canUploadPhoto: row.workflow_status === 'photo_pending',
  };
}

async function getDriverAccess(env, token) {
  const row = await driverRow(env, token);
  if (!row) return error('유효하지 않은 출입 링크입니다.', 404);
  if (isExpired(row)) return error('기사 전용 링크의 사용기한이 만료되었습니다.', 410);
  return json(payload(row));
}

async function uploadDriverPhotos(request, env, token) {
  const row = await driverRow(env, token);
  if (!row) return error('유효하지 않은 출입 링크입니다.', 404);
  if (isExpired(row)) return error('기사 전용 링크의 사용기한이 만료되었습니다.', 410);
  if (row.workflow_status === 'completed') return error('이미 최종 완료된 신청입니다.', 409);
  if (row.workflow_status !== 'photo_pending') return error('먼저 안전수칙을 확인해 주세요.', 409);

  const form = await request.formData().catch(() => null);
  if (!form) return error('현장사진을 확인할 수 없습니다.');
  const files = form.getAll('photo').filter((file) => file && typeof file !== 'string' && file.size > 0);
  if (!files.length) return error('현장사진을 1장 이상 등록해 주세요.');

  const checked = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return error('현장사진 한 장의 용량은 5MB 이하여야 합니다.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return error('현장사진은 JPG 또는 PNG 형식만 사용할 수 있습니다.');
    checked.push({ bytes, type });
  }

  const at = nowISO();
  const history = parseHistory(row);
  history.push({ at, action: 'site_photos_uploaded', count: checked.length, by: row.driver_name });

  const statements = checked.map((item, index) => env.DB.prepare(`
    INSERT INTO documents (id, request_id, label, content_type, data, size, created_at, retain_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randHex(10),
    row.id,
    `현장사진-${index + 1}${fileExt(item.type)}`,
    item.type,
    base64FromBytes(item.bytes),
    item.bytes.byteLength,
    at,
    row.retain_until,
  ));

  statements.push(env.DB.prepare(`
    UPDATE requests
       SET workflow_status='completed', photo_uploaded_at=?, completed_at=?, history=?
     WHERE id=?
  `).bind(at, at, JSON.stringify(history), row.id));

  await env.DB.batch(statements);
  const updated = await env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(row.id).first();
  return json(payload(updated));
}

export async function handleCompanyDriverAccessV3(request, env) {
  const url = new URL(request.url);
  const method = String(request.method || 'GET').toUpperCase();

  const detail = url.pathname.match(/^\/api\/driver-access\/([^/]+)$/);
  if (detail && method === 'GET') return getDriverAccess(env, decodeURIComponent(detail[1]));

  const photo = url.pathname.match(/^\/api\/driver-access\/([^/]+)\/photo$/);
  if (photo && method === 'POST') return uploadDriverPhotos(request, env, decodeURIComponent(photo[1]));

  return null;
}
