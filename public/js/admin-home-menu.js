(() => {
  const app = document.getElementById('app');
  if (!app) return;

  let portal = null;
  let currentUser = null;
  let initialized = false;
  let closingForHistory = false;

  const style = document.createElement('style');
  style.textContent = `
    html.admin-auth-pending #app{visibility:hidden!important}
    body.admin-portal-home{background:#f8fafc;overflow:auto}
    body.admin-portal-home #app{display:none!important}
    body.admin-applications-view .driver-manage-open,
    body.admin-applications-view .staff-manage-open{display:none!important}
    .admin-portal-shell{
      position:fixed;inset:0;z-index:2147483000;background:#f8fafc;
      overflow:auto;overscroll-behavior:contain;pointer-events:auto!important;
      touch-action:pan-y;-webkit-tap-highlight-color:transparent
    }
    .admin-portal-shell[hidden]{display:none!important}
    .admin-portal-head{
      min-height:112px;box-sizing:border-box;display:grid;
      grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;
      align-items:center;gap:2px 14px;padding:18px 22px;background:#0f172a;color:#fff
    }
    .admin-portal-title{grid-column:1;grid-row:1;margin:0;font-size:30px;line-height:1.12;letter-spacing:-1.2px;white-space:nowrap}
    .admin-portal-user{grid-column:1;grid-row:2;margin:2px 0 0;color:#cbd5e1;font-size:17px}
    .admin-portal-logout{
      grid-column:2;grid-row:1/span 2;min-width:100px;min-height:48px;padding:0 16px;
      border:1px solid rgba(255,255,255,.28);border-radius:14px;background:rgba(255,255,255,.09);
      color:#fff;font-size:17px;font-weight:800;cursor:pointer;pointer-events:auto!important;touch-action:manipulation
    }
    .admin-portal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 18px 30px}
    .admin-portal-card{
      position:relative;z-index:1;min-height:205px;border:1px solid #e2e8f0;border-radius:20px;
      background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.08);display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;padding:22px 13px;color:#0f172a;
      cursor:pointer;pointer-events:auto!important;touch-action:manipulation;-webkit-tap-highlight-color:transparent
    }
    .admin-portal-card:active{transform:scale(.985)}
    .admin-portal-card>*{pointer-events:none}
    .admin-portal-icon{font-size:52px;line-height:1;margin-bottom:17px}
    .admin-portal-card strong{font-size:23px;line-height:1.25;letter-spacing:-.7px}
    .admin-portal-card span{margin-top:11px;color:#64748b;font-size:14px;line-height:1.55;word-break:keep-all}
    .driver-manage-layer,.staff-manage-layer{z-index:2147483100!important}
    @media(max-width:390px){
      .admin-portal-head{min-height:104px;padding:16px 18px}.admin-portal-title{font-size:27px}
      .admin-portal-user{font-size:16px}.admin-portal-logout{min-width:92px;min-height:46px;padding:0 13px;font-size:16px}
      .admin-portal-grid{gap:11px;padding:16px 14px 26px}.admin-portal-card{min-height:188px;padding:18px 9px;border-radius:17px}
      .admin-portal-icon{font-size:45px;margin-bottom:14px}.admin-portal-card strong{font-size:21px}.admin-portal-card span{font-size:13px}
    }
  `;
  document.head.appendChild(style);

  function historyState(mode, extra = {}) {
    return { view: 'staffConsole', adminPortal: mode, ...extra };
  }

  function managementLayer() {
    return document.querySelector('.driver-manage-layer,.staff-manage-layer');
  }

  function closeManagementLayers() {
    closingForHistory = true;
    document.querySelectorAll('.driver-manage-layer,.staff-manage-layer').forEach((node) => node.remove());
    queueMicrotask(() => { closingForHistory = false; });
  }

  function showHome({ replace = false } = {}) {
    closeManagementLayers();
    document.body.classList.remove('admin-applications-view', 'admin-management-open');
    document.body.classList.add('admin-portal-home');
    portal.hidden = false;
    document.documentElement.classList.remove('admin-auth-pending');
    const state = historyState('home');
    if (replace) history.replaceState(state, '');
    window.scrollTo(0, 0);
  }

  function showApplications({ fromHistory = false } = {}) {
    closeManagementLayers();
    document.body.classList.remove('admin-portal-home', 'admin-management-open');
    document.body.classList.add('admin-applications-view');
    portal.hidden = true;
    if (!fromHistory) history.pushState(historyState('applications'), '');
    window.scrollTo(0, 0);
  }

  function openManagement(kind, selector) {
    const button = app.querySelector(`:scope > .appbar ${selector}`);
    if (!button) return;

    document.body.classList.remove('admin-portal-home', 'admin-applications-view');
    document.body.classList.add('admin-management-open');
    portal.hidden = true;
    history.pushState(historyState('management', { adminManagement: kind }), '');
    button.click();
  }

  async function logout() {
    try {
      const token = localStorage.getItem('ep_token') || '';
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* 로컬 로그아웃은 계속 진행 */ }
    localStorage.removeItem('ep_token');
    location.reload();
  }

  function createPortal() {
    portal = document.createElement('section');
    portal.className = 'admin-portal-shell';
    portal.hidden = true;
    portal.setAttribute('aria-label', '관리자 메뉴');
    portal.innerHTML = `
      <header class="admin-portal-head">
        <h1 class="admin-portal-title">관리자모드</h1>
        <p class="admin-portal-user"></p>
        <button type="button" class="admin-portal-logout">로그아웃</button>
      </header>
      <main class="admin-portal-grid">
        <button type="button" class="admin-portal-card" data-admin-action="applications">
          <div class="admin-portal-icon" aria-hidden="true">📋</div><strong>신청내역</strong>
          <span>출입 신청을 확인하고<br>승인·반려 처리합니다.</span>
        </button>
        <button type="button" class="admin-portal-card" data-admin-action="members">
          <div class="admin-portal-icon" aria-hidden="true">👥</div><strong>회원관리</strong>
          <span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
        </button>
        <button type="button" class="admin-portal-card" data-admin-action="staff">
          <div class="admin-portal-icon" aria-hidden="true">🪪</div><strong>직원관리</strong>
          <span>직원 계정과 권한을<br>조회하고 관리합니다.</span>
        </button>
      </main>`;

    document.body.appendChild(portal);
    portal.querySelector('.admin-portal-user').textContent = `${currentUser?.name || '관리자'}님`;
    portal.querySelector('.admin-portal-logout').onclick = logout;
    portal.querySelector('[data-admin-action="applications"]').onclick = () => showApplications();
    portal.querySelector('[data-admin-action="members"]').onclick = () => openManagement('members', '.driver-manage-open');
    portal.querySelector('[data-admin-action="staff"]').onclick = () => openManagement('staff', '.staff-manage-open');
  }

  function watchLayers() {
    let hadLayer = false;
    new MutationObserver(() => {
      const layer = managementLayer();
      const hasLayer = !!layer;
      if (layer?.classList.contains('driver-manage-layer')) {
        const title = layer.querySelector('.driver-manage-head h2');
        if (title) title.textContent = '회원관리';
      }
      if (hadLayer && !hasLayer && !closingForHistory && history.state?.adminPortal === 'management') {
        history.back();
      }
      hadLayer = hasLayer;
    }).observe(document.body, { childList: true, subtree: true });
  }

  function handlePopState(event) {
    if (!initialized) return;
    const mode = event.state?.adminPortal;
    if (mode === 'home') {
      showHome();
    } else if (mode === 'applications') {
      showApplications({ fromHistory: true });
    } else if (!mode) {
      closeManagementLayers();
      portal.hidden = true;
      document.body.classList.remove('admin-portal-home', 'admin-applications-view', 'admin-management-open');
    }
  }

  function initialize(event) {
    if (initialized) {
      showHome({ replace: true });
      return;
    }
    const user = event?.detail?.user;
    if (!user || user.role !== 'staff' || user.staffRole !== 'admin') {
      document.documentElement.classList.remove('admin-auth-pending');
      return;
    }
    currentUser = user;
    initialized = true;
    createPortal();
    watchLayers();
    window.addEventListener('popstate', handlePopState);
    showHome({ replace: true });
  }

  window.addEventListener('entrypass:admin-login', initialize);
})();
