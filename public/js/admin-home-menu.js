(() => {
  const app = document.getElementById('app');
  if (!app) return;

  let currentUser = null;
  let initialized = false;
  let portal = null;
  let staffFragment = document.createDocumentFragment();
  let currentMode = 'none';
  let closingLayer = false;

  const style = document.createElement('style');
  style.textContent = `
    html.admin-auth-pending #app{visibility:hidden!important}
    body.admin-native-home{background:#f8fafc}
    .admin-native-screen{min-height:100vh;background:#f8fafc}
    .admin-native-head{min-height:112px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:2px 14px;padding:18px 22px;background:#0f172a;color:#fff}
    .admin-native-title{grid-column:1;grid-row:1;margin:0;font-size:30px;line-height:1.12;letter-spacing:-1.2px;white-space:nowrap}
    .admin-native-user{grid-column:1;grid-row:2;margin:2px 0 0;color:#cbd5e1;font-size:17px}
    .admin-native-logout{grid-column:2;grid-row:1/span 2;min-width:100px;min-height:48px;padding:0 16px;border:1px solid rgba(255,255,255,.28);border-radius:14px;background:rgba(255,255,255,.09);color:#fff;font-size:17px;font-weight:800;cursor:pointer;touch-action:manipulation}
    .admin-native-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 18px 30px}
    .admin-native-card{min-height:205px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:22px 13px;color:#0f172a;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .admin-native-card:active{transform:scale(.985)}
    .admin-native-card>*{pointer-events:none}
    .admin-native-icon{font-size:52px;line-height:1;margin-bottom:17px}
    .admin-native-card strong{font-size:23px;line-height:1.25;letter-spacing:-.7px}
    .admin-native-card span{margin-top:11px;color:#64748b;font-size:14px;line-height:1.55;word-break:keep-all}
    body.admin-applications-view #app>.appbar .driver-manage-open,
    body.admin-applications-view #app>.appbar .staff-manage-open{display:none!important}
    .driver-manage-layer,.staff-manage-layer{z-index:13000!important}
    @media(max-width:390px){
      .admin-native-head{min-height:104px;padding:16px 18px}.admin-native-title{font-size:27px}.admin-native-user{font-size:16px}
      .admin-native-logout{min-width:92px;min-height:46px;padding:0 13px;font-size:16px}
      .admin-native-grid{gap:11px;padding:16px 14px 26px}.admin-native-card{min-height:188px;padding:18px 9px;border-radius:17px}
      .admin-native-icon{font-size:45px;margin-bottom:14px}.admin-native-card strong{font-size:21px}.admin-native-card span{font-size:13px}
    }
  `;
  document.head.appendChild(style);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalized = (text) => String(text || '').replace(/\s+/g, '');

  function isStaffConsoleReady() {
    const title = app.querySelector(':scope > .appbar h1');
    return normalized(title?.textContent).includes('출입신청관리');
  }

  async function waitForStaffConsole(timeout = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (isStaffConsoleReady()) return true;
      await sleep(50);
    }
    return false;
  }

  function moveAppChildrenTo(fragment) {
    while (app.firstChild) fragment.appendChild(app.firstChild);
  }

  function restoreStaffScreen() {
    if (app.firstChild) moveAppChildrenTo(document.createDocumentFragment());
    app.appendChild(staffFragment);
  }

  function captureStaffScreen() {
    staffFragment = document.createDocumentFragment();
    moveAppChildrenTo(staffFragment);
  }

  function closeManagementLayers() {
    closingLayer = true;
    document.querySelectorAll('.driver-manage-layer,.staff-manage-layer').forEach((layer) => layer.remove());
    queueMicrotask(() => { closingLayer = false; });
  }

  function historyState(mode, extra = {}) {
    return { view: 'staffConsole', adminPortal: mode, ...extra };
  }

  function renderHome({ replace = false } = {}) {
    closeManagementLayers();
    if (currentMode === 'applications') captureStaffScreen();
    app.replaceChildren(portal);
    document.body.classList.remove('admin-applications-view', 'admin-management-open');
    document.body.classList.add('admin-native-home');
    currentMode = 'home';
    document.documentElement.classList.remove('admin-auth-pending');
    if (replace) history.replaceState(historyState('home'), '');
    window.scrollTo(0, 0);
  }

  function showApplications({ fromHistory = false } = {}) {
    closeManagementLayers();
    if (currentMode === 'home') app.replaceChildren();
    restoreStaffScreen();
    document.body.classList.remove('admin-native-home', 'admin-management-open');
    document.body.classList.add('admin-applications-view');
    currentMode = 'applications';
    if (!fromHistory) history.pushState(historyState('applications'), '');
    window.scrollTo(0, 0);
  }

  function openManagement(kind, selector) {
    showApplications({ fromHistory: true });
    const button = app.querySelector(`:scope > .appbar ${selector}`);
    if (!button) return;
    history.pushState(historyState('management', { adminManagement: kind }), '');
    document.body.classList.remove('admin-applications-view');
    document.body.classList.add('admin-management-open');
    currentMode = 'management';
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
    portal.className = 'admin-native-screen';
    portal.innerHTML = `
      <header class="admin-native-head">
        <h1 class="admin-native-title">관리자모드</h1>
        <p class="admin-native-user">${currentUser?.name || '관리자'}님</p>
        <button type="button" class="admin-native-logout">로그아웃</button>
      </header>
      <main class="admin-native-grid">
        <button type="button" class="admin-native-card" data-admin-action="applications">
          <div class="admin-native-icon" aria-hidden="true">📋</div><strong>신청내역</strong>
          <span>출입 신청을 확인하고<br>승인·반려 처리합니다.</span>
        </button>
        <button type="button" class="admin-native-card" data-admin-action="members">
          <div class="admin-native-icon" aria-hidden="true">👥</div><strong>회원관리</strong>
          <span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
        </button>
        <button type="button" class="admin-native-card" data-admin-action="staff">
          <div class="admin-native-icon" aria-hidden="true">🪪</div><strong>직원관리</strong>
          <span>직원 계정과 권한을<br>조회하고 관리합니다.</span>
        </button>
      </main>`;

    portal.querySelector('.admin-native-logout').addEventListener('click', logout);
    portal.querySelector('[data-admin-action="applications"]').addEventListener('click', () => showApplications());
    portal.querySelector('[data-admin-action="members"]').addEventListener('click', () => openManagement('members', '.driver-manage-open'));
    portal.querySelector('[data-admin-action="staff"]').addEventListener('click', () => openManagement('staff', '.staff-manage-open'));
  }

  function watchManagementLayers() {
    let hadLayer = false;
    new MutationObserver(() => {
      const memberLayer = document.querySelector('.driver-manage-layer');
      const staffLayer = document.querySelector('.staff-manage-layer');
      const hasLayer = !!(memberLayer || staffLayer);
      if (memberLayer) {
        const title = memberLayer.querySelector('.driver-manage-head h2');
        if (title) title.textContent = '회원관리';
      }
      if (hadLayer && !hasLayer && !closingLayer && history.state?.adminPortal === 'management') {
        history.back();
      }
      hadLayer = hasLayer;
    }).observe(document.body, { childList: true, subtree: true });
  }

  function handlePopState(event) {
    if (!initialized) return;
    const mode = event.state?.adminPortal;
    if (mode === 'home') {
      renderHome();
    } else if (mode === 'applications') {
      showApplications({ fromHistory: true });
    } else if (!mode) {
      closeManagementLayers();
      document.body.classList.remove('admin-native-home', 'admin-applications-view', 'admin-management-open');
    }
  }

  async function initialize(event) {
    const user = event?.detail?.user;
    if (!user || user.role !== 'staff' || user.staffRole !== 'admin') {
      document.documentElement.classList.remove('admin-auth-pending');
      return;
    }

    currentUser = user;
    if (initialized) {
      renderHome({ replace: true });
      return;
    }

    await waitForStaffConsole();
    captureStaffScreen();
    createPortal();
    initialized = true;
    watchManagementLayers();
    window.addEventListener('popstate', handlePopState);
    renderHome({ replace: true });
  }

  window.addEventListener('entrypass:admin-login', initialize);
})();
