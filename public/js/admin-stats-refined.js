(() => {
  let searched = false;
  let onStatsScreen = false;

  const style = document.createElement('style');
  style.textContent = `
    #app .admin-bar{display:none!important}
    #app .admin-stats-screen .card{padding:16px!important}
    #app .admin-stats-screen .card > .field{
      display:flex!important;align-items:center;gap:8px;margin-bottom:10px
    }
    #app .admin-stats-screen .card > .field > .lb{
      flex:0 0 92px;margin:0!important;font-size:17px;font-weight:700;line-height:1.25
    }
    #app .admin-stats-screen .card > .field > input,
    #app .admin-stats-screen .card > .field > select,
    #app .admin-stats-screen .card > .field > .date-range{
      flex:1 1 0;min-width:0
    }
    #app .admin-stats-screen .card > .field > input,
    #app .admin-stats-screen .card > .field > select{
      min-height:50px!important;padding:9px 12px!important;font-size:17px!important
    }
    #app .admin-stats-screen .date-range{
      display:flex;align-items:center;justify-content:flex-start;gap:6px;min-width:0
    }
    #app .admin-stats-screen .date-range > span{flex:0 0 auto;font-size:17px;font-weight:700}
    #app .admin-stats-screen .compact-date{
      position:relative;flex:0 1 104px;min-width:88px;height:50px;border:1px solid var(--border,#e2e8f0);
      border-radius:11px;background:var(--surface-2,#f8fafc);display:flex;align-items:center;justify-content:center;
      overflow:hidden
    }
    #app .admin-stats-screen .compact-date:focus-within{
      border-color:var(--primary,#1d4ed8);background:#fff;box-shadow:0 0 0 3px rgba(29,78,216,.12)
    }
    #app .admin-stats-screen .compact-date input{
      position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;padding:0!important
    }
    #app .admin-stats-screen .compact-date .date-text{
      pointer-events:none;font-size:18px;font-weight:700;color:var(--text,#0f172a);letter-spacing:.02em
    }
    #app .admin-stats-screen .btn-row{
      display:flex!important;flex-direction:row!important;gap:8px!important;margin-top:12px
    }
    #app .admin-stats-screen .btn-row .btn{
      flex:1 1 0!important;width:auto!important;min-height:50px!important;padding:10px!important
    }
    #app .admin-stats-screen:not(.stats-searched) .card ~ *{display:none!important}
    @media(max-width:390px){
      #app .admin-stats-screen .card{padding:14px!important}
      #app .admin-stats-screen .card > .field{gap:6px;margin-bottom:9px}
      #app .admin-stats-screen .card > .field > .lb{flex-basis:84px;font-size:16px}
      #app .admin-stats-screen .date-range{gap:4px}
      #app .admin-stats-screen .compact-date{flex-basis:92px;min-width:78px;height:48px}
      #app .admin-stats-screen .compact-date .date-text{font-size:17px}
    }
  `;
  document.head.appendChild(style);

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function shortDate(value) {
    const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}.${match[2]}` : '--.--';
  }

  function setDefaultDates() {
    const from = document.getElementById('st-from');
    const to = document.getElementById('st-to');
    if (!from || !to) return;
    const today = new Date();
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);
    if (!from.value) from.value = dateKey(today);
    if (!to.value) to.value = dateKey(weekLater);
  }

  function refineDateInput(input) {
    if (!input || input.parentElement?.classList.contains('compact-date')) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'compact-date';
    const text = document.createElement('span');
    text.className = 'date-text';
    const update = () => { text.textContent = shortDate(input.value); };
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input, text);
    input.addEventListener('change', update);
    input.addEventListener('input', update);
    update();
  }

  function normalizeLabels() {
    const labels = [
      ['st-type', '출입 목적'],
      ['st-vehicle', '차량 번호'],
      ['st-company', '계약 업체'],
    ];
    labels.forEach(([id, text]) => {
      const label = document.getElementById(id)?.closest('label.field')?.querySelector('.lb');
      if (label) label.textContent = text;
    });
  }

  function apply() {
    document.querySelector('#app .admin-bar')?.remove();

    const screen = document.querySelector('#app > .screen');
    const searchButton = document.getElementById('st-search');
    const isStats = !!(screen && searchButton);

    if (!isStats) {
      onStatsScreen = false;
      return;
    }

    if (!onStatsScreen) searched = false;
    onStatsScreen = true;
    screen.classList.add('admin-stats-screen');
    screen.classList.toggle('stats-searched', searched);

    normalizeLabels();
    setDefaultDates();
    refineDateInput(document.getElementById('st-from'));
    refineDateInput(document.getElementById('st-to'));

    if (searchButton.dataset.refinedBound !== 'true') {
      searchButton.dataset.refinedBound = 'true';
      searchButton.addEventListener('click', () => { searched = true; }, true);
    }

    const resetButton = document.getElementById('st-reset');
    if (resetButton && resetButton.dataset.refinedBound !== 'true') {
      resetButton.dataset.refinedBound = 'true';
      resetButton.addEventListener('click', () => { searched = false; }, true);
    }
  }

  const app = document.getElementById('app');
  if (!app) return;
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