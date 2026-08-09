(() => {
  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const driverToken = hash.get('driverAccess') || query.get('driverAccess');

  if (driverToken) {
    window.__EP_DRIVER_ACCESS_ENTRY__ = true;
    return;
  }

  document.write('<scr' + 'ipt src="/js/app.js?v=20260808-019"></scr' + 'ipt>');
})();
