(() => {
  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const driverToken = hash.get('driverAccess') || query.get('driverAccess');

  if (driverToken) {
    document.write('<scr' + 'ipt src="/js/driver-access-paged-v3.js?v=20260808-001"></scr' + 'ipt>');
    return;
  }

  document.write('<scr' + 'ipt src="/js/company-flow-v1.js?v=20260809-001"></scr' + 'ipt>');
})();
