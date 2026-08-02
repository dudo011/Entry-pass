(() => {
  function apply() {
    document.querySelectorAll('.driver-account-actions .reset').forEach((button) => {
      if (button.textContent.trim() === '임시 비밀번호 발급') {
        button.textContent = '임시 비밀번호';
      }
    });
  }

  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  apply();
})();
