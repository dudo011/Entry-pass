/* 자재센터 출입 신청 — 최소 서비스워커
 * 목적: PWA 설치 요건(fetch 핸들러) 충족 + 오프라인 시 기본 화면 표시.
 * 안전장치: GET 요청만, API·업로드·타 도메인은 건드리지 않음(항상 네트워크 우선).
 */
const CACHE = 'entrypass-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 이전 버전 캐시 정리
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // 신청/승인 등 변경요청은 그대로 통과
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 외부 도메인 통과
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return; // 동적 데이터는 캐시 안 함

  // 정적 셸: 네트워크 우선(온라인이면 항상 최신) + 실패 시 캐시/기본화면
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
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
