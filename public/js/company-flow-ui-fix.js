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
    /*
     * 신규 업체 흐름을 기존 Entry-pass 디자인 시스템에 맞춘다.
     * 기준: global-refined.css의 appbar / screen / card / field-h / input / btn.
     */
    #app.company-flow-active,
    #app.cf-driver {
      max-width:520px!important;
      min-height:100dvh!important;
      margin:0 auto!important;
      background:var(--bg,#F8FAFC)!important;
      color:var(--text,#0F172A)!important;
    }

    #app .cf-appbar {
      position:sticky!important;
      top:0!important;
      z-index:50!important;
      min-height:68px!important;
      box-sizing:border-box!important;
      display:flex!important;
      align-items:center!important;
      gap:12px!important;
      padding:max(13px,env(safe-area-inset-top)) 16px 13px!important;
      background:var(--header,#0F172A)!important;
      color:#fff!important;
      box-shadow:none!important;
    }
    #app .cf-appbar > div:not(.cf-spacer) { min-width:0!important; }
    #app .cf-appbar h1 {
      margin:0!important;
      font-size:23px!important;
      font-weight:800!important;
      line-height:1.22!important;
      letter-spacing:0!important;
    }
    #app .cf-appbar small {
      display:block!important;
      margin-top:3px!important;
      color:#fff!important;
      font-size:15px!important;
      font-weight:600!important;
      line-height:1.3!important;
      opacity:.76!important;
    }
    #app .cf-appbar .cf-spacer { flex:1!important; }
    #app .cf-head-btn {
      flex:0 0 auto!important;
      min-width:0!important;
      min-height:40px!important;
      height:40px!important;
      margin-left:auto!important;
      padding:8px 13px!important;
      border:1px solid rgba(255,255,255,.14)!important;
      border-radius:12px!important;
      background:rgba(255,255,255,.09)!important;
      color:#fff!important;
      font-size:15px!important;
      font-weight:700!important;
      line-height:1.2!important;
    }

    #app .cf-screen {
      max-width:none!important;
      margin:0!important;
      padding:18px 16px calc(28px + env(safe-area-inset-bottom))!important;
    }
    #app .cf-card {
      padding:16px!important;
      margin-bottom:16px!important;
      border:0!important;
      border-radius:16px!important;
      background:var(--surface,#fff)!important;
      box-shadow:0 10px 25px rgba(0,0,0,.06)!important;
    }
    #app .cf-title {
      margin:4px 2px 10px!important;
      color:var(--text,#0F172A)!important;
      font-size:18px!important;
      font-weight:800!important;
      line-height:1.35!important;
      letter-spacing:0!important;
    }

    /* 기존 .field-h와 동일한 라벨/입력 배치 */
    #app.company-flow-active .cf-card > .cf-field,
    #app.company-flow-active #cf_registered_box > .cf-field,
    #app.company-flow-active #cf_temp_box > .cf-field {
      display:flex!important;
      align-items:center!important;
      gap:12px!important;
      margin:0 0 13px!important;
      min-width:0!important;
    }
    #app.company-flow-active .cf-card > .cf-field > span,
    #app.company-flow-active #cf_registered_box > .cf-field > span,
    #app.company-flow-active #cf_temp_box > .cf-field > span {
      display:block!important;
      flex:0 0 96px!important;
      width:96px!important;
      margin:0!important;
      color:var(--text,#0F172A)!important;
      font-size:16px!important;
      font-weight:700!important;
      line-height:1.25!important;
      word-break:keep-all!important;
    }
    #app.company-flow-active .cf-field > input,
    #app.company-flow-active .cf-field > select {
      flex:1 1 0!important;
      min-width:0!important;
    }

    #app.company-flow-active .cf-field input,
    #app.company-flow-active .cf-field select,
    #app.company-flow-active input[type=text],
    #app.company-flow-active input[type=tel],
    #app.company-flow-active input[type=password],
    #app.company-flow-active input[type=date],
    #app.company-flow-active select {
      width:100%!important;
      min-height:54px!important;
      height:54px!important;
      box-sizing:border-box!important;
      padding:13px 14px!important;
      border:1px solid var(--border,#E2E8F0)!important;
      border-radius:13px!important;
      background:#fff!important;
      color:var(--text,#0F172A)!important;
      font-size:18px!important;
      font-weight:550!important;
      line-height:1.3!important;
      box-shadow:0 1px 2px rgba(15,23,42,.03)!important;
    }
    #app.company-flow-active input::placeholder { color:#94A3B8!important; }
    #app.company-flow-active input:focus,
    #app.company-flow-active select:focus {
      outline:none!important;
      border-color:var(--primary,#2563EB)!important;
      background:#fff!important;
      box-shadow:0 0 0 4px rgba(37,99,235,.12)!important;
    }

    /* 사업자번호/아이디 중복확인 행 */
    #app.cf-auth-register-layout .cf-card > .cf-inline {
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      align-items:center!important;
      gap:8px!important;
      margin:0!important;
      min-width:0!important;
    }
    #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field {
      display:flex!important;
      align-items:center!important;
      gap:12px!important;
      margin:0!important;
      min-width:0!important;
    }
    #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field > span {
      flex:0 0 96px!important;
      width:96px!important;
      margin:0!important;
      color:var(--text,#0F172A)!important;
      font-size:16px!important;
      font-weight:700!important;
      line-height:1.25!important;
      word-break:keep-all!important;
    }
    #app .cf-check {
      min-width:76px!important;
      height:54px!important;
      padding:0 10px!important;
      border:1px solid var(--border,#E2E8F0)!important;
      border-radius:13px!important;
      background:#fff!important;
      color:var(--primary,#2563EB)!important;
      font-size:15px!important;
      font-weight:700!important;
      white-space:nowrap!important;
    }
    #app.cf-auth-register-layout .cf-msg {
      min-height:18px!important;
      margin:4px 0 9px 108px!important;
      color:var(--text-muted,#64748B)!important;
      font-size:14px!important;
      font-weight:650!important;
      line-height:1.35!important;
    }
    #app.cf-auth-register-layout .cf-msg.ok { color:var(--success,#16A34A)!important; }
    #app.cf-auth-register-layout .cf-msg.err { color:var(--danger,#DC2626)!important; }

    /* 기존 .btn과 동일한 버튼 체계 */
    #app .cf-btn {
      width:100%!important;
      min-height:56px!important;
      padding:0 17px!important;
      border:0!important;
      border-radius:16px!important;
      font-size:18px!important;
      font-weight:750!important;
      line-height:1.25!important;
      box-shadow:none!important;
    }
    #app .cf-primary { background:var(--primary,#2563EB)!important; color:#fff!important; }
    #app .cf-secondary {
      border:1px solid var(--border,#E2E8F0)!important;
      background:#fff!important;
      color:var(--text,#0F172A)!important;
    }
    #app .cf-danger { background:var(--danger,#DC2626)!important; color:#fff!important; }
    #app .cf-success { background:var(--success,#16A34A)!important; color:#fff!important; }
    #app .cf-btn:disabled { background:#94A3B8!important; opacity:1!important; }
    #app .cf-small {
      width:auto!important;
      min-height:42px!important;
      height:auto!important;
      padding:8px 13px!important;
      border-radius:12px!important;
      font-size:15px!important;
      font-weight:700!important;
    }
    #app .cf-row2 { gap:10px!important; }

    /* 로그인/회원가입 보조문구 */
    #app .cf-switch {
      margin:14px 0 4px!important;
      color:var(--text-muted,#64748B)!important;
      font-size:16px!important;
      line-height:1.45!important;
      text-align:center!important;
    }
    #app .cf-link {
      padding:3px!important;
      border:0!important;
      background:transparent!important;
      color:var(--primary,#2563EB)!important;
      font-size:16px!important;
      font-weight:700!important;
    }

    /* 업체 홈 */
    #app .cf-hero {
      margin:4px 2px 18px!important;
      padding:0!important;
    }
    #app .cf-hero strong {
      display:block!important;
      font-size:26px!important;
      font-weight:800!important;
      line-height:1.3!important;
    }
    #app .cf-hero span {
      display:block!important;
      margin-top:6px!important;
      color:var(--text-muted,#64748B)!important;
      font-size:17px!important;
      line-height:1.5!important;
    }
    #app .cf-menu {
      gap:10px!important;
      margin-bottom:20px!important;
    }
    #app .cf-menu .cf-btn {
      min-height:76px!important;
      padding:12px!important;
      font-size:17px!important;
      line-height:1.35!important;
    }

    /* 신청내역/차량목록 */
    #app .cf-item {
      padding:16px!important;
      margin-bottom:12px!important;
      border:0!important;
      border-radius:16px!important;
      background:#fff!important;
      color:var(--text,#0F172A)!important;
      box-shadow:0 10px 25px rgba(0,0,0,.06)!important;
    }
    #app .cf-item-top { gap:8px!important; }
    #app .cf-item-top strong {
      color:var(--text,#0F172A)!important;
      font-size:18px!important;
      font-weight:750!important;
      line-height:1.35!important;
    }
    #app .cf-meta {
      margin-top:7px!important;
      color:var(--text-muted,#64748B)!important;
      font-size:15px!important;
      font-weight:500!important;
      line-height:1.45!important;
    }
    #app .cf-stage {
      min-height:32px!important;
      padding:6px 11px!important;
      border-radius:999px!important;
      font-size:14px!important;
      font-weight:750!important;
      line-height:1.3!important;
    }
    #app .cf-vehicle-actions { gap:8px!important; margin-top:12px!important; }

    /* 출입신청 차량 선택 */
    #app.cf-request-layout #cf_registered_box,
    #app.cf-request-layout #cf_temp_box { min-width:0!important; }
    #app .cf-mode {
      grid-template-columns:1fr 1fr!important;
      gap:10px!important;
      margin:0 0 14px!important;
    }
    #app .cf-mode label {
      min-height:54px!important;
      padding:13px 14px!important;
      border:1px solid var(--border,#E2E8F0)!important;
      border-radius:13px!important;
      background:#fff!important;
      color:var(--text,#0F172A)!important;
      font-size:16px!important;
      font-weight:700!important;
      line-height:1.35!important;
    }
    #app .cf-mode input { width:20px!important; height:20px!important; flex:none!important; }

    /* 제출서류 */
    #app .cf-doc {
      gap:12px!important;
      padding:13px 0!important;
      border-bottom:1px solid var(--border,#E2E8F0)!important;
    }
    #app .cf-doc .dl {
      color:var(--text,#0F172A)!important;
      font-size:17px!important;
      font-weight:700!important;
      line-height:1.4!important;
    }
    #app .cf-doc-note {
      margin-top:3px!important;
      color:var(--warn,#D97706)!important;
      font-size:14px!important;
      font-weight:700!important;
    }
    #app .cf-file-label {
      min-height:42px!important;
      padding:9px 13px!important;
      border:1px solid var(--primary,#2563EB)!important;
      border-radius:12px!important;
      background:#fff!important;
      color:var(--primary,#2563EB)!important;
      font-size:15px!important;
      font-weight:700!important;
    }
    #app .cf-file-label.has {
      border-color:var(--success,#16A34A)!important;
      background:var(--success-bg,#F0FDF4)!important;
      color:var(--success,#16A34A)!important;
    }
    #app .cf-form-btn {
      margin-top:4px!important;
      color:var(--primary,#2563EB)!important;
      font-size:15px!important;
      font-weight:700!important;
    }

    /* 기사 전용 안전수칙/동선 화면 */
    #app.cf-driver .cf-screen { max-width:none!important; }
    #app .cf-rules li {
      gap:11px!important;
      padding:10px 0!important;
      border-bottom:1px solid var(--border,#E2E8F0)!important;
      color:var(--text,#0F172A)!important;
      font-size:17px!important;
      font-weight:550!important;
      line-height:1.5!important;
    }
    #app .cf-num {
      flex:0 0 25px!important;
      width:25px!important;
      height:25px!important;
      background:var(--primary,#2563EB)!important;
      color:#fff!important;
      font-size:14px!important;
      font-weight:800!important;
    }
    #app .cf-route-img {
      border:1px solid var(--border,#E2E8F0)!important;
      border-radius:13px!important;
      background:#fff!important;
    }
    #app .cf-route-steps {
      margin:12px 0 0!important;
      padding-left:22px!important;
      color:var(--text,#0F172A)!important;
      font-size:17px!important;
      line-height:1.55!important;
    }
    #app .cf-agree {
      gap:12px!important;
      margin:4px 0 14px!important;
      padding:14px!important;
      border:1px solid #FDE68A!important;
      border-radius:14px!important;
      background:var(--warn-bg,#FFFBEB)!important;
      color:#78350F!important;
      font-size:17px!important;
      font-weight:650!important;
      line-height:1.5!important;
    }
    #app .cf-agree input { width:22px!important; height:22px!important; flex:none!important; }
    #app .cf-photo p {
      margin:0 0 14px!important;
      color:var(--text-muted,#64748B)!important;
      font-size:17px!important;
      line-height:1.5!important;
    }

    /* 직원 업체관리 오버레이도 같은 시각 언어 사용 */
    .cf-admin-companies { background:var(--bg,#F8FAFC)!important; }
    .cf-admin-company {
      margin-bottom:12px!important;
      padding:16px!important;
      border:0!important;
      border-radius:16px!important;
      background:#fff!important;
      box-shadow:0 10px 25px rgba(0,0,0,.06)!important;
    }
    .cf-admin-company strong { font-size:18px!important; font-weight:750!important; }
    .cf-admin-company div {
      margin-top:7px!important;
      color:var(--text-muted,#64748B)!important;
      font-size:15px!important;
      line-height:1.45!important;
    }

    @media(max-width:390px) {
      #app .cf-screen { padding-left:14px!important; padding-right:14px!important; }
      #app.company-flow-active .cf-card > .cf-field > span,
      #app.company-flow-active #cf_registered_box > .cf-field > span,
      #app.company-flow-active #cf_temp_box > .cf-field > span,
      #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field > span {
        flex-basis:90px!important;
        width:90px!important;
      }
      #app.cf-auth-register-layout .cf-msg { margin-left:102px!important; }
      #app .cf-check { min-width:70px!important; padding:0 7px!important; font-size:14px!important; }
    }
  `;
  document.head.appendChild(style);

  function contractOptions() {
    return '<option value="">계약유형 선택</option>' + CONTRACT_TYPES
      .map((type) => `<option value="${type.id}">${type.name}</option>`)
      .join('');
  }

  function setFieldLabel(inputId, labelText) {
    const input = document.getElementById(inputId);
    const label = input?.closest('.cf-field')?.querySelector(':scope > span');
    if (label) label.textContent = labelText;
  }

  function refineHeader(title, subtitle) {
    const bar = app.querySelector(':scope > .cf-appbar');
    if (!bar) return;
    const h1 = bar.querySelector('h1');
    const small = bar.querySelector('small');
    if (h1 && title) h1.textContent = title;
    if (small && subtitle) small.textContent = subtitle;
  }

  function refineRegistration() {
    const companyInput = document.getElementById('cf_reg_company');
    if (!companyInput) return;
    const card = companyInput.closest('.cf-card');
    if (!card) return;

    /* 업체 공동계정이므로 개인 담당자 이름은 수집하지 않는다. */
    document.getElementById('cf_reg_name')?.closest('.cf-field')?.remove();

    setFieldLabel('cf_reg_login', '아이디');
    setFieldLabel('cf_reg_phone', '업체 연락처');

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

    refineHeader('계약업체', '회원가입');
  }

  function refineLogin() {
    if (!document.getElementById('cf_login_id')) return;
    setFieldLabel('cf_login_id', '아이디');
    refineHeader('계약업체', '로그인');
  }

  function refineAdminCompanyLabels() {
    document.querySelectorAll('.cf-admin-company > div').forEach((node) => {
      if (node.dataset.companyContactRefined === 'true') return;
      node.innerHTML = node.innerHTML.replace(/담당자\s*[^·<]*\s*·\s*/u, '업체 연락처 ');
      node.dataset.companyContactRefined = 'true';
    });
  }

  function apply() {
    /* 헤드 내부 뒤로가기 버튼은 두지 않고 시스템/브라우저 뒤로가기를 사용한다. */
    app.querySelectorAll('.cf-appbar [data-cf-back]').forEach((button) => button.remove());

    const login = !!document.getElementById('cf_login_id');
    const register = !!document.getElementById('cf_reg_company');
    const request = !!document.getElementById('cf_r_date');
    app.classList.toggle('cf-auth-login-layout', login);
    app.classList.toggle('cf-auth-register-layout', register);
    app.classList.toggle('cf-request-layout', request);

    if (login) refineLogin();
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
      alert('아이디 중복확인을 해주세요.');
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
