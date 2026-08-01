(() => {
  const app = document.getElementById('app');
  if (!app) return;

  let completed = false;

  function adminControlsReady() {
    const appbar = app.querySelector(':scope > .appbar');
    return Boolean(
      appbar?.querySelector('[data-logout]')
      && appbar?.querySelector('.driver-manage-open')
      && appbar?.querySelector('.staff-manage-open')
    );
  }

  function portalReady() {
    return Boolean(document.querySelector('.admin-portal-shell'));
  }

  function triggerPortalInitialization() {
    if (completed || portalReady() || !adminControlsReady()) return;

    // admin-home-menu.js의 기존 감시기가 확실히 실행되도록
    // #app의 직계 자식 변경을 한 번 발생시킨다.
    const marker = document.createElement('span');
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    marker.dataset.adminPortalInit = '1';
    app.appendChild(marker);
    marker.remove();

    requestAnimationFrame(() => {
      if (portalReady()) {
        completed = true;
        observer.disconnect();
        clearInterval(timer);
      }
    });
  }

  const observer = new MutationObserver(triggerPortalInitialization);
  observer.observe(app, { childList: true, subtree: true });

  // 일부 모바일 WebView에서 MutationObserver 전달이 늦는 경우를 위한 짧은 보조 확인.
  const timer = setInterval(triggerPortalInitialization, 250);
  setTimeout(() => clearInterval(timer), 10000);

  triggerPortalInitialization();
})();
