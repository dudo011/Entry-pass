(() => {
  const TOKEN_KEY = 'ep_company_token';
  const nativeFetch = window.fetch.bind(window);
  const cache = new Map();
  let cacheToken = '';
  let primePromise = null;

  const CACHE_PATHS = new Set([
    '/api/company/contract-context',
    '/api/company/vehicles',
    '/api/vehicle-types',
  ]);

  function currentToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function syncToken() {
    const token = currentToken();
    if (token !== cacheToken) {
      cacheToken = token;
      cache.clear();
      primePromise = null;
    }
    return token;
  }

  function requestInfo(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), location.href);
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    return { path: url.pathname, method };
  }

  async function saveResponse(path, response) {
    if (!response?.ok || !CACHE_PATHS.has(path)) return;
    try {
      const clone = response.clone();
      const body = await clone.text();
      cache.set(path, {
        body,
        status: clone.status,
        statusText: clone.statusText,
        headers: [...clone.headers.entries()],
      });
    } catch { /* 캐시 실패 시 일반 fetch로 계속 동작 */ }
  }

  function cachedResponse(path) {
    const item = cache.get(path);
    if (!item) return null;
    return new Response(item.body, {
      status: item.status,
      statusText: item.statusText,
      headers: item.headers,
    });
  }

  async function prefetchPath(path, token) {
    if (cache.has(path)) return;
    const headers = new Headers();
    if (path.startsWith('/api/company/')) headers.set('Authorization', `Bearer ${token}`);
    const response = await nativeFetch(path, { method: 'GET', headers });
    await saveResponse(path, response);
  }

  function prime() {
    const token = syncToken();
    if (!token) return Promise.resolve();
    if (primePromise) return primePromise;
    primePromise = Promise.all([
      prefetchPath('/api/company/contract-context', token),
      prefetchPath('/api/company/vehicles', token),
      prefetchPath('/api/vehicle-types', token),
    ]).catch(() => {}).finally(() => { primePromise = null; });
    return primePromise;
  }

  window.fetch = async function companyPrefetchFetch(input, init = {}) {
    syncToken();
    const { path, method } = requestInfo(input, init);

    if (path.startsWith('/api/company/vehicles') && method !== 'GET') {
      cache.delete('/api/company/vehicles');
    }

    if (method === 'GET' && CACHE_PATHS.has(path)) {
      const cached = cachedResponse(path);
      if (cached) return cached;
    }

    const response = await nativeFetch(input, init);

    if (method === 'GET' && CACHE_PATHS.has(path)) {
      void saveResponse(path, response);
    }

    if ((path === '/api/company/login' || path === '/api/company/register') && method === 'POST' && response.ok) {
      setTimeout(() => { syncToken(); void prime(); }, 0);
    }

    return response;
  };

  /* 기존 로그인 세션이면 앱 화면이 보이기 전부터 필요한 데이터를 준비한다. */
  void prime();

  const app = document.getElementById('app');
  if (app) {
    new MutationObserver(() => {
      if (app.querySelector('#cf_request_list') || app.querySelector('[data-cf-view="request"]')) {
        void prime();
      }
    }).observe(app, { childList: true, subtree: true });
  }
})();