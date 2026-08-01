(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const style = document.createElement('style');
  style.textContent = `
    #app.admin-menu-active > .appbar{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      grid-template-rows:auto auto!important;
      align-items:center!important;
      gap:4px 14px!important;
      padding:24px 28px!important;
      min-height:150px!important;
      position:relative!important;
      z-index:2!important;
    }
    #app.admin-menu-active > .appbar h1{
      grid-column:1!important;
      grid-row:1!important;
      margin:0!important;
      white-space:nowrap!important;
      word-break:keep-all!important;
      font-size:clamp(27px,7.5vw,38px)!important;
      line-height:1.15!important;
      letter-spacing:-1.5px!important;
    }
    #app.admin-menu-active > .appbar .sub{
      grid-column:1!important;
      grid-row:2!important;
      display:block!important;
      margin:2px 0 0!important;
      font-size:18px!important;
    }
    #app.admin-menu-active > .appbar [data-logout]{
      grid-column:2!important;
      grid-row:1 / span 2!important;
      align-self:center!important;
      margin:0!important;
      position:relative!important;
      z-index:3!important;
      pointer-events:auto!important;
      touch-action:manipulation!important;
    }
    #app.admin-menu-active > .appbar .driver-manage-open,
    #app.admin-menu-active > .appbar .staff-manage-open{
      position:absolute!important;
      width:1px!important;
      height:1px!important;
      padding:0!important;
      margin:-1px!important;
      overflow:hidden!important;
      clip:rect(0,0,0,0)!important;
      white-space:nowrap!important;
      border:0!important;
      pointer-events:none!important;
    }
    #app.admin-menu-active > .screen{
      position:relative!important;
      z-index:1!important;
      pointer-events:auto!important;
    }
    .admin-home-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      padding:20px 18px 28px;
      position:relative;
      z-index:2;
      pointer-events:auto;
    }
    .admin-home-card{
      min-height:210px;
      border:1px solid #e2e8f0;
      border-radius:20px;
      background:#fff;
      box-shadow:0 5px 16px rgba(15,23,42,.08);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      text-align:center;
      padding:22px 14px;
      cursor:pointer;
      color:#0f172a;
      position:relative;
      z-index:3;
      pointer-events:auto;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }
    .admin-home-card:active{transform:scale(.985)}
    .admin-home-icon{font-size:54px;line-height:1;margin-bottom:18px;pointer-events:none}
    .admin-home-card strong,.admin-home-card span{pointer-events:none}
    .admin-home-card strong{font-size:23px;line-height:1.25;letter-spacing:-.7px}
    .admin-home-card span{margin-top:12px;color:#64748b;font-size:14px;line-height:1.55;word-break:keep-all}
    .admin-applications-view[hidden],.admin-home-grid[hidden],.admin-section-back[hidden]{display:none!important}
    .admin-section-back{
      margin:16px 18px 0;
      min-height:44px;
      padding:0 15px;
      border:1px solid #cbd5e1;
      border-radius:11px;
      background:#fff;
      color:#334155;
      font-size:15px;
      font-weight:800;
      cursor:pointer;
      position:relative;
      z-index:3;
      pointer-events:auto;
      touch-action:manipulation;
    }
    @media(max-width:390px){
      #app.admin-menu-active > .appbar{padding:22px 20px!important;min-height:142px!important}
      #app.admin-menu-active > .appbar h1{font-size:27px!important}
      #app.admin-menu-active > .appbar [data-logout]{padding-left:15px!important;padding-right:15px!important}
      .admin-home-grid{gap:11px;padding:16px 14px 24px}
      .admin-home-card{min-height:190px;padding:18px 10px;border-radius:17px}
      .admin-home-icon{font-size:46px;margin-bottom:15px}
      .admin-home-card strong{font-size:21px}
      .admin-home-card span{font-size:13px}
    }
  `;
  document.head.appendChild(style);

  function normalized(text) {
    return String(text || '').replace(/\s+/g, '');
  }

  function findButton(label) {
    return [...document.querySelectorAll('#app > .appbar button')]
      .find((button) => normalized(button.textContent).includes(label));
  }

  function openManagement(kind) {
    const selector = kind === 'members' ? '.driver-manage-open' : '.staff-manage-open';
    const button = document.querySelector(`#app > .appbar ${selector}`)
      || findButton(kind === 'members' ? '기사관리' : '직원관리')
      || findButton(kind === 'members' ? '회원관리' : '직원관리');
    if (button) button.click();
  }

  function renameMemberManagement() {
    document.querySelectorAll('.driver-manage-open').forEach((button) => {
      if (button.textContent !== '회원관리') button.textContent = '회원관리';
      if (button.getAttribute('aria-label') !== '회원관리') {
        button.setAttribute('aria-label', '회원관리');
      }
    });
    document.querySelectorAll('.driver-manage-head h2').forEach((title) => {
      if (title.textContent !== '회원관리') title.textContent = '회원관리';
    });
  }

  function enhance() {
    renameMemberManagement();

    const appbar = app.querySelector(':scope > .appbar');
    const screen = app.querySelector(':scope > .screen');
    const title = appbar?.querySelector('h1');
    const logout = appbar?.querySelector('[data-logout]');
    const driverButton = appbar?.querySelector('.driver-manage-open');
    const staffButton = appbar?.querySelector('.staff-manage-open');

    if (!appbar || !screen || !title || !logout || !driverButton || !staffButton) return;
    if (!normalized(title.textContent).includes('출입신청관리')) return;

    if (title.textContent !== '출입신청관리') title.textContent = '출입신청관리';
    if (!app.classList.contains('admin-menu-active')) app.classList.add('admin-menu-active');

    if (screen.dataset.adminMenuReady === '1') return;
    screen.dataset.adminMenuReady = '1';

    const applicationsView = document.createElement('div');
    applicationsView.className = 'admin-applications-view';
    applicationsView.hidden = true;

    while (screen.firstChild) applicationsView.appendChild(screen.firstChild);

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'admin-section-back';
    back.textContent = '‹ 관리자 메뉴';

    const menu = document.createElement('div');
    menu.className = 'admin-home-grid';
    menu.innerHTML = `
      <button type="button" class="admin-home-card" data-admin-menu="applications">
        <div class="admin-home-icon" aria-hidden="true">📋</div>
        <strong>신청내역</strong>
        <span>출입 신청을 확인하고<br>승인·반려 처리합니다.</span>
      </button>
      <button type="button" class="admin-home-card" data-admin-menu="members">
        <div class="admin-home-icon" aria-hidden="true">👥</div>
        <strong>회원관리</strong>
        <span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
      </button>
      <button type="button" class="admin-home-card" data-admin-menu="staff">
        <div class="admin-home-icon" aria-hidden="true">🪪</div>
        <strong>직원관리</strong>
        <span>직원 계정과 권한을<br>조회하고 관리합니다.</span>
      </button>`;

    screen.append(menu, back, applicationsView);
    back.hidden = true;

    const scrollTop = () => {
      try { window.scrollTo({ top: 0, behavior: 'auto' }); }
      catch { window.scrollTo(0, 0); }
    };

    const showMenu = () => {
      menu.hidden = false;
      back.hidden = true;
      applicationsView.hidden = true;
      scrollTop();
    };

    const showApplications = () => {
      menu.hidden = true;
      back.hidden = false;
      applicationsView.hidden = false;
      scrollTop();
    };

    menu.addEventListener('click', (event) => {
      const card = event.target.closest('[data-admin-menu]');
      if (!card) return;
      const action = card.dataset.adminMenu;
      if (action === 'applications') showApplications();
      if (action === 'members') openManagement('members');
      if (action === 'staff') openManagement('staff');
    });
    back.addEventListener('click', showMenu);
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  new MutationObserver(renameMemberManagement).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
