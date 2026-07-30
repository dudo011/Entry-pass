(() => {
  const style = document.createElement('style');
  style.textContent = `
    #app.admin-detail-refined .screen > .card .row{
      padding-top:13px!important;
      padding-bottom:13px!important;
    }
    #app.admin-detail-refined .screen > .card .row + .row{
      margin-top:2px!important;
    }
  `;
  document.head.appendChild(style);

  function stripVehicleSuffix(value) {
    return String(value || '').replace(/\s*차량\s*$/, '').trim();
  }

  function apply() {
    const heading = document.querySelector('#app > .appbar h1')?.textContent?.trim();
    const screen = document.querySelector('#app > .screen');
    if (heading !== '출입 신청 상세' || !screen) {
      document.getElementById('app')?.classList.remove('admin-detail-refined');
      return;
    }

    document.getElementById('app')?.classList.add('admin-detail-refined');

    const rows = [...screen.querySelectorAll('.card .row')];
    const purposeRow = rows.find((row) => row.querySelector('.k')?.textContent?.trim() === '방문목적');
    const value = purposeRow?.querySelector('span:last-child');
    if (value && value.dataset.vehicleSuffixRemoved !== 'true') {
      value.textContent = stripVehicleSuffix(value.textContent);
      value.dataset.vehicleSuffixRemoved = 'true';
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
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  schedule();
})();
