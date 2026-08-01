/* 자재센터 출입 신청 — 최소 서비스워커
 * 목적: PWA 설치 요건(fetch 핸들러) 충족 + 오프라인 시 기본 화면 표시.
 * 안전장치: GET 요청만, API·업로드·타 도메인은 건드리지 않음(항상 네트워크 우선).
 */
const CACHE = 'entrypass-shell-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  e.respondWith((async () => {
    try {
      const networkRequest = new Request(req, { cache: 'no-store' });
      const res = await fetch(networkRequest);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      return cached || (await caches.match('/')) || Response.error();
    }
  })());
});
