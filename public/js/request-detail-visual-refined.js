(() => {
  const style = document.createElement('style');
  style.textContent = `
    #app .driver-result-card .result-detail.result-purpose{
      padding:15px 6px!important;
      font-size:27px!important;
      line-height:1.3!important;
      font-weight:750!important;
      color:var(--text,#111827)!important
    }
    #app .driver-result-card .result-detail.result-visit-today{
      color:#2563eb!important
    }
    @media(max-width:390px){
      #app .driver-result-card .result-detail.result-purpose{
        padding:13px 5px!important;
        font-size:24px!important
      }
    }
  `;
  document.head.appendChild(style);

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function refineRequestDetail() {
    const card = document.querySelector('#app .driver-result-card');
    if (!card) return;

    const rows = card.querySelectorAll(':scope > .result-detail');
    const dateRow = rows[1];
    if (!dateRow || dateRow.dataset.weekdayApplied === 'true') return;

    const match = dateRow.textContent.trim().match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*\([일월화수목금토]\))?$/);
    if (!match) return;

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return;

    dateRow.textContent = `${year}. ${month}. ${day}. (${WEEKDAYS[date.getDay()]})`;
    const visitKey = `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dateRow.classList.toggle('result-visit-today', visitKey === localDateKey());
    dateRow.dataset.weekdayApplied = 'true';
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      refineRequestDetail();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  schedule();
})();
