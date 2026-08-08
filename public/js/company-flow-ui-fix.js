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

  const style = document.createElement('style');
  style.textContent = `
    /* 업체 로그인·회원가입·출입신청: 기존 앱처럼 라벨과 입력칸을 한 줄에 배치 */
    #app.cf-auth-login-layout .cf-card > .cf-field,
    #app.cf-auth-register-layout .cf-card > .cf-field,
    #app.cf-request-layout .cf-card > .cf-field,
    #app.cf-request-layout #cf_registered_box > .cf-field,
    #app.cf-request-layout #cf_temp_box > .cf-field {
      display:grid!important;
      grid-template-columns:96px minmax(0,1fr)!important;
      align-items:center!important;
      gap:10px!important;
      margin:0 0 12px!important;
    }
    #app.cf-auth-login-layout .cf-card > .cf-field > span,
    #app.cf-auth-register-layout .cf-card > .cf-field > span,
    #app.cf-request-layout .cf-card > .cf-field > span,
    #app.cf-request-layout #cf_registered_box > .cf-field > span,
    #app.cf-request-layout #cf_temp_box > .cf-field > span {
      display:block!important;
      margin:0!important;
      font-size:14px!important;
      line-height:1.25!important;
      font-weight:800!important;
      color:#334155!important;
    }

    /* 중복확인 항목도 라벨-입력-버튼이 같은 줄에서 보이도록 유지 */
    #app.cf-auth-register-layout .cf-card > .cf-inline {
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      align-items:center!important;
      gap:7px!important;
      margin:0!important;
    }
    #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field {
      display:grid!important;
      grid-template-columns:96px minmax(0,1fr)!important;
      align-items:center!important;
      gap:10px!important;
      margin:0!important;
      min-width:0!important;
    }
    #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field > span {
      display:block!important;
      margin:0!important;
      font-size:14px!important;
      line-height:1.2!important;
      font-weight:800!important;
      color:#334155!important;
    }
    #app.cf-auth-register-layout .cf-check {
      min-width:72px!important;
      padding:0 8px!important;
      font-size:13px!important;
      white-space:nowrap!important;
    }
    #app.cf-auth-register-layout .cf-msg {
      margin:4px 0 8px 106px!important;
      min-height:18px!important;
    }

    /* 출입신청의 차량 선택 영역도 좌우 폭이 흐트러지지 않도록 정리 */
    #app.cf-request-layout #cf_registered_box,
    #app.cf-request-layout #cf_temp_box {
      min-width:0!important;
    }
    #app.cf-request-layout .cf-card > .cf-title {
      margin-top:8px!important;
    }

    @media(max-width:390px) {
      #app.cf-auth-login-layout .cf-card > .cf-field,
      #app.cf-auth-register-layout .cf-card > .cf-field,
      #app.cf-request-layout .cf-card > .cf-field,
      #app.cf-request-layout #cf_registered_box > .cf-field,
      #app.cf-request-layout #cf_temp_box > .cf-field {
        grid-template-columns:86px minmax(0,1fr)!important;
        gap:8px!important;
      }
      #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field {
        grid-template-columns:86px minmax(0,1fr)!important;
        gap:8px!important;
      }
      #app.cf-auth-register-layout .cf-check {
        min-width:68px!important;
        padding:0 6px!important;
        font-size:12px!important;
      }
      #app.cf-auth-register-layout .cf-msg {
        margin-left:94px!important;
      }
    }
  `;
  document.head.appendChild(style);

  function contractOptions() {
    return '<option value="">계약유형 선택</option>' + CONTRACT_TYPES
      .map((type) => `<option value="${type.id}">${type.name}</option>`)
      .join('');
  }

  function refineRegistration() {
    const companyInput = document.getElementById('cf_reg_company');
    if (!companyInput) return;
    const card = companyInput.closest('.cf-card');
    if (!card) return;

    /* 업체 공동계정이므로 개인 담당자 이름은 수집하지 않는다. */
    document.getElementById('cf_reg_name')?.closest('.cf-field')?.remove();

    const phone = document.getElementById('cf_reg_phone');
    const phoneLabel = phone?.closest('.cf-field')?.querySelector(':scope > span');
    if (phoneLabel) phoneLabel.textContent = '업체 연락처';

    if (!document.getElementById('cf_reg_contract_type')) {
      const businessRow = document.getElementById('cf_reg_business')?.closest('.cf-inline');
      const businessMsg = document.getElementById('cf_business_msg');
      const anchor = businessMsg || businessRow;
      if (anchor) {
        const field = document.createElement('label');
        field.className = 'cf-field';
        field.innerHTML = `<span>계약유형</span><select id="cf_reg_contract_type">${contractOptions()}</select>`;
        anchor.insertAdjacentElement('afterend', field);
      }
    }
  }

  function refineAdminCompanyLabels() {
    document.querySelectorAll('.cf-admin-company > div').forEach((node) => {
      if (node.dataset.companyContactRefined === 'true') return;
      node.innerHTML = node.innerHTML.replace(/담당자\s*[^·<]*\s*·\s*/u, '업체 연락처 ');
      node.dataset.companyContactRefined = 'true';
    });
  }

  function apply() {
    /* 화면 헤더의 자체 뒤로가기 버튼은 제거한다.
       company-flow-v1.js의 history.pushState/popstate는 그대로 유지되므로
       휴대폰·브라우저 시스템 뒤로가기로 이전 화면으로 이동한다. */
    app.querySelectorAll('.cf-appbar [data-cf-back]').forEach((button) => button.remove());

    const login = !!document.getElementById('cf_login_id');
    const register = !!document.getElementById('cf_reg_company');
    const request = !!document.getElementById('cf_r_date');
    app.classList.toggle('cf-auth-login-layout', login);
    app.classList.toggle('cf-auth-register-layout', register);
    app.classList.toggle('cf-request-layout', request);

    if (register) refineRegistration();
    refineAdminCompanyLabels();
  }

  async function registerCompany(event, button) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const value = (id) => document.getElementById(id)?.value || '';
    const companyName = value('cf_reg_company').trim();
    const businessNo = value('cf_reg_business').trim();
    const loginId = value('cf_reg_login').trim();
    const password = value('cf_reg_pw');
    const password2 = value('cf_reg_pw2');
    const phone = value('cf_reg_phone').trim();
    const contractTypeId = value('cf_reg_contract_type');
    const loginMsg = document.getElementById('cf_login_msg')?.textContent || '';
    const businessMsg = document.getElementById('cf_business_msg')?.textContent || '';

    if (!companyName || !businessNo || !loginId || !password || !phone || !contractTypeId) {
      alert('모든 항목을 입력하고 계약유형을 선택해 주세요.');
      return;
    }
    if (!loginMsg.includes('사용 가능한')) {
      alert('로그인 아이디 중복확인을 해주세요.');
      return;
    }
    if (!businessMsg.includes('등록 가능한')) {
      alert('사업자등록번호 중복확인을 해주세요.');
      return;
    }
    if (password.length < 4) {
      alert('비밀번호는 최소 4자리로 입력해 주세요.');
      return;
    }
    if (password !== password2) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '가입 중…';

    try {
      const response = await fetch('/api/company/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, businessNo, loginId, password, phone, contractTypeId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '회원가입에 실패했습니다.');
      if (!data?.token) throw new Error('로그인 정보를 확인할 수 없습니다.');

      localStorage.setItem(COMPANY_TOKEN_KEY, data.token);
      location.href = '/';
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      alert(error?.message || '회원가입에 실패했습니다. 다시 시도해 주세요.');
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
      apply();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
