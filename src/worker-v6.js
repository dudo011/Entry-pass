import { Hono } from 'hono';
import legacyApp from './worker-v5.js';

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

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runRetentionCleanup(env));
  },
};
