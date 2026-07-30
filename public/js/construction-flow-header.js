(() => {
  const CONSTRUCTION_TITLES = new Set([
    '공사업체 (자재 환입 및 수령)',
    '공사업체 (자재 수령)',
  ]);

  function normalize() {
    const appbar = document.querySelector('#app > .appbar');
    if (!appbar || appbar.dataset.constructionFlowHeader === 'true') return;

    const heading = appbar.querySelector('h1');
    const sub = appbar.querySelector('.sub');
    const titleText = heading?.textContent?.trim() || '';
    const subText = sub?.textContent?.trim() || '';
    if (!CONSTRUCTION_TITLES.has(titleText) || !subText) return;

    const logoutButton = appbar.querySelector('[data-logout]');
    appbar.querySelector('.back')?.remove();

    const title = document.createElement('div');
    title.className = 'vehicle-appbar-title';

    const icon = document.createElement('span');
    icon.className = 'vehicle-appbar-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🏗️';

    const nextHeading = document.createElement('h1');
    nextHeading.textContent = subText;
    title.append(icon, nextHeading);

    appbar.replaceChildren(title);
    if (logoutButton) appbar.append(logoutButton);
    appbar.classList.add('vehicle-flow-appbar');
    appbar.dataset.constructionFlowHeader = 'true';
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      normalize();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  schedule();
})();