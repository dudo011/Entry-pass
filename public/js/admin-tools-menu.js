(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_token';
  let currentUser = null;
  let currentUserToken = '';
  let currentUserPromise = null;
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
      min-height:76px!important;height:76px!important;box-sizing:border-box!important;
      padding:14px 16px!important;display:flex!important;align-items:center!important
    }
    .admin-console-bar{gap:10px!important}
    .admin-console-bar h1{font-size:23px!important;line-height:1.15!important;white-space:nowrap!important;letter-spacing:-.7px!important}
    .admin-console-bar .sub{margin-top:2px!important;line-height:1.2!important}
    .admin-console-bar .admin-tools-open{flex:none;order:2;margin-left:auto;margin-right:7px;min-height:42px;padding:0 12px;border:0;border-radius:11px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;font-weight:900;white-space:nowrap;cursor:pointer;touch-action:manipulation}
    .admin-console-bar .admin-tools-open[aria-busy="true"]{opacity:.72;cursor:wait}
    .admin-console-bar [data-logout]{order:3;margin-left:0!important;flex:none}
    .admin-tools-layer{position:fixed;inset:0;z-index:12000;background:#f8fafc;overflow:auto;overscroll-behavior:contain}
    .admin-tools-layer[hidden]{display:none!important}
    .admin-tools-head{position:sticky;top:0;z-index:2;gap:12px;background:#0f172a;color:#fff}
    .admin-tools-back{width:44px;height:44px;flex:none;border:0;border-radius:12px;background:rgba(255,255,255,.14);color:#fff;font-size:29px;line-height:1;cursor:pointer;touch-action:manipulation}
    .admin-tools-head h2,.driver-manage-head h2,.staff-manage-head h2{margin:0;font-size:24px;letter-spacing:-.7px}
    .driver-manage-head,.staff-manage-head{position:sticky!important;top:0!important;z-index:2!important;gap:0!important;background:#0f172a!important;color:#fff!important}
    .driver-manage-head > button,.staff-manage-head > button{display:none!important}
    .admin-tools-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 16px 28px}
    .admin-tools-card{min-height:190px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px 12px;color:#0f172a;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .admin-tools-card:active{transform:scale(.985)}
    .admin-tools-card > *{pointer-events:none}
    .admin-tools-icon{font-size:48px;line-height:1;margin-bottom:15px}
    .admin-tools-card strong{font-size:22px;line-height:1.25;letter-spacing:-.6px}
    .admin-tools-card span{margin-top:10px;color:#64748b;font-size:14px;line-height:1.5;word-break:keep-all}
    .admin-tools-notice{position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:15000;box-sizing:border-box;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:12px;background:#0f172a;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.24);font-size:15px;font-weight:800;line-height:1.35;text-align:center;white-space:nowrap;pointer-events:none}
    .driver-manage-layer,.staff-manage-layer{z-index:13000!important}
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
  const normalizeSearch = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_.]/g, '');

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
      currentUserToken = '';
      currentUserPromise = null;
      return null;
    }

    if (currentUser && currentUserToken === token) return currentUser;
    if (currentUserPromise && currentUserToken === token) return currentUserPromise;

    currentUser = null;
    currentUserToken = token;
    currentUserPromise = (async () => {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'same-origin',
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        if ((localStorage.getItem(TOKEN_KEY) || '') !== token) return null;
        currentUser = data.user || null;
        return currentUser;
      } catch {
        return null;
      } finally {
        if (currentUserToken === token) currentUserPromise = null;
      }
    })();

    return currentUserPromise;
  }

  function isAdminUser(user) {
    return user?.role === 'staff' && user?.staffRole === 'admin';
  }

  function isStaffConsole(appbar) {
    const title = appbar?.querySelector('h1');
    return normalize(title?.textContent).includes('출입신청관리');
  }

  function managementLayer() {
    return document.querySelector('.driver-manage-layer,.staff-manage-layer');
  }

  function removeManagementLayer() {
    document.querySelectorAll('.driver-manage-layer,.staff-manage-layer').forEach((node) => node.remove());
  }

  function removeMenuLayer() {
    if (menuLayer) menuLayer.remove();
    menuLayer = null;
  }

  function showMenuLayer() {
    if (menuLayer) menuLayer.hidden = false;
  }

  function installVehiclePartialSearch(layer) {
    const search = layer?.querySelector('.driver-search');
    if (!search || search.dataset.normalizedVehicleSearch === '1') return;
    search.dataset.normalizedVehicleSearch = '1';

    search.addEventListener('input', () => {
      const nativeIncludes = String.prototype.includes;
      const patchedIncludes = function patchedIncludes(needle, position) {
        if (nativeIncludes.call(this, needle, position)) return true;
        const normalizedNeedle = normalizeSearch(needle);
        if (!normalizedNeedle) return true;
        return nativeIncludes.call(normalizeSearch(this), normalizedNeedle, 0);
      };

      String.prototype.includes = patchedIncludes;
      queueMicrotask(() => {
        if (String.prototype.includes === patchedIncludes) {
          String.prototype.includes = nativeIncludes;
        }
      });
    }, true);
  }

  function normalizeManagementLayer(layer) {
    if (!layer) return;
    const head = layer.querySelector('.driver-manage-head,.staff-manage-head');
    head?.querySelector(':scope > button')?.remove();

    if (layer.classList.contains('driver-manage-layer')) {
      const title = layer.querySelector('.driver-manage-head h2');
      if (title) title.textContent = '회원관리';
      installVehiclePartialSearch(layer);
    }
  }

  function openManagement(kind) {
    if (!menuLayer) return;
    const selector = kind === 'members' ? '.driver-manage-open' : '.staff-manage-open';
    const sourceButton = app.querySelector(`:scope > .appbar ${selector}`);
    if (!sourceButton) {
      notify('관리 기능을 불러오지 못했습니다. 화면을 새로고침해 주세요.');
      return;
    }

    history.pushState({ ...(history.state || {}), adminTools: 'management', adminToolKind: kind }, '');
    menuLayer.hidden = true;
    sourceButton.click();

    setTimeout(() => {
      const layer = managementLayer();
      if (!layer) {
        history.back();
        return;
      }
      normalizeManagementLayer(layer);
    }, 0);
  }

  function openMenu() {
    if (menuLayer) {
      showMenuLayer();
      return;
    }

    menuLayer = document.createElement('section');
    menuLayer.className = 'admin-tools-layer';
    menuLayer.setAttribute('aria-label', '관리자모드');
    menuLayer.innerHTML = `
      <header class="admin-tools-head">
        <button type="button" class="admin-tools-back" aria-label="출입신청관리로 돌아가기">‹</button>
        <h2>관리자모드</h2>
      </header>
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

    menuLayer.querySelector('.admin-tools-back').onclick = () => history.back();
    menuLayer.querySelector('[data-admin-tool="members"]').onclick = () => openManagement('members');
    menuLayer.querySelector('[data-admin-tool="staff"]').onclick = () => openManagement('staff');
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

  function enhanceHeader() {
    const appbar = app.querySelector(':scope > .appbar');
    const logout = appbar?.querySelector('[data-logout]');
    if (!appbar || !logout || !isStaffConsole(appbar)) return;

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
