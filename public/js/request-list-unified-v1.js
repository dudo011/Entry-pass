(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const style = document.createElement('style');
  style.textContent = `
    /* 업체 신청내역/출입이력 날짜: MM.DD(요일) */
    body #app .cf-item.cf-request-compact .cf-request-date,
    body .cf-completed-overlay .cf-item.cf-request-compact .cf-request-date{
      white-space:nowrap!important;
    }

    /* 관리자 신청 목록도 업체 출입이력과 같은 3열 한 줄 구조 */
    body #app .mini-card.admin-request-unified{
      padding:13px 14px!important;
      margin-bottom:10px!important;
      text-align:left!important;
    }
    body #app .admin-request-line{
      display:grid!important;
      grid-template-columns:minmax(0,.9fr) minmax(0,1fr) auto!important;
      gap:8px!important;
      align-items:center!important;
      width:100%!important;
      min-width:0!important;
    }
    body #app .admin-request-date,
    body #app .admin-request-vehicle{
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      color:var(--text,#0F172A)!important;
      font-size:17px!important;
      font-weight:800!important;
      line-height:1.3!important;
    }
    body #app .admin-request-line .status-pill{
      margin:0!important;
      min-height:30px!important;
      padding:5px 9px!important;
      font-size:13px!important;
      font-weight:900!important;
      line-height:1.2!important;
      white-space:nowrap!important;
    }
  `;
  document.head.appendChild(style);

  const pad2 = (value) => String(Number(value) || 0).padStart(2, '0');

  function compactDate(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return value;

    let match = value.match(/(?:\d{4}\s*[.\/-]\s*)?(\d{1,2})\s*[.\/-]\s*(\d{1,2})\.?\s*\(([일월화수목금토])\)/u);
    if (match) return `${pad2(match[1])}.${pad2(match[2])}(${match[3]})`;

    match = value.match(/(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\.?/u);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (!Number.isNaN(date.getTime())) {
        const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
        return `${pad2(match[2])}.${pad2(match[3])}(${weekday})`;
      }
    }
    return value;
  }

  function refineCompanyDates() {
    document.querySelectorAll('#cf_request_list .cf-request-date, .cf-completed-overlay .cf-request-date').forEach((node) => {
      const next = compactDate(node.textContent);
      if (next && node.textContent !== next) node.textContent = next;
    });
  }

  function refineAdminList() {
    const heading = app.querySelector(':scope > .appbar h1')?.textContent?.trim();
    if (heading !== '출입 신청 관리') return;

    app.querySelectorAll('.mini-card[data-detail]').forEach((card) => {
      if (card.classList.contains('admin-request-unified')) return;

      const vehicle = card.querySelector('.veh')?.textContent?.trim() || '-';
      const status = card.querySelector('.status-pill');
      const metaText = card.querySelector('.meta')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const date = compactDate(metaText.replace(/^방문\s*/u, ''));

      const line = document.createElement('div');
      line.className = 'admin-request-line';

      const dateNode = document.createElement('span');
      dateNode.className = 'admin-request-date';
      dateNode.textContent = date || '-';

      const vehicleNode = document.createElement('span');
      vehicleNode.className = 'admin-request-vehicle';
      vehicleNode.textContent = vehicle;

      line.append(dateNode, vehicleNode);
      if (status) line.append(status);
      card.replaceChildren(line);
      card.classList.add('admin-request-unified');
    });
  }

  function hideNode(node) {
    if (!node || node.dataset.driverProgressHidden === '1') return;
    node.dataset.driverProgressHidden = '1';
    node.hidden = true;
    node.style.setProperty('display', 'none', 'important');
  }

  function hideAdminDriverProgress() {
    const heading = app.querySelector(':scope > .appbar h1')?.textContent?.trim();
    if (heading !== '출입 신청 상세') return;
    const screen = app.querySelector(':scope > .screen');
    if (!screen) return;

    /* company-flow-v1이 동적으로 추가하는 기사 진행상태 카드 */
    screen.querySelectorAll('.cf-staff-workflow').forEach(hideNode);

    /* 다른 보정 모듈/기존 화면에서 생성된 동일 항목도 모두 숨긴다. */
    screen.querySelectorAll('.cf-title, .section-title, .row').forEach((node) => {
      const label = node.classList.contains('row')
        ? node.querySelector('.k')?.textContent?.trim() || ''
        : node.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!/^기사\s*진행상태/u.test(label)) return;

      if (node.classList.contains('cf-title')) {
        hideNode(node.closest('.cf-card') || node);
        return;
      }
      if (node.classList.contains('section-title')) {
        hideNode(node);
        const next = node.nextElementSibling;
        if (next?.matches('.card, .cf-card') && /기사\s*진행상태|안전수칙\s*확인\s*대기|현장사진\s*업로드\s*대기/u.test(next.textContent || '')) {
          hideNode(next);
        }
        return;
      }
      hideNode(node);
    });
  }

  function apply() {
    refineCompanyDates();
    refineAdminList();
    hideAdminDriverProgress();
  }

  let scheduled = false;
  let lastApplyAt = 0;
  const MIN_APPLY_GAP = 500; // 재적용 최소 간격(ms). MutationObserver 폭주로 화면이 멈추는 것을 막는 안전장치.
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; lastApplyAt = Date.now(); apply(); };
    const wait = Math.max(0, MIN_APPLY_GAP - (Date.now() - lastApplyAt));
    if (wait === 0) requestAnimationFrame(run); else setTimeout(run, wait);
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
