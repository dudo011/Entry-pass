(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const STATUS_LABELS = [
    ['pending', '승인대기'],
    ['safety_pending', '안전수칙'],
    ['photo_pending', '현장사진'],
    ['completed', '최종완료'],
    ['rejected', '반려'],
  ];

  const style = document.createElement('style');
  style.textContent = `
    /* 홈 주요 버튼 */
    body #app.company-flow-active .cf-menu .cf-btn{
      min-height:60px!important;
      height:60px!important;
      padding:6px 10px!important;
    }

    /* 헤드의 차량관리/로그아웃 버튼을 같은 규격으로 통일 */
    body #app.company-flow-active .cf-appbar .cf-head-vehicle-btn,
    body #app.company-flow-active .cf-appbar [data-cf-logout]{
      min-width:auto!important;
      width:auto!important;
      min-height:40px!important;
      height:40px!important;
      padding:0 11px!important;
      border:1px solid rgba(255,255,255,.14)!important;
      border-radius:12px!important;
      background:rgba(255,255,255,.09)!important;
      color:#fff!important;
      font-size:14px!important;
      font-weight:700!important;
      line-height:1.2!important;
      white-space:nowrap!important;
    }

    /* 신청내역/출입이력 카드의 글꼴과 배치를 동일하게 유지 */
    body #app .cf-item.cf-request-compact .cf-request-line,
    body .cf-completed-overlay .cf-item.cf-request-compact .cf-request-line{
      display:grid!important;
      grid-template-columns:minmax(0,.9fr) minmax(0,1fr) auto!important;
      gap:8px!important;
      align-items:center!important;
      width:100%!important;
      min-width:0!important;
    }
    body #app .cf-item.cf-request-compact .cf-request-date,
    body .cf-completed-overlay .cf-item.cf-request-compact .cf-request-date{
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      color:var(--text,#0F172A)!important;
      font-size:17px!important;
      font-weight:800!important;
      line-height:1.3!important;
    }
    body #app .cf-item.cf-request-compact .cf-request-vehicle,
    body .cf-completed-overlay .cf-item.cf-request-compact .cf-request-vehicle{
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      color:var(--text,#0F172A)!important;
      font-size:17px!important;
      font-weight:800!important;
      line-height:1.3!important;
    }
    body #app .cf-item.cf-request-compact .cf-stage,
    body .cf-completed-overlay .cf-item.cf-request-compact .cf-stage{
      margin:0!important;
      min-height:30px!important;
      padding:5px 9px!important;
      font-size:13px!important;
      font-weight:900!important;
      line-height:1.2!important;
      white-space:nowrap!important;
    }

    /* 업체 신청 상세: 라벨 : 값 형태로 한 줄씩 표시 */
    body #app.company-flow-active .cf-detail-meta-refined{
      margin-top:12px!important;
      line-height:1.8!important;
    }
    body #app.company-flow-active .cf-detail-row{
      display:block!important;
      color:#64748b!important;
      font-size:14px!important;
      line-height:1.8!important;
    }
    body #app.company-flow-active .cf-detail-row.cf-detail-reject{
      color:#b91c1c!important;
      font-weight:800!important;
    }
  `;
  document.head.appendChild(style);

  function stageLabel(stage) {
    if (!stage) return '';
    const found = STATUS_LABELS.find(([className]) => stage.classList.contains(className));
    return found?.[1] || stage.textContent.trim();
  }

  function captureOriginalDates() {
    const list = document.getElementById('cf_request_list');
    if (!list) return;

    list.querySelectorAll('.cf-item[data-cf-request]').forEach((item) => {
      if (item.dataset.cfVisitDate) return;
      const meta = item.querySelector('.cf-meta');
      if (!meta) return;
      const text = meta.textContent.replace(/\s+/g, ' ').trim();
      const match = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*\(([^)]+)\)/u);
      if (!match) return;
      const pad = (n) => String(n).padStart(2, '0');
      item.dataset.cfVisitDate = `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    });
  }

  function tuneHome() {
    const list = document.getElementById('cf_request_list');
    if (!list) return;

    const historyButton = app.querySelector('.cf-completed-btn');
    if (historyButton && historyButton.textContent !== '출입 이력') {
      historyButton.textContent = '출입 이력';
    }

    list.querySelectorAll('.cf-item[data-cf-request] .cf-stage').forEach((stage) => {
      const label = stageLabel(stage);
      if (label && stage.textContent !== label) stage.textContent = label;
    });
  }

  function extractValue(line, label) {
    const text = String(line || '').trim();
    if (!text.startsWith(label)) return '';
    return text.slice(label.length).replace(/^\s*:\s*/, '').trim();
  }

  function appendDetailRow(meta, label, value, className = '') {
    if (!value) return;
    const row = document.createElement('div');
    row.className = `cf-detail-row${className ? ` ${className}` : ''}`;
    row.textContent = `${label} : ${value}`;
    meta.appendChild(row);
  }

  function tuneRequestDetail() {
    const title = app.querySelector(':scope > .cf-appbar h1')?.textContent?.trim();
    if (title !== '신청 상세') return;

    const meta = app.querySelector(':scope > .cf-screen > .cf-card .cf-meta');
    if (!meta || meta.dataset.cfDetailRefined === '1') return;

    const lines = String(meta.innerText || meta.textContent || '')
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const approvalLine = lines.find((line) => line.startsWith('승인번호')) || '';
    const visitLine = lines.find((line) => line.startsWith('출입일자')) || '';
    const driverLine = lines.find((line) => line.startsWith('운전자')) || '';
    const temporaryLine = lines.find((line) => line.includes('용차·일회성 차량')) || '';
    const rejectLine = lines.find((line) => line.startsWith('반려사유')) || '';

    const approval = extractValue(approvalLine, '승인번호');
    const visitAt = extractValue(visitLine, '출입일자');
    const driverCombined = extractValue(driverLine, '운전자');
    const driverParts = driverCombined.split(/\s*·\s*/);
    const driverName = driverParts[0]?.trim() || '';
    const phone = driverParts.slice(1).join(' · ').trim();
    const rejectReason = extractValue(rejectLine, '반려사유');

    meta.replaceChildren();
    meta.classList.add('cf-detail-meta-refined');
    appendDetailRow(meta, '승인번호', approval);
    appendDetailRow(meta, '출입일자', visitAt);
    appendDetailRow(meta, '운전자명', driverName);
    appendDetailRow(meta, '연락처', phone);
    if (temporaryLine) appendDetailRow(meta, '차량구분', '용차·일회성 차량');
    if (rejectReason) appendDetailRow(meta, '반려사유', rejectReason, 'cf-detail-reject');
    meta.dataset.cfDetailRefined = '1';
  }

  function tuneHistoryOverlay() {
    const overlay = document.querySelector('.cf-completed-overlay');
    if (!overlay) return;

    const title = overlay.querySelector('.cf-completed-appbar h1');
    if (title && title.textContent !== '출입 이력') title.textContent = '출입 이력';

    /* 닫기 X는 사용하지 않고 휴대폰/브라우저 뒤로가기로만 홈에 복귀한다. */
    overlay.querySelector('.cf-completed-close')?.remove();

    if (overlay.dataset.historyReady !== '1') {
      overlay.dataset.historyReady = '1';
      if (!history.state?.companyHistoryOverlay) {
        history.pushState({ ...(history.state || {}), companyFlow: 'home', companyHistoryOverlay: true }, '');
      }
    }

    const empty = overlay.querySelector('.cf-completed-empty');
    if (empty && empty.textContent !== '출입 이력이 없습니다.') {
      empty.textContent = '출입 이력이 없습니다.';
    }

    const screen = overlay.querySelector('.cf-completed-screen');
    if (!screen) return;

    const cards = [...screen.querySelectorAll('.cf-item[data-cf-request]')];
    cards.forEach((card) => {
      const stage = card.querySelector('.cf-stage');
      const label = stageLabel(stage);
      if (label && stage.textContent !== label) stage.textContent = label;
    });

    const sorted = [...cards].sort((a, b) => {
      const da = a.dataset.cfVisitDate || '';
      const db = b.dataset.cfVisitDate || '';
      return db.localeCompare(da);
    });

    const differs = sorted.some((card, index) => cards[index] !== card);
    if (differs) sorted.forEach((card) => screen.appendChild(card));
  }

  function apply() {
    captureOriginalDates();
    tuneHome();
    tuneRequestDetail();
    tuneHistoryOverlay();
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

  new MutationObserver(schedule).observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('popstate', () => {
    const overlay = document.querySelector('.cf-completed-overlay');
    if (overlay) overlay.remove();
  });

  schedule();
})();
