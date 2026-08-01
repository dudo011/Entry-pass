(() => {
  const apply = () => {
    const button = document.querySelector('#app > .appbar .staff-manage-open');
    const logout = document.querySelector('#app > .appbar [data-logout]');
    if (!button || !logout) return;

    button.textContent = '직원관리';
    button.style.marginLeft = 'auto';
    button.style.marginRight = '3px';
    button.style.paddingLeft = '10px';
    button.style.paddingRight = '10px';
    button.style.flexShrink = '0';

    logout.style.marginLeft = '0';
    logout.style.flexShrink = '0';
  };

  const app = document.getElementById('app');
  if (!app) return;

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
