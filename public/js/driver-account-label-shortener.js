(() => {
  function apply() {
    document.querySelectorAll('.driver-account-actions .reset').forEach((button) => {
      if (button.textContent.trim() === '임시 비밀번호 발급') {
        button.textContent = '임시 비밀번호';
      }
    });

    document.querySelectorAll('#app .driver-home-actions .link-btn').forEach((button) => {
      if (!['정보수정', '회원정보(차량관리)', '차량관리'].includes(button.textContent.trim())) return;
      button.textContent = '차량관리';
      button.style.background = 'var(--primary)';
      button.style.color = '#fff';
      button.style.border = '0';
      button.style.marginLeft = '0';
      const logout = button.parentElement?.querySelector('[data-logout]');
      if (logout) {
        logout.style.marginLeft = '0';
        const width = logout.getBoundingClientRect().width;
        if (width > 0) {
          button.style.width = `${width}px`;
          logout.style.width = `${width}px`;
          button.style.boxSizing = 'border-box';
          logout.style.boxSizing = 'border-box';
        }
      }
    });
  }

  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  apply();
})();
