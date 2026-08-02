const LEGACY_RESET_KEY = 'test-request-reset-20260731-01';
const MAX_JSON_BYTES = 64 * 1024;
const MAX_MULTIPART_BYTES = 22 * 1024 * 1024;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const PUBLIC_LIMITS = new Map([
  ['/api/auth/register', { limit: 5, windowMs: 60 * 60 * 1000 }],
  ['/api/staff-applications', { limit: 5, windowMs: 60 * 60 * 1000 }],
  ['/api/auth/password-reset-requests', { limit: 6, windowMs: 15 * 60 * 1000 }],
]);

let schemaReady;

function jsonError(message, status = 400, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
      env.DB.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, 'done')").bind(LEGACY_RESET_KEY),
      env.DB.prepare("UPDATE app_meta SET value = 'done' WHERE key = ?").bind(LEGACY_RESET_KEY),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS public_action_limits (
        scope_key TEXT PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_public_action_limits_updated ON public_action_limits(updated_at)'),
    ]).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function clientIp(request) {
  return String(
    request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')?.split(',')[0]
      || 'unknown'
  ).trim();
}

function isUnsafeMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

async function enforcePublicRateLimit(request, env, path, config) {
  const now = new Date();
  const nowIso = now.toISOString();
  const key = `${path}:${clientIp(request)}`;
  const row = await env.DB.prepare(
    'SELECT attempt_count, window_started_at FROM public_action_limits WHERE scope_key = ?'
  ).bind(key).first();

  const startedAt = Date.parse(row?.window_started_at || '');
  const activeWindow = Number.isFinite(startedAt) && now.getTime() - startedAt < config.windowMs;

  if (!activeWindow) {
    await env.DB.prepare(`
      INSERT INTO public_action_limits (scope_key, attempt_count, window_started_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        attempt_count = 1,
        window_started_at = excluded.window_started_at,
        updated_at = excluded.updated_at
    `).bind(key, nowIso, nowIso).run();
    return null;
  }

  const count = Number(row?.attempt_count || 0);
  if (count >= config.limit) {
    const retryAfter = Math.max(1, Math.ceil((startedAt + config.windowMs - now.getTime()) / 1000));
    return jsonError(
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      429,
      { 'Retry-After': String(retryAfter) }
    );
  }

  await env.DB.prepare(`
    UPDATE public_action_limits
       SET attempt_count = attempt_count + 1, updated_at = ?
     WHERE scope_key = ?
  `).bind(nowIso, key).run();

  if (Math.random() < 0.02) {
    const cutoff = new Date(now.getTime() - TWO_DAYS_MS).toISOString();
    await env.DB.prepare('DELETE FROM public_action_limits WHERE updated_at < ?').bind(cutoff).run().catch(() => {});
  }
  return null;
}

export async function preflightSecurity(request, env) {
  await ensureSchema(env);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = String(request.method || 'GET').toUpperCase();
  const protectedPath = path.startsWith('/api/') || path.startsWith('/uploads/');

  if (protectedPath && url.searchParams.has('t')) {
    return jsonError('URL에 인증정보를 포함할 수 없습니다.', 400);
  }

  if (isUnsafeMethod(method)) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) {
      return jsonError('허용되지 않은 출처의 요청입니다.', 403);
    }
    const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').toLowerCase();
    if (fetchSite === 'cross-site') {
      return jsonError('허용되지 않은 교차 사이트 요청입니다.', 403);
    }
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (contentLength > 0) {
    if (contentType.includes('multipart/form-data') && contentLength > MAX_MULTIPART_BYTES) {
      return jsonError('한 번에 전송할 수 있는 전체 파일 용량을 초과했습니다.', 413);
    }
    if (contentType.includes('application/json') && contentLength > MAX_JSON_BYTES) {
      return jsonError('요청 데이터가 너무 큽니다.', 413);
    }
  }

  const rateConfig = method === 'POST' ? PUBLIC_LIMITS.get(path) : null;
  if (rateConfig) return enforcePublicRateLimit(request, env, path, rateConfig);

  return null;
}

export function withSecurityHeaders(response, request) {
  const headers = new Headers(response.headers);
  const path = new URL(request.url).pathname;
  const contentType = String(headers.get('Content-Type') || '').toLowerCase();

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');

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
      "worker-src 'self'",
      "manifest-src 'self'",
      'upgrade-insecure-requests',
    ].join('; '));
  }

  if (path.startsWith('/api/') || path.startsWith('/uploads/')) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
