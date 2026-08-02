(() => {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    try {
      if (sessionStorage.getItem('ep_sw_controller_reloaded') === '1') return;
      sessionStorage.setItem('ep_sw_controller_reloaded', '1');
    } catch { /* 저장소 사용 불가 시 1회 새로고침만 시도 */ }
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      const activateWaiting = () => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      activateWaiting();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            installing.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      await registration.update();
      activateWaiting();
    } catch {
      // 서비스워커 갱신 실패가 앱 사용을 막지 않도록 무시한다.
    }
  });
})();
