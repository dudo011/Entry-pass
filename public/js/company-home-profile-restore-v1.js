(() => {
  const app = document.getElementById('app');
  if (!app) return;

  /*
   * 2026-08-09 회원정보 수정 기능을 추가하면서 업체 홈의 코어 마크업이
   * `업체명 헤더 + 새 출입 신청 1개` 형태로 바뀌어, 기존 홈 보정
   * (신청 내역 / 새 출입 신청 + 출입 이력 / 한 줄 신청내역)이
   * 더 이상 동작하지 않게 된 회귀를 복원한다.
   *
   * 회원정보 수정 기능 자체는 유지한다. 코어가 만든 profile 버튼을 잠시
   * 기존 vehicles 버튼처럼 보이게 해 company-home-vehicle-ui-v1.js의 검증된
   * 홈 보정을 재사용한 뒤, 헤드에 이동되면 다시 profile로 되돌린다.
   * 코어 bindCompany()는 최초 렌더 시 view='profile'을 클로저에 보관하므로
   * data-cf-view를 잠시 바꿔도 실제 클릭 대상은 정보수정 화면 그대로다.
   */

  const style = document.createElement('style');
  style.textContent = `
    #app.company-flow-active .cf-appbar .cf-profile-home-bridge{
      width:auto!important;
      min-width:max-content!important;
      max-width:none!important;
      padding-left:11px!important;
      padding-right:11px!important;
      font-size:14px!important;
      white-space:nowrap!important;
    }
  `;
  document.head.appendChild(style);

  function prepareHome() {
    const requestList = document.getElementById('cf_request_list');
    const requestButton = app.querySelector('[data-cf-view="request"]');
    const appbar = app.querySelector(':scope > .cf-appbar');
    if (!requestList || !requestButton || !appbar) return;

    let profileButton = appbar.querySelector('[data-cf-view="profile"]')
      || appbar.querySelector('.cf-profile-home-bridge')
      || appbar.querySelector('.cf-head-vehicle-btn');
    if (!profileButton) return;

    /* 기존 홈 보정이 기대하는 2열 메뉴 구조를 복원한다. */
    if (!requestButton.closest('.cf-menu')) {
      const menu = document.createElement('div');
      menu.className = 'cf-menu';
      requestButton.parentNode?.insertBefore(menu, requestButton);
      menu.appendChild(requestButton);
    }

    /* 기존 홈 보정이 한 번 실행될 수 있도록 vehicles 역할을 잠시 부여한다. */
    if (!profileButton.classList.contains('cf-head-vehicle-btn')) {
      profileButton.classList.add('cf-profile-home-bridge');
      if (profileButton.dataset.cfView !== 'vehicles') profileButton.dataset.cfView = 'vehicles';
      return;
    }

    /* 헤드로 이동된 뒤에는 홈 제목과 회원정보 기능을 최종 확정한다. */
    profileButton.classList.add('cf-profile-home-bridge');
    if (profileButton.dataset.cfView !== 'profile') profileButton.dataset.cfView = 'profile';
    if (profileButton.textContent !== '회원정보(차량관리)') profileButton.textContent = '회원정보(차량관리)';
    profileButton.setAttribute('aria-label', '회원정보(차량관리)');

    const title = appbar.querySelector('h1');
    if (title && title.textContent !== '신청 내역') title.textContent = '신청 내역';
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      prepareHome();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-cf-view'] });
  prepareHome();
})();
