(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const style = document.createElement('style');
  style.textContent = `
    #app.company-flow-active .cf-profile-section-head{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:12px!important;
      margin:4px 2px 10px!important;
    }
    #app.company-flow-active .cf-profile-section-head > .cf-title{
      margin:0!important;
    }
    #app.company-flow-active .cf-profile-section-head.cf-profile-vehicle-head{
      margin-top:32px!important;
    }
    #app.company-flow-active .cf-profile-head-action{
      width:auto!important;
      min-width:92px!important;
      min-height:40px!important;
      height:40px!important;
      padding:0 13px!important;
      border-radius:12px!important;
      font-size:14px!important;
      font-weight:700!important;
      white-space:nowrap!important;
      flex:0 0 auto!important;
    }
    #app.company-flow-active .cf-profile-vehicle-form-title{
      display:none!important;
    }
  `;
  document.head.appendChild(style);

  function makeHead(title, action, extraClass = '') {
    const row = document.createElement('div');
    row.className = `cf-profile-section-head ${extraClass}`.trim();
    title.parentNode.insertBefore(row, title);
    row.append(title, action);
    return row;
  }

  function applyProfileUi() {
    const companyInput = document.getElementById('cf_p_company');
    const businessInput = document.getElementById('cf_p_business');
    if (!companyInput || !businessInput) return;

    const screen = companyInput.closest('.cf-screen');
    if (!screen) return;

    /* 7. 정보수정 화면에서는 로그아웃 버튼을 표시하지 않는다. */
    const appbar = app.querySelector(':scope > .cf-appbar');
    appbar?.querySelector('[data-cf-logout]')?.remove();

    /* 1. 사업자등록번호 -> 사업자번호 */
    const businessLabel = businessInput.closest('.cf-field')?.querySelector(':scope > span');
    if (businessLabel && businessLabel.textContent !== '사업자번호') businessLabel.textContent = '사업자번호';

    const titles = [...screen.querySelectorAll(':scope > .cf-title')];
    const basicTitle = titles.find((node) => node.textContent.trim() === '기본정보');
    const vehicleTitle = titles.find((node) => node.textContent.trim() === '차량관리');

    /* 3, 5. 기본정보 저장 버튼을 제목 오른쪽으로 이동하고 안내문은 삭제한다. */
    const basicSave = document.getElementById('cf_p_save');
    if (basicTitle && basicSave && !basicTitle.parentElement?.classList.contains('cf-profile-section-head')) {
      basicSave.classList.add('cf-profile-head-action');
      makeHead(basicTitle, basicSave);
    }
    const basicCard = companyInput.closest('.cf-card');
    basicCard?.querySelector('.cf-meta')?.remove();

    /* 2. 목록 위의 '등록 차량' 중복 문구 삭제 */
    [...screen.querySelectorAll(':scope > .cf-title')].forEach((node) => {
      if (node.textContent.trim() === '등록 차량') node.remove();
    });

    /* 4, 6. 차량등록/수정 저장 버튼을 차량관리 제목 오른쪽으로 이동한다. */
    const vehicleSave = document.getElementById('cf_v_save');
    if (vehicleTitle && vehicleSave && !vehicleTitle.parentElement?.classList.contains('cf-profile-section-head')) {
      vehicleSave.classList.add('cf-profile-head-action');
      makeHead(vehicleTitle, vehicleSave, 'cf-profile-vehicle-head');

      const oldRow = vehicleSave.dataset.profileOriginalRow === '1' ? null : screen.querySelector('.cf-row2');
      if (oldRow && !oldRow.querySelector('button')) oldRow.remove();
      else if (oldRow) oldRow.style.gridTemplateColumns = '1fr';
    }

    /* '차량관리' 아래 폼의 '차량 등록'도 중복되므로 정보수정 화면에서는 숨긴다. */
    const vehicleNumber = document.getElementById('cf_v_number');
    const vehicleFormTitle = vehicleNumber?.closest('.cf-card')?.querySelector(':scope > .cf-title');
    if (vehicleFormTitle) vehicleFormTitle.classList.add('cf-profile-vehicle-form-title');
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyProfileUi();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
