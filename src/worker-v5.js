import { Hono } from 'hono';
import legacyApp from './worker-v4.js';

const app = new Hono();

const ACCOUNT_FAILURE_LIMIT = 5;
const ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const DRIVER_BLOCK_MS = 10 * 60 * 1000;
const STAFF_BLOCK_MS = 30 * 60 * 1000;
const IP_FAILURE_LIMIT = 20;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_BLOCK_MS = 15 * 60 * 1000;
const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
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

async function enforceSessionExpiry(c) {
  const token = tokenFromRequest(c);
  if (!token) return null;

  const row = await c.env.DB.prepare(`
    SELECT s.created_at, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first();
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
    await Promise.all([
      recordFailure(c.env, accountKey, ACCOUNT_FAILURE_LIMIT, ACCOUNT_WINDOW_MS, accountBlockMs, now),
      recordFailure(c.env, ipKey, IP_FAILURE_LIMIT, IP_WINDOW_MS, IP_BLOCK_MS, now),
    ]);
  }
});

app.route('/', legacyApp);

export default app;
