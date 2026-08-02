/* 자재센터 출입 신청 PWA 서비스워커
 * 온라인에서는 HTML/JS/CSS를 항상 네트워크에서 확인하고,
 * 오프라인일 때만 마지막 정상 응답을 사용한다.
 */
const CACHE = 'entrypass-shell-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  event.respondWith((async () => {
    try {
      const networkRequest = new Request(request, { cache: 'no-store' });
      const response = await fetch(networkRequest);
      if (response?.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
        if (request.mode === 'navigate') await cache.put('/', response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: false });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('/')) || Response.error();
      return Response.error();
    }
  })());
});
