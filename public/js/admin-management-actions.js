(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function invoke(selector, layerSelector) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 1500) {
      const button = app.querySelector(`:scope > .appbar ${selector}`);
      if (button && typeof button.onclick === 'function') {
        button.onclick.call(button, new MouseEvent('click', { bubbles: true, cancelable: true }));
        return document.querySelector(layerSelector);
      }
      await sleep(50);
    }
    return null;
  }

  window.EntryPassAdminActions = Object.freeze({
    openMembers: () => invoke('.driver-manage-open', '.driver-manage-layer'),
    openStaff: () => invoke('.staff-manage-open', '.staff-manage-layer'),
  });
})();
