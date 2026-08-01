(() => {
  const MESSAGE = '계약업체를 입력해주세요.';

  function getCompanyInput() {
    return document.querySelector('#app #company');
  }

  function prepareCompanyInput() {
    const input = getCompanyInput();
    if (!input) return;
    input.required = true;
    input.setAttribute('aria-required', 'true');
    if (!input.dataset.companyRequiredBound) {
      input.addEventListener('input', () => input.setCustomValidity(''));
      input.dataset.companyRequiredBound = 'true';
    }
  }

  function blockEmptyCompany(event) {
    const submitButton = event.target.closest?.('#submitReq');
    if (!submitButton) return;

    const input = getCompanyInput();
    if (!input || input.value.trim()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    input.setCustomValidity(MESSAGE);
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.reportValidity();
  }

  document.addEventListener('click', blockEmptyCompany, true);

  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver(prepareCompanyInput).observe(app, {
    childList: true,
    subtree: true,
  });
  prepareCompanyInput();
})();
