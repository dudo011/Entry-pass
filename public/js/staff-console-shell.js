(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const normalize = (value) => String(value || '').replace(/\s+/g, '');

  function isStaffConsole(appbar) {
    return normalize(appbar?.querySelector('h1')?.textContent).includes('출입신청관리');
  }

  function applyStaffConsoleShell() {
    const appbar = app.querySelector(':scope > .appbar');
    if (!appbar || !isStaffConsole(appbar)) return;

    const roleBadge = app.querySelector(':scope > .admin-bar .role-badge');
    if (roleBadge) {
      appbar.dataset.staffConsoleRole = roleBadge.classList.contains('admin') ? 'admin' : 'staff';
    }

    appbar.classList.add('staff-console-bar');
    app.querySelector(':scope > .admin-bar')?.remove();

    const isAdmin = appbar.dataset.staffConsoleRole === 'admin';
    let adminButton = appbar.querySelector('.admin-tools-open');

    if (!isAdmin) {
      adminButton?.remove();
      return;
    }

    if (!adminButton) {
      adminButton = document.createElement('button');
      adminButton.type = 'button';
      adminButton.className = 'admin-tools-open';
      adminButton.textContent = '관리자모드';
      const logout = appbar.querySelector('[data-logout]');
      if (logout) appbar.insertBefore(adminButton, logout);
      else appbar.appendChild(adminButton);
    }

    if (adminButton.dataset.bound !== '1') {
      adminButton.dataset.bound = '1';
      adminButton.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('entrypass:open-admin-tools'));
      });
    }
  }

  new MutationObserver(applyStaffConsoleShell).observe(app, { childList: true, subtree: true });
  applyStaffConsoleShell();
})();
