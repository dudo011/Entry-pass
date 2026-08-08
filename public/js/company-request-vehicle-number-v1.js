(() => {
  const TEMP_VEHICLE = '__temporary__';

  function sync(select, row, input) {
    const value = select.value || '';
    const temporary = value === TEMP_VEHICLE;
    row.hidden = false;
    input.readOnly = !temporary;
    input.setAttribute('aria-readonly', temporary ? 'false' : 'true');

    if (temporary) {
      if (input.dataset.vehicleMode !== 'temporary') input.value = '';
      input.placeholder = '용차 차량번호';
      input.dataset.vehicleMode = 'temporary';
      return;
    }

    const option = select.selectedOptions?.[0];
    const label = option?.textContent || '';
    const vehicleNumber = value ? label.split('·')[0].trim() : '';
    input.value = vehicleNumber;
    input.placeholder = '차량을 선택하세요';
    input.dataset.vehicleMode = 'registered';
  }

  function apply() {
    const select = document.getElementById('companyReqVehicle');
    const row = document.getElementById('companyTempVehicleRow');
    const input = document.getElementById('companyReqTempVehicle');
    if (!select || !row || !input) return;

    const label = row.querySelector('.lb');
    if (label && label.textContent !== '차량번호') label.textContent = '차량번호';

    if (select.dataset.vehicleNumberBound !== 'true') {
      select.dataset.vehicleNumberBound = 'true';
      select.addEventListener('change', () => queueMicrotask(() => sync(select, row, input)));
    }
    sync(select, row, input);
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();