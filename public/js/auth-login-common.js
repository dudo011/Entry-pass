(() => {
  function apply() {
    const app = document.getElementById('app');
    if (!app) return;

    const loginId = document.getElementById('a_loginId');
    const password = document.getElementById('a_password');
    const passwordConfirm = document.getElementById('a_password2');
    const submit = document.getElementById('a_submit');
    const isLogin = !!(loginId && password && submit && !passwordConfirm && submit.textContent?.trim() === '로그인');

    app.classList.toggle('auth-login-common', isLogin);
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
