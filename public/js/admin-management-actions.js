(() => {
  const app = document.getElementById('app');
  if (!app) return;

  function invoke(selector, layerSelector) {
    const button = app.querySelector(`:scope > .appbar ${selector}`);
    if (!button || typeof button.onclick !== 'function') return null;
    button.onclick.call(button, new MouseEvent('click', { bubbles: true, cancelable: true }));
    return document.querySelector(layerSelector);
  }

  window.EntryPassAdminActions = Object.freeze({
    openMembers: () => invoke('.driver-manage-open', '.driver-manage-layer'),
    openStaff: () => invoke('.staff-manage-open', '.staff-manage-layer'),
  });
})();
