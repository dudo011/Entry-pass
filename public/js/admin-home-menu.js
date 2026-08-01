(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const style = document.createElement('style');
  style.textContent = `
    body.admin-portal-enabled{background:#f8fafc}
    body.admin-portal-enabled #app > .appbar{display:none!important}
    body.admin-portal-enabled #app > .screen{padding-top:0!important}
    body.admin-portal-enabled.admin-portal-home #app > .screen{
      visibility:hidden!important;
      pointer-events:none!important;
      height:0!important;
      min-height:0!important;
      overflow:hidden!important;
    }
    body.admin-portal-enabled.admin-portal-applications #app > .screen{
      visibility:visible!important;
      pointer-events:auto!important;
      height:auto!important;
      min-height:calc(100vh - 116px)!important;
      padding-top:116px!important;
    }
    .admin-portal-shell{
      position:fixed;
      inset:0;
      z-index:12000;
      background:#f8fafc;
      overflow:auto;
      overscroll-behavior:contain;
    }
    .admin-portal-shell[hidden]{display:none!important}
    .admin-portal-head{
      min-height:116px;
      box-sizing:border-box;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      grid-template-rows:auto auto;
      align-items:center;
      gap:2px 14px;
      padding:20px 22px;
      background:#0f172a;
      color:#fff;
    }
    .admin-portal-title{
      grid-column:1;
      grid-row:1;
      margin:0;
      font-size:30px;
      line-height:1.15;
      letter-spacing:-1.2px;
      white-space:nowrap;
    }
    .admin-portal-user{
      grid-column:1;
      grid-row:2;
      margin:2px 0 0;
      color:#cbd5e1;
      font-size:17px;
    }
    .admin-portal-logout{
      grid-column:2;
      grid-row:1 / span 2;
      min-width:100px;
      min-height:48px;
      padding:0 16px;
      border:1px solid rgba(255,255,255,.28);
      border-radius:14px;
      background:rgba(255,255,255,.09);
      color:#fff;
      font-size:17px;
      font-weight:800;
      cursor:pointer;
      touch-action:manipulation;
    }
    .admin-portal-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      padding:20px 18px 30px;
    }
    .admin-portal-card{
      min-height:205px;
      border:1px solid #e2e8f0;
      border-radius:20px;
      background:#fff;
      box-shadow:0 5px 16px rgba(15,23,42,.08);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      text-align:center;
      padding:22px 13px;
      color:#0f172a;
      cursor:pointer;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }
    .admin-portal-card:active{transform:scale(.985)}
    .admin-portal-card > *{pointer-events:none}
    .admin-portal-icon{font-size:52px;line-height:1;margin-bottom:17px}
    .admin-portal-card strong{font-size:23px;line-height:1.25;letter-spacing:-.7px}
    .admin-portal-card span{margin-top:11px;color:#64748b;font-size:14px;line-height:1.55;word-break:keep-all}
    .admin-app-head{
      position:fixed;
      inset:0 0 auto 0;
      z-index:11990;
      height:116px;
      box-sizing:border-box;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:18px 20px;
      background:#0f172a;
      color:#fff;
    }
    .admin-app-head[hidden]{display:none!important}
    .admin-app-back{
      width:46px;
      height:46px;
      border:0;
      border-radius:13px;
      background:rgba(255,255,255,.12);
      color:#fff;
      font-size:28px;
      cursor:pointer;
      touch-action:manipulation;
    }
    .admin-app-title{margin:0;font-size:28px;line-height:1.1;letter-spacing:-1px;white-space:nowrap}
    .admin-app-logout{
      min-height:46px;
      padding:0 14px;
      border:1px solid rgba(255,255,255,.28);
      border-radius:13px;
      background:rgba(255,255,255,.09);
      color:#fff;
      font-size:15px;
      font-weight:800;
      cursor:pointer;
      touch-action:manipulation;
    }
    @media(max-width:390px){
      .admin-portal-head{min-height:108px;padding:18px 18px}
      .admin-portal-title{font-size:27px}
      .admin-portal-user{font-size:16px}
      .admin-portal-logout{min-width:92px;min-height:46px;padding:0 13px;font-size:16px}
      .admin-portal-grid{gap:11px;padding:16px 14px 26px}
      .admin-portal-card{min-height:188px;padding:18px 9px;border-radius:17px}
      .admin-portal-icon{font-size:45px;margin-bottom:14px}
      .admin-portal-card strong{font-size:21px}
      .admin-portal-card span{font-size:13px}
      .admin-app-head{height:108px;padding:16px 14px;gap:9px}
      body.admin-portal-enabled.admin-portal-applications #app > .screen{padding-top:108px!important;min-height:calc(100vh - 108px)!important}
      .admin-app-title{font-size:24px}
      .admin-app-back{width:43px;height:43px}
      .admin-app-logout{padding:0 11px;font-size:14px}
    }
  `;
  document.head.appendChild(style);

  const normalized = (text) => String(text || '').replace(/\s+/g, '');
  let initialized = false;
  let portal = null;
  let applicationHead = null;

  function findAdminControls() {
    const appbar = app.querySelector(':scope > .appbar');
    const title = appbar?.querySelector('h1');
    const logout = appbar?.querySelector('[data-logout]');
    const member = appbar?.querySelector('.driver-manage-open');
    const staff = appbar?.querySelector('.staff-manage-open');
    if (!appbar || !title || !logout || !member || !staff) return null;
    if (!normalized(title.textContent).includes('출입신청관리')) return null;
    return { appbar, title, logout, member, staff };
  }

  function currentUserName() {
    const sub = app.querySelector(':scope > .appbar .sub');
    return sub?.textContent?.trim() || '관리자님';
  }

  function clickFreshControl(selector) {
    const button = app.querySelector(`:scope > .appbar ${selector}`);
    if (button) button.click();
  }

  function logout() {
    clickFreshControl('[data-logout]');
  }

  function renameMemberLayer() {
    document.querySelectorAll('.driver-manage-head h2').forEach((title) => {
      if (title.textContent !== '회원관리') title.textContent = '회원관리';
    });
  }

  function showHome() {
    document.body.classList.add('admin-portal-enabled', 'admin-portal-home');
    document.body.classList.remove('admin-portal-applications');
    if (portal) portal.hidden = false;
    if (applicationHead) applicationHead.hidden = true;
    window.scrollTo(0, 0);
  }

  function showApplications() {
    document.body.classList.add('admin-portal-enabled', 'admin-portal-applications');
    document.body.classList.remove('admin-portal-home');
    if (portal) portal.hidden = true;
    if (applicationHead) applicationHead.hidden = false;
    window.scrollTo(0, 0);
  }

  function createPortal() {
    portal = document.createElement('section');
    portal.className = 'admin-portal-shell';
    portal.setAttribute('aria-label', '관리자 메뉴');
    portal.innerHTML = `
      <header class="admin-portal-head">
        <h1 class="admin-portal-title">관리자모드</h1>
        <p class="admin-portal-user"></p>
        <button type="button" class="admin-portal-logout">로그아웃</button>
      </header>
      <main class="admin-portal-grid">
        <button type="button" class="admin-portal-card" data-admin-action="applications">
          <div class="admin-portal-icon" aria-hidden="true">📋</div>
          <strong>신청내역</strong>
          <span>출입 신청을 확인하고<br>승인·반려 처리합니다.</span>
        </button>
        <button type="button" class="admin-portal-card" data-admin-action="members">
          <div class="admin-portal-icon" aria-hidden="true">👥</div>
          <strong>회원관리</strong>
          <span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
        </button>
        <button type="button" class="admin-portal-card" data-admin-action="staff">
          <div class="admin-portal-icon" aria-hidden="true">🪪</div>
          <strong>직원관리</strong>
          <span>직원 계정과 권한을<br>조회하고 관리합니다.</span>
        </button>
      </main>`;

    applicationHead = document.createElement('header');
    applicationHead.className = 'admin-app-head';
    applicationHead.hidden = true;
    applicationHead.innerHTML = `
      <button type="button" class="admin-app-back" aria-label="관리자 메뉴로 돌아가기">‹</button>
      <h1 class="admin-app-title">신청내역</h1>
      <button type="button" class="admin-app-logout">로그아웃</button>`;

    document.body.append(portal, applicationHead);
    portal.querySelector('.admin-portal-user').textContent = currentUserName();
    portal.querySelector('.admin-portal-logout').addEventListener('click', logout);
    applicationHead.querySelector('.admin-app-logout').addEventListener('click', logout);
    applicationHead.querySelector('.admin-app-back').addEventListener('click', showHome);

    portal.addEventListener('click', (event) => {
      const card = event.target.closest('[data-admin-action]');
      if (!card) return;
      const action = card.dataset.adminAction;
      if (action === 'applications') showApplications();
      if (action === 'members') clickFreshControl('.driver-manage-open');
      if (action === 'staff') clickFreshControl('.staff-manage-open');
    });
  }

  function initialize() {
    if (initialized) return true;
    if (!findAdminControls()) return false;
    initialized = true;
    createPortal();
    showHome();
    renameMemberLayer();
    return true;
  }

  const observer = new MutationObserver(() => {
    if (!initialized) {
      initialize();
      return;
    }
    // 앱 자체 재렌더링 뒤에도 관리자 전용 표시 상태만 복원한다.
    document.body.classList.add('admin-portal-enabled');
    renameMemberLayer();
  });
  observer.observe(app, { childList: true });

  const layerObserver = new MutationObserver(renameMemberLayer);
  layerObserver.observe(document.body, { childList: true, subtree: false });

  initialize();
})();
