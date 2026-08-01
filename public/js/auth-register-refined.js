(() => {
  const COMPANY_KEY = 'ep_register_company';

  function showToast(message) {
    const old = document.querySelector('.register-privacy-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast register-privacy-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function fieldOf(id) {
    return document.getElementById(id)?.closest('label.field-h') || null;
  }

  function normalizeContractTypeLabels(select) {
    [...select.options].forEach((option) => {
      const original = option.textContent || '';
      const refined = original.replace(/^\s*차량\s*/, '').trim();
      if (refined && refined !== original) option.textContent = refined;
    });
  }

  function normalizeRegisterForm() {
    const password = document.getElementById('a_password');
    const password2 = document.getElementById('a_password2');
    const submit = document.getElementById('a_submit');
    if (!password || !password2 || !submit || submit.textContent?.trim() !== '가입하고 시작') return;

    const card = submit.closest('.card');
    if (!card) return;

    const loginField = fieldOf('a_loginId');
    const passwordField = fieldOf('a_password');
    const password2Field = fieldOf('a_password2');
    const nameField = fieldOf('a_name');
    const phoneField = fieldOf('a_phone');
    const typeField = fieldOf('a_vtype');
    if (![loginField, passwordField, password2Field, nameField, phoneField, typeField].every(Boolean)) return;

    const appbar = document.querySelector('#app > .appbar');
    const appbarTitle = appbar?.querySelector('h1');
    const appbarSub = appbar?.querySelector('.sub');
    if (appbarTitle && appbarTitle.textContent?.trim() !== '회원가입') appbarTitle.textContent = '회원가입';
    if (appbarSub) appbarSub.remove();

    card.closest('.screen')?.querySelectorAll(':scope > .switch').forEach((switchText) => switchText.remove());

    const loginLabel = loginField.querySelector('.lb');
    const typeLabel = typeField.querySelector('.lb');
    if (loginLabel && loginLabel.textContent?.trim() !== '차량번호') loginLabel.textContent = '차량번호';
    if (typeLabel && typeLabel.textContent?.trim() !== '계약유형') typeLabel.textContent = '계약유형';

    const typeSelect = document.getElementById('a_vtype');
    if (typeSelect) normalizeContractTypeLabels(typeSelect);

    if (card.dataset.registerRefined === 'true') return;

    password.minLength = 4;
    password2.minLength = 4;
    password.placeholder = '최소 4자리';
    password2.placeholder = '최소 4자리 다시 입력';

    const companyField = document.createElement('label');
    companyField.className = 'field-h register-company-field';
    companyField.innerHTML = '<span class="lb">소속업체</span><input type="text" id="a_company" placeholder="없을 경우 공란">';

    const privacyConsent = document.createElement('label');
    privacyConsent.className = 'register-privacy-consent';
    privacyConsent.innerHTML = `
      <input type="checkbox" id="a_privacy_consent">
      <span><b>개인정보 수집·이용에 동의합니다.</b> <em>(필수)</em></span>
    `;

    [loginField, passwordField, password2Field, nameField, phoneField, typeField, companyField, privacyConsent, submit]
      .forEach((element) => card.append(element));

    card.querySelectorAll(':scope > .hint').forEach((hint) => hint.remove());

    submit.addEventListener('click', (event) => {
      if (password.value.length < 4 || password2.value.length < 4) {
        event.preventDefault();
        event.stopImmediatePropagation();
        password.focus();
        showToast('비밀번호는 최소 4자리로 입력해 주세요.');
        return;
      }

      const consent = document.getElementById('a_privacy_consent');
      if (!consent?.checked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        consent?.focus();
        showToast('개인정보 수집·이용 동의가 필요합니다.');
      }
    }, true);

    card.dataset.registerRefined = 'true';
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.endsWith('/api/auth/register') && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        const company = document.getElementById('a_company')?.value?.trim() || '';
        body.company = company;
        body.privacyConsent = true;
        body.privacyConsentAt = new Date().toISOString();
        init = { ...init, body: JSON.stringify(body) };
        localStorage.setItem(COMPANY_KEY, company);
      } catch { /* 기존 요청을 그대로 전송 */ }
    }
    return nativeFetch(input, init);
  };

  const app = document.getElementById('app');
  if (!app) return;

  let scheduled = false;
  const scheduleNormalize = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      normalizeRegisterForm();
    });
  };

  const observer = new MutationObserver(scheduleNormalize);
  observer.observe(app, { childList: true, subtree: true });
  scheduleNormalize();
})();