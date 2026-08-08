(() => {
  const app = document.getElementById('app');
  if (!app) return;

  // 기존 출입신청 화면에서 사용하던 대한민국 공휴일 목록과 동일하게 유지한다.
  const HOLIDAYS = new Set([
    // 2026
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
    '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28', '2026-10-03', '2026-10-05',
    '2026-10-09', '2026-12-25',
    // 2027
    '2027-01-01', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
    '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16',
    '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04',
    '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
  ]);

  const dateKey = (date) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  };

  function nextBusinessDayKey() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    while (date.getDay() === 0 || date.getDay() === 6 || HOLIDAYS.has(dateKey(date))) {
      date.setDate(date.getDate() + 1);
    }
    return dateKey(date);
  }

  const style = document.createElement('style');
  style.textContent = `
    #app .cf-item.cf-vehicle-compact{
      padding:10px 12px;
      margin-bottom:8px;
    }
    #app .cf-item.cf-vehicle-compact .cf-item-top{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto auto;
      gap:7px;
      align-items:center;
    }
    #app .cf-item.cf-vehicle-compact .cf-item-top strong{
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      font-size:18px;
    }
    #app .cf-item.cf-vehicle-compact .cf-item-top .cf-btn{
      width:auto;
      min-width:54px;
      min-height:36px;
      padding:5px 10px;
      font-size:14px;
      border-radius:10px;
      margin:0;
    }
    #app .cf-vehicle-list-title{
      margin-top:0;
    }
  `;
  document.head.appendChild(style);

  function setFieldLabel(inputId, text) {
    const input = document.getElementById(inputId);
    const label = input?.closest('.cf-field')?.querySelector(':scope > span');
    if (label && label.textContent !== text) label.textContent = text;
  }

  function refineHome() {
    const requestList = document.getElementById('cf_request_list');
    const requestButton = app.querySelector('[data-cf-view="request"]');
    const vehiclesButton = app.querySelector('[data-cf-view="vehicles"]');
    if (!requestList || !requestButton || !vehiclesButton) return;

    const appbar = app.querySelector(':scope > .cf-appbar');
    const title = appbar?.querySelector('h1');
    const subtitle = appbar?.querySelector('small');
    if (title && title.textContent !== '출입 신청 관리') title.textContent = '출입 신청 관리';
    subtitle?.remove();

    /* 별도 소개문구 없이 헤드 다음에 주요 기능 버튼을 바로 배치한다. */
    app.querySelector(':scope > .cf-screen > .cf-hero')?.remove();

    if (requestButton.textContent !== '새 출입 신청') requestButton.textContent = '새 출입 신청';
    if (vehiclesButton.textContent !== '소속 차량관리') vehiclesButton.textContent = '소속 차량관리';
  }

  function refineRequestDate() {
    const input = document.getElementById('companyReqDate');
    if (!input || input.dataset.nextBusinessDefault === '1') return;
    input.value = nextBusinessDayKey();
    input.dataset.nextBusinessDefault = '1';
  }

  function refineVehicleList() {
    const numberInput = document.getElementById('cf_v_number');
    if (!numberInput) return;

    setFieldLabel('cf_v_driver', '운전자');
    setFieldLabel('cf_v_phone', '연락처');

    /* 업체 계약유형은 회원가입에서 관리하므로 차량별 기본유형은 받지 않는다. */
    document.getElementById('cf_v_type')?.closest('.cf-field')?.remove();

    const formCard = numberInput.closest('.cf-card');
    const screen = formCard?.parentElement;
    if (!formCard || !screen) return;

    const listTitle = [...screen.children].find((node) =>
      node.classList?.contains('cf-title') && node.textContent.trim() === '등록 차량');

    /* 등록 차량 목록을 차량 등록/수정 폼보다 먼저 표시한다. */
    if (listTitle) {
      listTitle.classList.add('cf-vehicle-list-title');
      const children = [...screen.children];
      const formIndex = children.indexOf(formCard);
      const titleIndex = children.indexOf(listTitle);
      if (formIndex >= 0 && titleIndex > formIndex) {
        const listNodes = children.slice(titleIndex + 1);
        screen.insertBefore(listTitle, formCard);
        listNodes.forEach((node) => screen.insertBefore(node, formCard));
      }
    }

    app.querySelectorAll('.cf-screen > .cf-item').forEach((item) => {
      const top = item.querySelector('.cf-item-top');
      const actions = item.querySelector('.cf-vehicle-actions');
      if (!top || !actions) return;

      item.classList.add('cf-vehicle-compact');

      /* 목록에서는 운전자명·연락처를 표시하지 않는다. */
      item.querySelector('.cf-meta')?.remove();

      /* 기존 수정/삭제 버튼 노드를 차량번호 옆으로 이동해 이벤트를 그대로 보존한다. */
      const edit = actions.querySelector('[data-cf-edit-vehicle]');
      const del = actions.querySelector('[data-cf-delete-vehicle]');
      if (edit && !top.contains(edit)) top.appendChild(edit);
      if (del && !top.contains(del)) top.appendChild(del);
      actions.remove();
    });
  }

  function apply() {
    refineHome();
    refineRequestDate();
    refineVehicleList();
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
