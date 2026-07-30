(() => {
  let searched = false;
  let onStatsScreen = false;

  const style = document.createElement('style');
  style.textContent = `
    #app .admin-bar{display:none!important}
    #app .admin-stats-screen .card > .field{
      display:flex!important;align-items:center;gap:14px;margin-bottom:14px
    }
    #app .admin-stats-screen .card > .field > .lb{
      flex:0 0 118px;margin:0!important;font-size:17px;font-weight:700;line-height:1.3
    }
    #app .admin-stats-screen .card > .field > input,
    #app .admin-stats-screen .card > .field > select,
    #app .admin-stats-screen .card > .field > .date-range{
      flex:1 1 0;min-width:0
    }
    #app .admin-stats-screen .date-range{display:flex;align-items:center;gap:8px}
    #app .admin-stats-screen .date-range input{min-width:0;width:100%}
    #app .admin-stats-screen:not(.stats-searched) .card ~ *{display:none!important}
    @media(max-width:390px){
      #app .admin-stats-screen .card > .field{gap:10px}
      #app .admin-stats-screen .card > .field > .lb{flex-basis:104px;font-size:16px}
      #app .admin-stats-screen .date-range{gap:5px}
    }
  `;
  document.head.appendChild(style);

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

    const typeLabel = document.querySelector('label.field:has(#st-type) .lb');
    if (typeLabel) typeLabel.textContent = '출입 목적';

    setDefaultDates();

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