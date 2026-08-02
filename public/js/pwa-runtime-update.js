(() => {
  if (!('serviceWorker' in navigator)) return;

  const refreshServiceWorker = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((key) => key.startsWith('entrypass-')).map((key) => caches.delete(key))
        );
      }

      const registration = await navigator.serviceWorker.register(
        '/sw.js?v=20260802-006',
        { updateViaCache: 'none' }
      );
      await registration.update();
    } catch {
      // PWA 갱신 실패가 앱 본 기능을 막지 않도록 무시한다.
    }
  };

  if (document.readyState === 'complete') refreshServiceWorker();
  else window.addEventListener('load', refreshServiceWorker, { once: true });
})();
