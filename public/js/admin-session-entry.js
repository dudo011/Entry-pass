(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_token';
  let checking = false;

  async function checkStoredAdmin() {
    if (checking) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    checking = true;
    document.documentElement.classList.add('admin-auth-pending');
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const user = data.user;
      if (user?.role === 'staff' && user?.staffRole === 'admin') {
        window.dispatchEvent(new CustomEvent('entrypass:admin-login', {
          detail: { user },
        }));
      }
    } finally {
      checking = false;
      setTimeout(() => {
        if (!document.body.classList.contains('admin-portal-home')) {
          document.documentElement.classList.remove('admin-auth-pending');
        }
      }, 500);
    }
  }

  document.addEventListener('click', (event) => {
    const staffEntry = event.target.closest('[data-role="staff"]');
    if (!staffEntry) return;
    checkStoredAdmin();
  }, true);
})();
