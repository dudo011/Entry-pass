(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const COMPANY_TOKEN_KEY = 'ep_company_token';
  const CONTRACT_TYPES = [
    { id: 'construction', name: '공사업체' },
    { id: 'transport', name: '물자수송용역 차량' },
    { id: 'delivery', name: '기자재 납품차량' },
    { id: 'scrap', name: '불용품 매각차량' },
    { id: 'pcbs', name: 'PCBs처리용역 차량' },
  ];

  function contractOptions() {
    return '<option value="">계약유형 선택</option>' + CONTRACT_TYPES
      .map((type) => `<option value="${type.id}">${type.name}</option>`)
      .join('');
  }

  function setLabel(inputId, text) {
    const input = document.getElementById(inputId);
    const label = input?.closest('.cf-field')?.querySelector(':scope > span');
    if (label) label.textContent = text;
  }

  function unwrapInlineField(inputId) {
    const input = document.getElementById(inputId);
    const field = input?.closest('.cf-field');
    const row = field?.closest('.cf-inline');
    if (!field || !row || !row.parentElement) return field;

    row.parentElement.insertBefore(field, row);
    row.remove();
    return field;
  }

  function ensureContractField(card) {
    let select = document.getElementById('cf_reg_contract_type');
    if (select) return select.closest('.cf-field');

    const field = document.createElement('label');
    field.className = 'cf-field';
    field.innerHTML = `<span>계약유형</span><select id="cf_reg_contract_type">${contractOptions()}</select>`;
    card.insertBefore(field, document.getElementById('cf_register') || null);
    return field;
  }

  function refineRegistration() {
    const companyInput = document.getElementById('cf_reg_company');
    if (!companyInput) return;
    const card = companyInput.closest('.cf-card');
    if (!card) return;

    /* 공동계정에서는 개인 담당자 이름을 받지 않는다. */
    document.getElementById('cf_reg_name')?.closest('.cf-field')?.remove();

    /* 별도 중복확인 버튼은 사용하지 않는다. */
    document.getElementById('cf_check_login')?.remove();
    document.getElementById('cf_check_business')?.remove();

    /* 기존 입력 이벤트가 참조하므로 메시지 노드는 남기되 화면에서는 숨긴다. */
    const loginMsg = document.getElementById('cf_login_msg');
    const businessMsg = document.getElementById('cf_business_msg');
    if (loginMsg) loginMsg.style.display = 'none';
    if (businessMsg) businessMsg.style.display = 'none';

    const loginField = unwrapInlineField('cf_reg_login');
    const businessField = unwrapInlineField('cf_reg_business');
    const contractField = ensureContractField(card);

    setLabel('cf_reg_login', '아이디');
    setLabel('cf_reg_business', '사업자번호');
    setLabel('cf_reg_phone', '업체 연락처');

    const passwordField = document.getElementById('cf_reg_pw')?.closest('.cf-field');
    const passwordConfirmField = document.getElementById('cf_reg_pw2')?.closest('.cf-field');
    const companyField = document.getElementById('cf_reg_company')?.closest('.cf-field');
    const phoneField = document.getElementById('cf_reg_phone')?.closest('.cf-field');
    const submit = document.getElementById('cf_register');

    const ordered = [
      loginField,
      passwordField,
      passwordConfirmField,
      companyField,
      businessField,
      phoneField,
      contractField,
    ].filter(Boolean);

    if (submit) ordered.forEach((field) => card.insertBefore(field, submit));
  }

  function duplicateMessage(raw) {
    const message = String(raw || '');
    if (message.includes('아이디 또는 사업자등록번호')) {
      return { message: '아이디 또는 사업자번호가 이미 등록되어 있습니다. 해당 항목을 수정해 주세요.', field: 'cf_reg_login' };
    }
    if (message.includes('로그인 아이디') || message.includes('사용 중인 아이디')) {
      return { message: '이미 사용 중인 아이디입니다. 다른 아이디로 수정해 주세요.', field: 'cf_reg_login' };
    }
    if (message.includes('사업자등록번호')) {
      return { message: '이미 가입된 사업자번호입니다. 사업자번호를 확인하거나 수정해 주세요.', field: 'cf_reg_business' };
    }
    return { message: message || '회원가입에 실패했습니다. 다시 시도해 주세요.', field: '' };
  }

  async function registerCompany(event, button) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const value = (id) => document.getElementById(id)?.value || '';
    const loginId = value('cf_reg_login').trim();
    const password = value('cf_reg_pw');
    const password2 = value('cf_reg_pw2');
    const companyName = value('cf_reg_company').trim();
    const businessNo = value('cf_reg_business').trim();
    const phone = value('cf_reg_phone').trim();
    const contractTypeId = value('cf_reg_contract_type');

    if (!loginId || !password || !password2 || !companyName || !businessNo || !phone || !contractTypeId) {
      alert('모든 항목을 입력하고 계약유형을 선택해 주세요.');
      return;
    }
    if (password.length < 4) {
      alert('비밀번호는 최소 4자리로 입력해 주세요.');
      document.getElementById('cf_reg_pw')?.focus();
      return;
    }
    if (password !== password2) {
      alert('비밀번호가 일치하지 않습니다. 비밀번호 확인란을 수정해 주세요.');
      document.getElementById('cf_reg_pw2')?.focus();
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '가입 확인 중…';

    try {
      const response = await fetch('/api/company/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, businessNo, loginId, password, phone, contractTypeId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const info = duplicateMessage(data?.error);
        alert(info.message);
        if (info.field) document.getElementById(info.field)?.focus();
        return;
      }
      if (!data?.token) throw new Error('로그인 정보를 확인할 수 없습니다.');

      localStorage.setItem(COMPANY_TOKEN_KEY, data.token);
      location.href = '/';
    } catch (error) {
      alert(error?.message || '회원가입에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#cf_register');
    if (!button || !document.getElementById('cf_reg_company')) return;
    registerCompany(event, button);
  }, true);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refineRegistration();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
