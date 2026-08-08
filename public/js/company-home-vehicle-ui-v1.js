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
    /* 업체 홈의 두 주요 버튼은 기존 76px에서 약 6px 낮춘다. */
    #app.company-flow-active .cf-menu .cf-btn{
      min-height:70px!important;
      height:70px!important;
      padding:8px 12px!important;
    }

    /* 헤드: 차량관리 + 로그아웃을 나란히 둔다. */
    #app.company-flow-active .cf-appbar .cf-head-btn{
      margin-left:0!important;
    }
    #app.company-flow-active .cf-head-vehicle-btn{
      min-width:auto!important;
      padding-left:11px!important;
      padding-right:11px!important;
      font-size:14px!important;
      white-space:nowrap!important;
    }

    /* 신청내역: 출입날짜 | 차량번호 | 승인상태 한 줄 */
    #app .cf-item.cf-request-compact{
      padding:13px 14px!important;
      margin-bottom:10px!important;
    }
    #app .cf-item.cf-request-compact .cf-request-line{
      display:grid;
      grid-template-columns:minmax(0,.9fr) minmax(0,1fr) auto;
      gap:8px;
      align-items:center;
      width:100%;
      min-width:0;
    }
    #app .cf-item.cf-request-compact .cf-request-date{
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:var(--text-muted,#64748B);
      font-size:15px;
      font-weight:650;
      line-height:1.3;
    }
    #app .cf-item.cf-request-compact .cf-request-vehicle{
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:var(--text,#0F172A);
      font-size:17px;
      font-weight:800;
      line-height:1.3;
    }
    #app .cf-item.cf-request-compact .cf-stage{
      margin:0!important;
      min-height:30px!important;
      padding:5px 9px!important;
      font-size:13px!important;
      white-space:nowrap;
    }
    #app #cf_request_list .cf-request-completed-hidden{
      display:none!important;
    }
    #app .cf-active-empty{
      padding:24px 12px;
      color:var(--text-muted,#64748B);
      text-align:center;
      font-size:15px;
    }

    /* 완료된 신청내역 전용 화면 */
    .cf-completed-overlay{
      position:fixed;
      inset:0;
      z-index:120000;
      overflow:auto;
      background:var(--bg,#F8FAFC);
      color:var(--text,#0F172A);
    }
    .cf-completed-overlay .cf-completed-appbar{
      position:sticky;
      top:0;
      z-index:2;
      min-height:72px;
      box-sizing:border-box;
      display:flex;
      align-items:center;
      padding:max(15px,env(safe-area-inset-top)) 16px 15px;
      background:var(--header,#0F172A);
      color:#fff;
    }
    .cf-completed-overlay .cf-completed-appbar h1{
      margin:0;
      font-size:23px;
      font-weight:800;
    }
    .cf-completed-overlay .cf-completed-close{
      margin-left:auto;
      min-width:42px;
      height:40px;
      border:1px solid rgba(255,255,255,.14);
      border-radius:12px;
      background:rgba(255,255,255,.09);
      color:#fff;
      font-size:24px;
      line-height:1;
    }
    .cf-completed-overlay .cf-completed-screen{
      max-width:520px;
      margin:0 auto;
      padding:18px 16px calc(28px + env(safe-area-inset-bottom));
    }
    .cf-completed-overlay .cf-item{
      width:100%;
      box-sizing:border-box;
      text-align:left;
      border:0;
      border-radius:16px;
      background:#fff;
      box-shadow:0 10px 25px rgba(0,0,0,.06);
    }
    .cf-completed-empty{
      padding:28px 12px;
      color:var(--text-muted,#64748B);
      text-align:center;
    }

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

  function shortStage(stage) {
    if (!stage) return;
    if (stage.classList.contains('pending')) stage.textContent = '승인대기';
    else if (stage.classList.contains('safety_pending')) stage.textContent = '안전확인';
    else if (stage.classList.contains('photo_pending')) stage.textContent = '사진대기';
    else if (stage.classList.contains('completed')) stage.textContent = '완료';
    else if (stage.classList.contains('rejected')) stage.textContent = '반려';
  }

  function refineRequestList() {
    const list = document.getElementById('cf_request_list');
    if (!list) return;

    list.querySelectorAll('.cf-item[data-cf-request]').forEach((item) => {
      if (item.classList.contains('cf-request-compact')) return;

      const vehicle = item.querySelector('.cf-item-top strong')?.textContent?.trim() || '-';
      const stage = item.querySelector('.cf-stage');
      const isCompleted = !!stage?.classList.contains('completed');
      shortStage(stage);

      const metaText = item.querySelector('.cf-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const dateMatch = metaText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*\(([^)]+)\)/u);
      const visitDate = dateMatch ? `${Number(dateMatch[2])}. ${Number(dateMatch[3])} (${dateMatch[4]})` : '-';

      const line = document.createElement('div');
      line.className = 'cf-request-line';

      const dateNode = document.createElement('span');
      dateNode.className = 'cf-request-date';
      dateNode.textContent = visitDate;

      const vehicleNode = document.createElement('span');
      vehicleNode.className = 'cf-request-vehicle';
      vehicleNode.textContent = vehicle;

      line.append(dateNode, vehicleNode);
      if (stage) line.append(stage);

      item.replaceChildren(line);
      item.classList.add('cf-request-compact');
      if (isCompleted) item.classList.add('cf-request-completed-hidden');
    });

    const activeCards = [...list.querySelectorAll('.cf-item[data-cf-request]')]
      .filter((item) => !item.classList.contains('cf-request-completed-hidden'));
    let empty = list.querySelector('.cf-active-empty');
    if (!activeCards.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'cf-active-empty';
        empty.textContent = '현재 진행 중인 신청 내역이 없습니다.';
        list.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
  }

  function openCompletedRequests() {
    if (document.querySelector('.cf-completed-overlay')) return;
    const list = document.getElementById('cf_request_list');
    if (!list) return;

    const completed = [...list.querySelectorAll('.cf-item.cf-request-completed-hidden[data-cf-request]')];
    const overlay = document.createElement('div');
    overlay.className = 'cf-completed-overlay';
    overlay.innerHTML = `
      <header class="cf-completed-appbar">
        <h1>완료 신청내역</h1>
        <button type="button" class="cf-completed-close" aria-label="닫기">×</button>
      </header>
      <main class="cf-completed-screen"></main>`;

    const screen = overlay.querySelector('.cf-completed-screen');
    if (!completed.length) {
      screen.innerHTML = '<div class="cf-completed-empty">완료된 신청 내역이 없습니다.</div>';
    } else {
      completed.forEach((original) => {
        const clone = original.cloneNode(true);
        clone.classList.remove('cf-request-completed-hidden');
        clone.style.display = '';
        clone.onclick = () => {
          overlay.remove();
          original.click();
        };
        screen.appendChild(clone);
      });
    }

    overlay.querySelector('.cf-completed-close').onclick = () => overlay.remove();
    document.body.appendChild(overlay);
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

    /* 차량관리는 본문에서 제거하고 로그아웃 왼쪽으로 이동한다. */
    if (appbar) {
      vehiclesButton.textContent = '차량관리';
      vehiclesButton.className = 'cf-head-btn cf-head-vehicle-btn';
      const logout = appbar.querySelector('[data-cf-logout]');
      if (vehiclesButton.parentElement !== appbar || vehiclesButton.nextElementSibling !== logout) {
        appbar.insertBefore(vehiclesButton, logout || null);
      }
    }

    const menu = requestButton.closest('.cf-menu');
    if (menu) {
      let completedButton = menu.querySelector('.cf-completed-btn');
      if (!completedButton) {
        completedButton = document.createElement('button');
        completedButton.type = 'button';
        completedButton.className = 'cf-btn cf-secondary cf-completed-btn';
        completedButton.textContent = '완료 신청내역';
        completedButton.onclick = openCompletedRequests;
        menu.appendChild(completedButton);
      }
    }

    refineRequestList();
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
