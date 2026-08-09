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
    #app.company-flow-active .cf-profile-section-head.cf-profile-register-head{
      margin-top:32px!important;
      margin-bottom:10px!important;
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
  `;
  document.head.appendChild(style);

  function makeHead(title, action, extraClass = '', beforeNode = null) {
    const row = document.createElement('div');
    row.className = `cf-profile-section-head ${extraClass}`.trim();
    if (beforeNode?.parentNode) beforeNode.parentNode.insertBefore(row, beforeNode);
    else title.parentNode.insertBefore(row, title);
    row.append(title);
    if (action) row.append(action);
    return row;
  }

  function applyProfileUi() {
    const companyInput = document.getElementById('cf_p_company');
    const businessInput = document.getElementById('cf_p_business');
    if (!companyInput || !businessInput) return;

    const screen = companyInput.closest('.cf-screen');
    if (!screen) return;

    /* 정보수정 화면에서는 로그아웃 버튼을 표시하지 않는다. */
    const appbar = app.querySelector(':scope > .cf-appbar');
    appbar?.querySelector('[data-cf-logout]')?.remove();

    /* 사업자등록번호 -> 사업자번호 */
    const businessLabel = businessInput.closest('.cf-field')?.querySelector(':scope > span');
    if (businessLabel && businessLabel.textContent !== '사업자번호') businessLabel.textContent = '사업자번호';

    const directTitles = [...screen.querySelectorAll(':scope > .cf-title')];
    const basicTitle = screen.querySelector('.cf-profile-section-head:not(.cf-profile-vehicle-head):not(.cf-profile-register-head) > .cf-title')
      || directTitles.find((node) => node.textContent.trim() === '기본정보');
    const vehicleTitle = screen.querySelector('.cf-profile-vehicle-head > .cf-title')
      || directTitles.find((node) => node.textContent.trim() === '차량관리');

    /* 기본정보 저장 버튼을 제목 오른쪽으로 이동하고 안내문은 삭제한다. */
    const basicSave = document.getElementById('cf_p_save');
    if (basicTitle && basicSave && !basicTitle.parentElement?.classList.contains('cf-profile-section-head')) {
      basicSave.classList.add('cf-profile-head-action');
      makeHead(basicTitle, basicSave);
    }
    const basicCard = companyInput.closest('.cf-card');
    basicCard?.querySelector('.cf-meta')?.remove();

    /* 목록 위의 '등록 차량' 중복 문구 삭제 */
    [...screen.querySelectorAll(':scope > .cf-title')].forEach((node) => {
      if (node.textContent.trim() === '등록 차량') node.remove();
    });

    /* 차량관리 제목은 등록 차량 목록만 설명하도록 버튼 없이 유지한다. */
    if (vehicleTitle && !vehicleTitle.parentElement?.classList.contains('cf-profile-section-head')) {
      makeHead(vehicleTitle, null, 'cf-profile-vehicle-head');
    } else if (vehicleTitle?.parentElement?.classList.contains('cf-profile-section-head')) {
      vehicleTitle.parentElement.classList.add('cf-profile-vehicle-head');
    }

    /*
     * 등록 차량 목록 아래에서 신규 차량 입력 영역을 별도 '차량 등록' 섹션으로 분리한다.
     * 기존 저장 버튼은 기능을 그대로 유지한 채 새 섹션 제목 오른쪽으로 이동한다.
     */
    const vehicleSave = document.getElementById('cf_v_save');
    const vehicleNumber = document.getElementById('cf_v_number');
    const vehicleFormCard = vehicleNumber?.closest('.cf-card');
    let registerHead = screen.querySelector('.cf-profile-register-head');
    let registerTitle = registerHead?.querySelector('.cf-title') || null;

    if (!registerTitle && vehicleFormCard) {
      const oldFormTitle = vehicleFormCard.querySelector(':scope > .cf-title');
      registerTitle = oldFormTitle || document.createElement('div');
      registerTitle.className = 'cf-title';
      registerTitle.textContent = '차량 등록';
    }

    if (registerTitle && registerTitle.textContent.trim() !== '차량 등록') {
      registerTitle.textContent = '차량 등록';
    }

    if (!registerHead && registerTitle && vehicleFormCard) {
      registerHead = makeHead(registerTitle, null, 'cf-profile-register-head', vehicleFormCard);
    }

    if (registerHead && vehicleSave && vehicleSave.parentElement !== registerHead) {
      vehicleSave.classList.add('cf-profile-head-action');
      registerHead.append(vehicleSave);
    }

    /* 차량관리 제목 옆에 이전 버전의 저장 버튼이 남아 있으면 새 등록 섹션으로 이동시킨다. */
    const vehicleHead = screen.querySelector('.cf-profile-vehicle-head');
    if (vehicleHead && vehicleSave && vehicleHead.contains(vehicleSave) && registerHead) {
      registerHead.append(vehicleSave);
    }

    /* 저장 버튼이 빠진 기존 2열 버튼 행은 빈 공간을 만들지 않도록 정리한다. */
    if (vehicleFormCard) {
      [...vehicleFormCard.querySelectorAll('.cf-row2')].forEach((row) => {
        if (!row.querySelector('button')) row.remove();
        else row.style.gridTemplateColumns = '1fr';
      });
    }
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
