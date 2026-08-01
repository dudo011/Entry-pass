(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_token';
  let portal = null;
  let currentUser = null;
  let initialized = false;
  let removingLayerForHistory = false;

  const style = document.createElement('style');
  style.textContent = `
    html.admin-auth-pending #app{visibility:hidden!important}
    body.admin-portal-home{background:#f8fafc;overflow:auto}
    body.admin-portal-home #app{display:none!important}
    body.admin-applications-view .driver-manage-open,
    body.admin-applications-view .staff-manage-open{display:none!important}
    .admin-portal-shell{position:fixed;inset:0;z-index:12000;background:#f8fafc;overflow:auto;overscroll-behavior:contain}
    .admin-portal-shell[hidden]{display:none!important}
    .admin-portal-head{min-height:112px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:2px 14px;padding:18px 22px;background:#0f172a;color:#fff}
    .admin-portal-title{grid-column:1;grid-row:1;margin:0;font-size:30px;line-height:1.12;letter-spacing:-1.2px;white-space:nowrap}
    .admin-portal-user{grid-column:1;grid-row:2;margin:2px 0 0;color:#cbd5e1;font-size:17px}
    .admin-portal-logout{grid-column:2;grid-row:1/span 2;min-width:100px;min-height:48px;padding:0 16px;border:1px solid rgba(255,255,255,.28);border-radius:14px;background:rgba(255,255,255,.09);color:#fff;font-size:17px;font-weight:800;cursor:pointer;touch-action:manipulation}
    .admin-portal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 18px 30px}
    .admin-portal-card{min-height:205px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.08);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:22px 13px;color:#0f172a;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .admin-portal-card:active{transform:scale(.985)}
    .admin-portal-card>*{pointer-events:none}
    .admin-portal-icon{font-size:52px;line-height:1;margin-bottom:17px}
    .admin-portal-card strong{font-size:23px;line-height:1.25;letter-spacing:-.7px}
    .admin-portal-card span{margin-top:11px;color:#64748b;font-size:14px;line-height:1.55;word-break:keep-all}
    @media(max-width:390px){.admin-portal-head{min-height:104px;padding:16px 18px}.admin-portal-title{font-size:27px}.admin-portal-user{font-size:16px}.admin-portal-logout{min-width:92px;min-height:46px;padding:0 13px;font-size:16px}.admin-portal-grid{gap:11px;padding:16px 14px 26px}.admin-portal-card{min-height:188px;padding:18px 9px;border-radius:17px}.admin-portal-icon{font-size:45px;margin-bottom:14px}.admin-portal-card strong{font-size:21px}.admin-portal-card span{font-size:13px}}
  `;
  document.head.appendChild(style);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalized = (text) => String(text || '').replace(/\s+/g, '');

  function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function getMe() {
    const response = await fetch('/api/auth/me', { headers: authHeaders(), credentials: 'same-origin' });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data.user || null;
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders(), credentials: 'same-origin' });
    } catch { /* 네트워크 오류여도 로컬 세션은 종료 */ }
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  function isStaffConsole() {
    const title = app.querySelector(':scope > .appbar h1');
    return normalized(title?.textContent).includes('출입신청관리');
  }

  async function ensureStaffConsole(timeout = 5000) {
    if (isStaffConsole()) return true;
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const staffEntry = app.querySelector('[data-role="staff"]');
      if (staffEntry) {
        staffEntry.click();
        await sleep(80);
      }
      if (isStaffConsole()) return true;
      await sleep(50);
    }
    return false;
  }

  async function waitForControl(selector, timeout = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const button = app.querySelector(`:scope > .appbar ${selector}`);
      if (button) return button;
      await sleep(50);
    }
    return null;
  }

  function removeManagementLayers() {
    removingLayerForHistory = true;
    document.querySelectorAll('.driver-manage-layer,.staff-manage-layer').forEach((layer) => layer.remove());
    queueMicrotask(() => { removingLayerForHistory = false; });
  }

  function applyHome() {
    removeManagementLayers();
    document.body.classList.remove('admin-applications-view', 'admin-management-open');
    document.body.classList.add('admin-portal-home');
    if (portal) portal.hidden = false;
    window.scrollTo(0, 0);
  }

  function applyApplications() {
    removeManagementLayers();
    document.body.classList.remove('admin-portal-home', 'admin-management-open');
    document.body.classList.add('admin-applications-view');
    if (portal) portal.hidden = true;
    window.scrollTo(0, 0);
  }

  function deactivatePortal() {
    removeManagementLayers();
    document.body.classList.remove('admin-portal-home', 'admin-applications-view', 'admin-management-open');
    if (portal) portal.hidden = true;
  }

  function historyState(mode, extra = {}) {
    return { view: 'staffConsole', adminPortal: mode, ...extra };
  }

  async function navigateApplications() {
    if (!(await ensureStaffConsole())) return;
    history.pushState(historyState('applications'), '');
    applyApplications();
  }

  async function navigateManagement(kind, selector) {
    if (!(await ensureStaffConsole())) return;
    const button = await waitForControl(selector);
    if (!button) return;

    history.pushState(historyState('management', { adminManagement: kind }), '');
    document.body.classList.remove('admin-portal-home', 'admin-applications-view');
    document.body.classList.add('admin-management-open');
    if (portal) portal.hidden = true;
    button.click();
  }

  function createPortal() {
    portal = document.createElement('section');
    portal.className = 'admin-portal-shell';
    portal.hidden = true;
    portal.innerHTML = `
      <header class="admin-portal-head">
        <h1 class="admin-portal-title">관리자모드</h1>
        <p class="admin-portal-user"></p>
        <button type="button" class="admin-portal-logout">로그아웃</button>
      </header>
      <main class="admin-portal-grid">
        <button type="button" class="admin-portal-card" data-admin-action="applications"><div class="admin-portal-icon">📋</div><strong>신청내역</strong><span>출입 신청을 확인하고<br>승인·반려 처리합니다.</span></button>
        <button type="button" class="admin-portal-card" data-admin-action="members"><div class="admin-portal-icon">👥</div><strong>회원관리</strong><span>차량기사 회원 정보를<br>조회하고 관리합니다.</span></button>
        <button type="button" class="admin-portal-card" data-admin-action="staff"><div class="admin-portal-icon">🪪</div><strong>직원관리</strong><span>직원 계정과 권한을<br>조회하고 관리합니다.</span></button>
      </main>`;

    document.body.appendChild(portal);
    portal.querySelector('.admin-portal-user').textContent = `${currentUser.name || '관리자'}님`;
    portal.querySelector('.admin-portal-logout').addEventListener('click', logout);
    portal.addEventListener('click', async (event) => {
      const card = event.target.closest('[data-admin-action]');
      if (!card || card.disabled) return;
      card.disabled = true;
      try {
        const action = card.dataset.adminAction;
        if (action === 'applications') await navigateApplications();
        if (action === 'members') await navigateManagement('members', '.driver-manage-open');
        if (action === 'staff') await navigateManagement('staff', '.staff-manage-open');
      } finally {
        card.disabled = false;
      }
    });
  }

  function watchManagementLayers() {
    let hadLayer = false;
    const observer = new MutationObserver(() => {
      const memberLayer = document.querySelector('.driver-manage-layer');
      const staffLayer = document.querySelector('.staff-manage-layer');
      const hasLayer = !!(memberLayer || staffLayer);

      if (memberLayer) {
        memberLayer.style.zIndex = '13000';
        const title = memberLayer.querySelector('.driver-manage-head h2');
        if (title) title.textContent = '회원관리';
      }
      if (staffLayer) staffLayer.style.zIndex = '13000';

      if (hadLayer && !hasLayer && !removingLayerForHistory && history.state?.adminPortal === 'management') {
        history.back();
      }
      hadLayer = hasLayer;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handlePopState(event) {
    if (!initialized) return;
    const mode = event.state?.adminPortal;
    if (mode === 'home') {
      applyHome();
      return;
    }
    if (mode === 'applications') {
      setTimeout(applyApplications, 0);
      return;
    }
    if (mode === 'management') {
      return;
    }
    deactivatePortal();
  }

  async function initialize(event) {
    if (initialized) return;
    currentUser = event?.detail?.user || await getMe().catch(() => null);
    if (!currentUser || currentUser.role !== 'staff' || currentUser.staffRole !== 'admin') {
      document.documentElement.classList.remove('admin-auth-pending');
      return;
    }

    initialized = true;
    createPortal();
    watchManagementLayers();
    window.addEventListener('popstate', handlePopState);

    history.replaceState(historyState('home'), '');
    applyHome();
    document.documentElement.classList.remove('admin-auth-pending');
  }

  window.addEventListener('entrypass:admin-login', initialize);
})();
