(() => {
  const COMPANY_KEY = 'ep_register_company';

  function fieldOf(id) {
    return document.getElementById(id)?.closest('label.field-h') || null;
  }

  function normalizeRegisterForm() {
    const password = document.getElementById('a_password');
    const password2 = document.getElementById('a_password2');
    const submit = document.getElementById('a_submit');
    if (!password || !password2 || !submit || submit.textContent?.trim() !== '가입하고 시작') return;

    const card = submit.closest('.card');
    if (!card || card.dataset.registerRefined === 'true') return;

    const loginField = fieldOf('a_loginId');
    const passwordField = fieldOf('a_password');
    const password2Field = fieldOf('a_password2');
    const nameField = fieldOf('a_name');
    const phoneField = fieldOf('a_phone');
    const typeField = fieldOf('a_vtype');
    if (![loginField, passwordField, password2Field, nameField, phoneField, typeField].every(Boolean)) return;

    loginField.querySelector('.lb').textContent = '차량번호';
    typeField.querySelector('.lb').textContent = '계약유형';

    password.minLength = 4;
    password2.minLength = 4;
    password.placeholder = '최소 4자리';
    password2.placeholder = '최소 4자리 다시 입력';

    const companyField = document.createElement('label');
    companyField.className = 'field-h register-company-field';
    companyField.innerHTML = '<span class="lb">소속업체</span><input type="text" id="a_company" placeholder="없을 경우 공란">';

    [loginField, passwordField, password2Field, nameField, phoneField, typeField, companyField, submit]
      .forEach((element) => card.append(element));

    card.querySelectorAll(':scope > .hint').forEach((hint) => hint.remove());

    submit.addEventListener('click', (event) => {
      if (password.value.length < 4 || password2.value.length < 4) {
        event.preventDefault();
        event.stopImmediatePropagation();
        password.focus();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = '비밀번호는 최소 4자리로 입력해 주세요.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2400);
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
        init = { ...init, body: JSON.stringify(body) };
        localStorage.setItem(COMPANY_KEY, company);
      } catch { /* 기존 요청을 그대로 전송 */ }
    }
    return nativeFetch(input, init);
  };

  const app = document.getElementById('app');
  if (!app) return;
  const observer = new MutationObserver(normalizeRegisterForm);
  observer.observe(app, { childList: true, subtree: true });
  normalizeRegisterForm();
})();