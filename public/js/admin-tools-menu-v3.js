(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_token';
  let currentUser = null;
  let currentToken = '';
  let userPromise = null;
  let menuLayer = null;
  let closeCheckTimer = null;

  const style = document.createElement('style');
  style.textContent = `
    #app > .appbar .driver-manage-open,
    #app > .appbar .staff-manage-open,
    #app > .appbar .staff-role-manage-open{display:none!important}

    .admin-console-bar,
    .admin-tools-head,
    .driver-manage-head,
    .staff-manage-head{
      height:76px!important;min-height:76px!important;box-sizing:border-box!important;
      padding:14px 16px!important;display:flex!important;align-items:center!important
    }
    .admin-console-bar{gap:10px!important}
    .admin-console-bar h1{font-size:23px!important;line-height:1.15!important;white-space:nowrap!important;letter-spacing:-.7px!important}
    .admin-console-bar .sub{margin-top:2px!important;line-height:1.2!important}
    .admin-console-bar .admin-tools-open{
      flex:none;order:2;margin-left:auto;margin-right:7px;min-height:42px;padding:0 12px;
      border:0;border-radius:11px;background:rgba(255,255,255,.14);color:#fff;
      font-size:14px;font-weight:900;white-space:nowrap;cursor:pointer;
      touch-action:manipulation;pointer-events:auto!important
    }
    .admin-console-bar .admin-tools-open[aria-busy="true"]{opacity:.72;cursor:wait}
    .admin-console-bar [data-logout]{order:3;margin-left:0!important;flex:none}

    .admin-tools-layer{
      position:fixed;inset:0;z-index:50000;background:#f8fafc;overflow:auto;
      overscroll-behavior:contain;isolation:isolate;pointer-events:auto!important
    }
    .admin-tools-layer[hidden]{display:none!important}
    .admin-tools-layer *{pointer-events:auto!important}
    .admin-tools-head{position:sticky;top:0;z-index:2;background:#0f172a;color:#fff}
    .admin-tools-head h2,.driver-manage-head h2,.staff-manage-head h2{
      margin:0;font-size:24px;letter-spacing:-.7px
    }
    .driver-manage-head,.staff-manage-head{
      position:sticky!important;top:0!important;z-index:2!important;gap:0!important;
      background:#0f172a!important;color:#fff!important
    }
    .driver-manage-head > button,.staff-manage-head > button{display:none!important}

    .admin-tools-grid{
      display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;
      padding:20px 16px 28px
    }
    .admin-tools-card{
      width:100%;min-width:0;min-height:190px;box-sizing:border-box;
      border:1px solid #e2e8f0;border-radius:20px;background:#fff;
      box-shadow:0 5px 16px rgba(15,23,42,.08);display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;padding:20px 12px;
      color:#0f172a;cursor:pointer;touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;user-select:none;position:relative;z-index:1
    }
    .admin-tools-card:active{transform:scale(.985)}
    .admin-tools-icon{font-size:48px;line-height:1;margin-bottom:15px}
    .admin-tools-card strong{font-size:22px;line-height:1.25;letter-spacing:-.6px}
    .admin-tools-card span{margin-top:10px;color:#64748b;font-size:14px;line-height:1.5;word-break:keep-all}

    .driver-manage-layer,.staff-manage-layer{z-index:60000!important;pointer-events:auto!important}
    .driver-modal-backdrop{z-index:70000!important;pointer-events:auto!important}
    .forced-password-layer{z-index:80000!important;pointer-events:auto!important}

    .admin-tools-notice{
      position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));
      transform:translateX(-50%);z-index:90000;box-sizing:border-box;
      max-width:calc(100vw - 32px);padding:12px 18px;border-radius:12px;
      background:#0f172a;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.24);
      font-size:15px;font-weight:800;line-height:1.35;text-align:center;
      white-space:nowrap;pointer-events:none!important
    }

    @media(max-width:390px){
      .admin-console-bar h1{font-size:20px!important}
      .admin-console-bar .admin-tools-open{padding:0 9px;font-size:13px;margin-right:5px}
      .admin-tools-grid{gap:11px;padding:16px 13px 24px}
      .admin-tools-card{min-height:174px;border-radius:17px;padding:16px 8px}
      .admin-tools-icon{font-size:43px;margin-bottom:13px}
      .admin-tools-card strong{font-size:20px}
      .admin-tools-card span{font-size:13px}
      .admin-tools-notice{font-size:14px;white-space:normal;width:max-content}
    }
  `;
  document.head.appendChild(style);

  const normalize = (value) => String(value || '').replace(/\s+/g, '');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function notify(message) {
    document.querySelectorAll('.admin-tools-notice').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'admin-tools-notice';
    node.setAttribute('role', 'status');
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  async function getCurrentUser() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (!token) {
      currentUser = null;
      currentToken = '';
      userPromise = null;
      return null;
    }
    if (currentUser && currentToken === token) return currentUser;
    if (userPromise && currentToken === token) return userPromise;

    currentUser = null;
    currentToken = token;
    userPromise = (async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        if ((localStorage.getItem(TOKEN_KEY) || '') !== token) return null;
        currentUser = data.user || null;
        return currentUser;
      } catch {
        return null;
      } finally {
        if (currentToken === token) userPromise = null;
      }
    })();
    return userPromise;
  }

  const isAdminUser = (user) => user?.role === 'staff' && user?.staffRole === 'admin';
  const isStaffConsole = (appbar) => normalize(appbar?.querySelector('h1')?.textContent).includes('출입신청관리');
  const managementLayer = () => document.querySelector('.driver-manage-layer,.staff-manage-layer');

  function removeManagementLayer() {
    document.querySelectorAll('.driver-manage-layer,.staff-manage-layer').forEach((node) => node.remove());
  }

  function removeMenuLayer() {
    menuLayer?.remove();
    menuLayer = null;
  }

  function showMenuLayer() {
    if (menuLayer) {
      menuLayer.hidden = false;
      menuLayer.style.pointerEvents = 'auto';
    }
  }

  function normalizeManagementLayer(layer) {
    if (!layer) return;
    layer.querySelector('.driver-manage-head > button,.staff-manage-head > button')?.remove();
    if (layer.classList.contains('driver-manage-layer')) {
      const title = layer.querySelector('.driver-manage-head h2');
      if (title) title.textContent = '회원관리';
    }
  }

  async function findSourceButton(selector, timeout = 1500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const appbar = app.querySelector('.appbar');
      const button = appbar?.querySelector(selector);
      if (button) return button;
      await sleep(50);
    }
    return null;
  }

  function invokeRegisteredHandler(button) {
    if (typeof button?.onclick === 'function') {
      button.onclick.call(button, {
        type: 'click',
        target: button,
        currentTarget: button,
        preventDefault() {},
        stopPropagation() {},
      });
      return true;
    }
    return false;
  }

  async function openManagement(kind) {
    if (!menuLayer || menuLayer.hidden) return;
    const selector = kind === 'members' ? '.driver-manage-open' : '.staff-manage-open';
    const sourceButton = await findSourceButton(selector);
    if (!sourceButton || !invokeRegisteredHandler(sourceButton)) {
      notify('관리 기능을 불러오지 못했습니다. 앱을 다시 실행해 주세요.');
      return;
    }

    history.pushState({ ...(history.state || {}), adminTools: 'management', adminToolKind: kind }, '');
    menuLayer.hidden = true;

    requestAnimationFrame(() => {
      const layer = managementLayer();
      if (!layer) {
        notify('관리 화면을 열지 못했습니다. 다시 시도해 주세요.');
        history.back();
        return;
      }
      normalizeManagementLayer(layer);
    });
  }

  function bindCard(card, kind) {
    let lastActivationAt = 0;
    const activate = (event) => {
      const now = Date.now();
      if (now - lastActivationAt < 450) return;
      if (event.type === 'pointerup' && event.pointerType === 'mouse') return;
      if (event.cancelable) event.preventDefault();
      lastActivationAt = now;
      openManagement(kind);
    };

    card.addEventListener('pointerup', activate, { passive: false });
    card.addEventListener('click', activate, { passive: false });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
  }

  function openMenu() {
    if (menuLayer?.isConnected) {
      showMenuLayer();
      return;
    }

    document.querySelectorAll('.admin-tools-layer').forEach((node) => node.remove());
    removeManagementLayer();

    menuLayer = document.createElement('section');
    menuLayer.className = 'admin-tools-layer';
    menuLayer.setAttribute('aria-label', '관리자모드');
    menuLayer.innerHTML = `
      <header class="admin-tools-head"><h2>관리자모드</h2></header>
      <main class="admin-tools-grid">
        <button type="button" class="admin-tools-card" data-admin-tool="members">
          <div class="admin-tools-icon" aria-hidden="true">👥</div>
          <strong>회원관리</strong>
          <span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
        </button>
        <button type="button" class="admin-tools-card" data-admin-tool="staff">
          <div class="admin-tools-icon" aria-hidden="true">🪪</div>
          <strong>직원관리</strong>
          <span>직원 계정과 권한을<br>조회하고 관리합니다.</span>
        </button>
      </main>`;

    document.body.appendChild(menuLayer);
    history.pushState({ ...(history.state || {}), adminTools: 'menu' }, '');

    bindCard(menuLayer.querySelector('[data-admin-tool="members"]'), 'members');
    bindCard(menuLayer.querySelector('[data-admin-tool="staff"]'), 'staff');
  }

  async function handleAdminMode(button) {
    if (button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    try {
      const user = await getCurrentUser();
      if (!isAdminUser(user)) {
        notify('관리자 권한이 없습니다.');
        return;
      }
      openMenu();
    } finally {
      button.removeAttribute('aria-busy');
    }
  }

  async function enhanceHeader() {
    const appbar = app.querySelector('.appbar');
    const logout = appbar?.querySelector('[data-logout]');
    if (!appbar || !logout || !isStaffConsole(appbar)) return;

    const user = await getCurrentUser();
    if (!isAdminUser(user)) {
      appbar.classList.remove('admin-console-bar');
      appbar.querySelector('.admin-tools-open')?.remove();
      return;
    }

    appbar.classList.add('admin-console-bar');
    if (appbar.querySelector('.admin-tools-open')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-tools-open';
    button.textContent = '관리자모드';
    button.onclick = () => handleAdminMode(button);
    appbar.insertBefore(button, logout);
  }

  function handlePopState(event) {
    const mode = event.state?.adminTools;
    if (mode === 'menu') {
      removeManagementLayer();
      showMenuLayer();
      return;
    }
    removeManagementLayer();
    removeMenuLayer();
  }

  function watchManagementClose() {
    let hadLayer = false;
    new MutationObserver(() => {
      const layer = managementLayer();
      normalizeManagementLayer(layer);
      const hasLayer = !!layer;
      if (hadLayer && !hasLayer && history.state?.adminTools === 'management') {
        clearTimeout(closeCheckTimer);
        closeCheckTimer = setTimeout(() => {
          if (!managementLayer() && history.state?.adminTools === 'management') history.back();
        }, 180);
      }
      hadLayer = hasLayer;
    }).observe(document.body, { childList: true, subtree: true });
  }

  let scheduled = false;
  const scheduleEnhance = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceHeader();
    });
  };

  new MutationObserver(scheduleEnhance).observe(app, { childList: true, subtree: true });
  window.addEventListener('popstate', handlePopState);
  watchManagementClose();
  scheduleEnhance();
})();
