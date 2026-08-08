(() => {
  const VERSION = '20260808-001';

  function refreshRouteImages() {
    document.querySelectorAll('#app img.transport-route-map').forEach((image) => {
      const raw = image.getAttribute('src') || '';
      if (!raw || raw.includes(`v=${VERSION}`)) return;
      try {
        const url = new URL(raw, location.origin);
        url.searchParams.set('v', VERSION);
        image.src = `${url.pathname}${url.search}`;
      } catch { /* 잘못된 URL은 기존 값 유지 */ }
    });
  }

  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver(refreshRouteImages).observe(app, { childList: true, subtree: true });
  refreshRouteImages();
})();
