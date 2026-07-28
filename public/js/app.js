/* 자재센터 출입 사전승인 앱 - 프런트엔드 (빌드 불필요 SPA) */
(() => {
  const app = document.getElementById('app');
  const TOKEN_KEY = 'ep_token';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = {
    view: 'landing',
    user: null,
    token: localStorage.getItem(TOKEN_KEY) || null,
    vehicleTypes: [],
    retentionYears: 3,
    // 기사 신청 플로우
    authMode: 'login',      // login | register
    authRole: 'driver',     // driver | staff
    selectedType: null,
    agreedRequired: false,
    agreedOther: false,
    form: {},
    files: {},
    lastRequest: null,
    myRequests: [],
    // 직원 콘솔
    staffTab: 'pending',
    staffData: [],
  };

  let poll = null;
  const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };

  async function api(path, { method = 'GET', body, isForm } = {}) {
    const headers = {};
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, {
      method, headers, body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined),
    });
    let data = null;
    try { data = await res.json(); } catch { /* csv etc */ }
    if (!res.ok) throw new Error((data && data.error) || '요청에 실패했습니다.');
    return data;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  function go(view) { stopPoll(); state.view = view; render(); window.scrollTo(0, 0); }
  function logout() {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.token = null; state.user = null; state.form = {}; state.files = {};
    localStorage.removeItem(TOKEN_KEY);
    go('landing');
  }

  // ==== 공통 UI ============================================================
  function appbar(title, sub, opts = {}) {
    return `<div class="appbar">
      ${opts.back ? `<button class="back" data-nav="${opts.back}">‹</button>` : ''}
      <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      ${opts.logout ? `<button class="link-btn" data-logout>로그아웃</button>` : ''}
    </div>`;
  }
  function stepBar(n) {
    return `<div class="steps">${[0, 1, 2, 3].map((i) =>
      `<div class="dot ${i <= n ? 'done' : ''}"></div>`).join('')}</div>`;
  }
  const statusInfo = (s) => s === 'approved'
    ? { icon: '✅', title: '출입이 승인되었습니다', pill: '승인 완료' }
    : s === 'rejected'
    ? { icon: '⛔', title: '출입이 반려되었습니다', pill: '반려' }
    : { icon: '📨', title: '신청이 접수되었습니다', pill: '승인 대기 중' };

  // ==== 랜딩 ===============================================================
  function landing() {
    return `
      <div class="hero">
        <div class="logo">🏭</div>
        <h1>자재센터 출입 신청</h1>
        <p>출입 전 안전수칙을 확인하고 사전 승인을 받으세요.</p>
      </div>
      <div class="role-grid">
        <button class="role-btn" data-role="driver">
          <span class="emoji">🚚</span>
          <span><span class="rt">운전기사</span><br><span class="rd">안전수칙 확인 후 출입 신청</span></span>
          <span class="arrow">›</span>
        </button>
        <button class="role-btn" data-role="staff">
          <span class="emoji">🧑‍💼</span>
          <span><span class="rt">자재센터 직원</span><br><span class="rd">출입 신청 확인 및 승인</span></span>
          <span class="arrow">›</span>
        </button>
      </div>`;
  }

  // ==== 로그인 / 회원가입 ==================================================
  function authView() {
    const isDriver = state.authRole === 'driver';
    const isReg = isDriver && state.authMode === 'register';
    const typeOpts = state.vehicleTypes.map((t) =>
      `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    const regFields = isReg ? `
      <label class="field"><span class="lb">이름 <span class="req">*</span></span>
        <input type="text" id="a_name" placeholder="홍길동"></label>
      <label class="field"><span class="lb">연락처 <span class="req">*</span></span>
        <input type="tel" id="a_phone" placeholder="010-0000-0000"></label>
      <label class="field"><span class="lb">소속 업체</span>
        <input type="text" id="a_company" placeholder="OO물류"></label>
      <label class="field"><span class="lb">주 차량번호</span>
        <input type="text" id="a_vnum" placeholder="12가 3456"></label>
      <label class="field"><span class="lb">계약(차량) 유형</span>
        <select id="a_vtype">${typeOpts}</select></label>` : '';

    return appbar(isDriver ? '운전기사' : '자재센터 직원', isReg ? '회원가입' : '로그인', { back: 'landing' }) + `
      <div class="screen">
        <div class="card">
          <label class="field"><span class="lb">아이디 <span class="req">*</span></span>
            <input type="text" id="a_loginId" autocomplete="username" placeholder="아이디"></label>
          <label class="field"><span class="lb">비밀번호 <span class="req">*</span></span>
            <input type="password" id="a_password" autocomplete="current-password" placeholder="비밀번호"></label>
          ${regFields}
          <button class="btn btn-primary" id="a_submit">${isReg ? '가입하고 시작' : '로그인'}</button>
        </div>
        ${isDriver ? `<p class="switch">
          ${isReg ? '이미 계정이 있으신가요?' : '처음 이용하시나요?'}
          <a data-authmode="${isReg ? 'login' : 'register'}">${isReg ? '로그인' : '회원가입'}</a>
        </p>` : `<p class="hint">직원 계정은 관리자에게 문의하세요. (초기: admin / staff)</p>`}
      </div>`;
  }

  async function submitAuth() {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const loginId = v('a_loginId').trim();
    const password = v('a_password');
    if (!loginId || !password) return toast('아이디와 비밀번호를 입력하세요.');
    const btn = document.getElementById('a_submit');
    btn.disabled = true;
    try {
      let out;
      if (state.authRole === 'driver' && state.authMode === 'register') {
        if (!v('a_name').trim() || !v('a_phone').trim()) {
          btn.disabled = false; return toast('이름과 연락처를 입력하세요.');
        }
        out = await api('/auth/register', { method: 'POST', body: {
          loginId, password, name: v('a_name').trim(), phone: v('a_phone').trim(),
          company: v('a_company').trim(), defaultVehicleNumber: v('a_vnum').trim(),
          defaultVehicleTypeId: v('a_vtype'),
        }});
      } else {
        out = await api('/auth/login', { method: 'POST', body: { loginId, password } });
      }
      state.token = out.token; state.user = out.user;
      localStorage.setItem(TOKEN_KEY, out.token);
      if (out.user.role !== state.authRole) {
        // 직원 화면에서 기사 계정으로 로그인 등 방지
        if (state.authRole === 'staff' && out.user.role !== 'staff') {
          logout(); return toast('직원 계정이 아닙니다.');
        }
      }
      enterAfterAuth();
    } catch (e) {
      btn.disabled = false; toast(e.message);
    }
  }

  function enterAfterAuth() {
    if (state.user.role === 'staff') { state.staffTab = 'pending'; go('staffConsole'); }
    else go('driverHome');
  }

  // ==== 기사 홈 (신규 신청 / 내 이력) ======================================
  function driverHome() {
    const u = state.user;
    return appbar('출입 신청', `${u.name}님`, { logout: true }) + `
      <div class="screen">
        <button class="btn btn-primary big-cta" data-nav="driverTypes">＋ 새 출입 신청</button>
        <div class="profile-card card">
          <div class="section-title">내 기본정보 <a class="link-inline" data-nav="driverProfile">수정</a></div>
          <div class="row"><span class="k">연락처</span><span>${esc(u.phone) || '-'}</span></div>
          <div class="row"><span class="k">소속</span><span>${esc(u.company) || '-'}</span></div>
          <div class="row"><span class="k">주 차량번호</span><span>${esc(u.defaultVehicleNumber) || '-'}</span></div>
        </div>
        <div class="section-title">내 신청 내역</div>
        <div id="myList" class="muted">불러오는 중…</div>
      </div>`;
  }
  async function loadMyRequests() {
    try { state.myRequests = await api('/my/requests'); } catch { state.myRequests = []; }
    const box = document.getElementById('myList');
    if (!box) return;
    if (!state.myRequests.length) { box.innerHTML = '<div class="empty">아직 신청 내역이 없습니다.</div>'; return; }
    box.className = '';
    box.innerHTML = state.myRequests.map((r) => {
      const st = statusInfo(r.status);
      return `<button class="mini-card" data-open="${r.id}">
        <div class="mc-top"><span class="veh">${esc(r.vehicleTypeName)}</span>
          <span class="status-pill ${r.status}">${st.pill}</span></div>
        <div class="meta">${esc(r.passNo)} · ${new Date(r.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      </button>`;
    }).join('');
    box.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => {
      state.lastRequest = state.myRequests.find((r) => r.id === b.dataset.open);
      go('driverResult');
    });
  }

  // 기사 기본정보 수정
  function driverProfile() {
    const u = state.user;
    const typeOpts = state.vehicleTypes.map((t) =>
      `<option value="${t.id}" ${u.defaultVehicleTypeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    return appbar('내 기본정보', null, { back: 'driverHome' }) + `
      <div class="screen"><div class="card">
        <label class="field"><span class="lb">이름</span><input type="text" id="p_name" value="${esc(u.name)}"></label>
        <label class="field"><span class="lb">연락처</span><input type="tel" id="p_phone" value="${esc(u.phone)}"></label>
        <label class="field"><span class="lb">소속 업체</span><input type="text" id="p_company" value="${esc(u.company)}"></label>
        <label class="field"><span class="lb">주 차량번호</span><input type="text" id="p_vnum" value="${esc(u.defaultVehicleNumber)}"></label>
        <label class="field"><span class="lb">계약(차량) 유형</span><select id="p_vtype">${typeOpts}</select></label>
        <button class="btn btn-primary" id="p_save">저장</button>
      </div></div>`;
  }

  // ==== 신청 플로우 ========================================================
  function driverTypes() {
    const cards = state.vehicleTypes.map((t) => `
      <button class="type-card" data-type="${t.id}" style="--tc:${t.color}">
        ${state.user && state.user.defaultVehicleTypeId === t.id ? '<span class="my-tag">내 계약</span>' : ''}
        <div class="ico">${t.icon}</div>
        <div class="tn">${esc(t.name)}</div>
        <div class="ts">${esc(t.subtitle)}</div>
      </button>`).join('');
    return appbar('차량 유형 선택', '해당하는 차량을 선택하세요', { back: 'driverHome' }) +
      `<div class="screen"><div class="type-grid">${cards}</div></div>`;
  }

  function rulesScreen(kind) {
    const t = state.selectedType;
    const isReq = kind === 'required';
    const rules = (isReq ? t.requiredSafetyRules : t.otherSafetyRules)
      .map((r, i) => `<li><span class="n ${isReq ? '' : 'other'}">${i + 1}</span><span>${esc(r)}</span></li>`).join('');
    const checked = isReq ? state.agreedRequired : state.agreedOther;
    return appbar(t.name, isReq ? '필수 안전수칙 (1/2)' : '기타 안전수칙 (2/2)', { back: isReq ? 'driverTypes' : 'driverRequired' }) +
      stepBar(isReq ? 0 : 1) + `
      <div class="screen">
        <div class="section-title">${isReq ? '⚠️ 반드시 준수해야 하는 필수 안전수칙' : '📋 함께 지켜주세요 (기타 안전수칙)'}</div>
        <div class="card"><ul class="rule-list">${rules}</ul></div>
        <label class="agree ${isReq ? '' : 'soft'}">
          <input type="checkbox" id="agreeChk" ${checked ? 'checked' : ''}>
          <span>${isReq ? '위 필수 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.'
                        : '위 기타 안전수칙을 확인하였습니다.'}</span>
        </label>
        <div class="sticky-cta">
          <button class="btn btn-primary" id="rulesNext" ${isReq && !checked ? 'disabled' : ''}>
            ${isReq ? '다음 · 기타 안전수칙' : '다음 · 차량동선 안내'}
          </button>
        </div>
      </div>`;
  }

  function driverRoute() {
    const t = state.selectedType;
    const steps = t.route.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    return appbar(t.name, '차량 동선 안내', { back: 'driverOther' }) + stepBar(2) + `
      <div class="screen">
        <div class="section-title">🗺️ 센터 내 이동 경로</div>
        <div class="card">
          <div class="route-summary">${esc(t.route.summary)}</div>
          <ul class="route-list">${steps}</ul>
        </div>
        <div class="sticky-cta"><button class="btn btn-primary" data-nav="driverDocs">다음 · 서류 제출</button></div>
      </div>`;
  }

  function driverDocs() {
    const t = state.selectedType;
    const u = state.user;
    const f = state.form;
    // 저장된 기본정보로 프리필
    const val = (k, dflt) => esc(f[k] !== undefined ? f[k] : dflt);
    const docs = t.requiredDocuments.map((d) => {
      const has = state.files[d.key];
      return `<div class="doc-item">
        <span class="dl">${esc(d.label)}</span>
        <span class="badge ${d.required ? 'required' : 'optional'}">${d.required ? '필수' : '선택'}</span>
        <span class="up"><label class="file-btn ${has ? 'has' : ''}">
          ${has ? '✓ 첨부 · ' + (has.size / 1048576).toFixed(1) + 'MB' : '파일 선택'}
          <input type="file" data-doc="${d.key}" accept="image/*,application/pdf"></label></span>
      </div>`;
    }).join('');
    return appbar(t.name, '서류 제출 및 신청', { back: 'driverRoute' }) + stepBar(3) + `
      <div class="screen">
        <div class="section-title">📎 필요 서류</div>
        <div class="card">${docs}</div>
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <label class="field"><span class="lb">기사명 <span class="req">*</span></span>
            <input type="text" id="driverName" value="${val('driverName', u.name)}"></label>
          <label class="field"><span class="lb">연락처 <span class="req">*</span></span>
            <input type="tel" id="phone" value="${val('phone', u.phone)}"></label>
          <label class="field"><span class="lb">차량번호 <span class="req">*</span></span>
            <input type="text" id="vehicleNumber" value="${val('vehicleNumber', u.defaultVehicleNumber)}" placeholder="12가 3456"></label>
          <label class="field"><span class="lb">소속 업체</span>
            <input type="text" id="company" value="${val('company', u.company)}"></label>
          <label class="field"><span class="lb">방문 예정 일시</span>
            <input type="datetime-local" id="visitAt" value="${val('visitAt', '')}"></label>
          <label class="field"><span class="lb">방문/작업 목적</span>
            <textarea id="purpose" placeholder="예: 물자 수송">${val('purpose', '')}</textarea></label>
        </div>
        <div class="sticky-cta"><button class="btn btn-primary" id="submitReq">출입 신청 제출</button></div>
      </div>`;
  }

  function driverResult() {
    const r = state.lastRequest;
    const st = statusInfo(r.status);
    return appbar('신청 상세', null, { back: 'driverHome' }) + `
      <div class="screen">
        <div class="result">
          <div class="big-ico">${st.icon}</div>
          <h2>${st.title}</h2>
          <p>출입 승인번호</p>
          <div class="passno">${esc(r.passNo)}</div>
          <div><span class="status-pill ${r.status}">${st.pill}</span></div>
          ${r.status === 'rejected' && r.rejectReason
            ? `<p style="margin-top:12px;color:var(--danger)">반려 사유: ${esc(r.rejectReason)}</p>` : ''}
        </div>
        <div class="card">
          <div class="row"><span class="k">차량 유형</span><span>${esc(r.vehicleTypeName)}</span></div>
          <div class="row"><span class="k">기사명</span><span>${esc(r.driverName)}</span></div>
          <div class="row"><span class="k">차량번호</span><span>${esc(r.vehicleNumber)}</span></div>
          <div class="row"><span class="k">신청일시</span><span>${new Date(r.createdAt).toLocaleString('ko-KR')}</span></div>
          ${r.reviewedAt ? `<div class="row"><span class="k">처리</span><span>${esc(r.reviewedBy)} · ${new Date(r.reviewedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>` : ''}
        </div>
        <button class="btn btn-ghost" id="refreshStatus">🔄 승인 상태 새로고침</button>
      </div>`;
  }

  // ==== 직원 콘솔 ==========================================================
  function staffConsole() {
    const u = state.user;
    const isAdmin = u.staffRole === 'admin';
    const counts = { pending: 0, approved: 0, rejected: 0 };
    state.staffData.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const tab = (id, label) => `<button class="tab ${state.staffTab === id ? 'active' : ''}" data-tab="${id}">
      ${label} <span class="cnt">${counts[id] || 0}</span></button>`;

    let tabs = tab('pending', '대기') + tab('approved', '승인') + tab('rejected', '반려');
    if (isAdmin) tabs += tab('all', '전체이력');

    const list = state.staffTab === 'all' ? state.staffData
      : state.staffData.filter((r) => r.status === state.staffTab);
    const cards = list.length ? list.map(renderReqCard).join('')
      : `<div class="empty">${state.staffTab === 'pending' ? '대기 중인 신청이 없습니다.' : '항목이 없습니다.'}</div>`;

    const adminBar = isAdmin ? `<div class="admin-bar">
      <span class="role-badge admin">관리자</span>
      <button class="link-btn" id="exportCsv">📥 기록 CSV 내보내기</button>
    </div>` : `<div class="admin-bar"><span class="role-badge">승인담당</span></div>`;

    return appbar('출입 신청 관리', `${u.name}님`, { logout: true }) +
      `<div class="tabs">${tabs}</div>${adminBar}
       <div class="screen"><p class="retention-note">🗄️ 모든 출입·승인 기록은 서버에 ${state.retentionYears}년 이상 보관됩니다.</p>${cards}</div>`;
  }

  function renderReqCard(r) {
    const t = state.vehicleTypes.find((x) => x.id === r.vehicleTypeId);
    const st = statusInfo(r.status);
    const docs = (r.documents || []).map((d) =>
      `<a href="${esc(d.url)}" target="_blank" rel="noopener">📄 ${esc(d.label)}</a>`).join('')
      || '<span class="meta">첨부 서류 없음</span>';
    const visit = r.visitAt ? new Date(r.visitAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
    return `<div class="req-card">
      <div class="rh">
        <span style="font-size:22px">${t ? t.icon : '🚚'}</span>
        <div><div class="veh">${esc(r.vehicleTypeName)}</div>
          <div class="meta">${esc(r.passNo)} · ${new Date(r.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
        <span class="status-pill ${r.status}" style="margin-left:auto">${st.pill}</span>
      </div>
      <div class="row"><span class="k">기사명</span><span>${esc(r.driverName)} (${esc(r.phone)})</span></div>
      <div class="row"><span class="k">차량번호</span><span>${esc(r.vehicleNumber)}</span></div>
      <div class="row"><span class="k">소속</span><span>${esc(r.company) || '-'}</span></div>
      <div class="row"><span class="k">방문예정</span><span>${esc(visit)}</span></div>
      <div class="row"><span class="k">목적</span><span>${esc(r.purpose) || '-'}</span></div>
      <div class="row"><span class="k">안전수칙</span><span>필수 ${r.agreedRequired ? '✅' : '❌'} · 기타 ${r.agreedOther ? '✅' : '—'}</span></div>
      <div class="docs">${docs}</div>
      ${r.reviewedAt ? `<div class="meta">처리: ${esc(r.reviewedBy)} · ${new Date(r.reviewedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}${r.rejectReason ? ' · 사유: ' + esc(r.rejectReason) : ''}</div>` : ''}
      ${r.status === 'pending' ? `<div class="btn-row" style="margin-top:8px">
        <button class="btn btn-danger" data-reject="${r.id}">반려</button>
        <button class="btn btn-success" data-approve="${r.id}">승인</button>
      </div>` : ''}
    </div>`;
  }

  // ==== 렌더 + 이벤트 ======================================================
  function render() {
    const views = { landing, authView, driverHome, driverProfile, driverTypes,
      driverRequired: () => rulesScreen('required'), driverOther: () => rulesScreen('other'),
      driverRoute, driverDocs, driverResult, staffConsole };
    app.innerHTML = (views[state.view] || landing)();
    bind();
    if (state.view === 'driverHome') loadMyRequests();
    if (state.view === 'staffConsole') startStaffPolling();
  }

  function readForm() {
    ['driverName', 'phone', 'vehicleNumber', 'company', 'visitAt', 'purpose'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) state.form[id] = el.value;
    });
  }

  function bind() {
    app.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      if (b.dataset.nav === 'driverDocs') readForm();
      go(b.dataset.nav);
    });
    app.querySelectorAll('[data-logout]').forEach((b) => b.onclick = logout);

    // 역할 선택
    app.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => {
      state.authRole = b.dataset.role; state.authMode = 'login';
      if (state.token && state.user && state.user.role === b.dataset.role) enterAfterAuth();
      else go('authView');
    });
    // 로그인/가입 전환
    app.querySelectorAll('[data-authmode]').forEach((a) => a.onclick = () => {
      state.authMode = a.dataset.authmode; render();
    });
    const aSubmit = document.getElementById('a_submit');
    if (aSubmit) aSubmit.onclick = submitAuth;

    // 프로필 저장
    const pSave = document.getElementById('p_save');
    if (pSave) pSave.onclick = async () => {
      const v = (id) => (document.getElementById(id) || {}).value || '';
      try {
        const out = await api('/auth/profile', { method: 'PUT', body: {
          name: v('p_name'), phone: v('p_phone'), company: v('p_company'),
          defaultVehicleNumber: v('p_vnum'), defaultVehicleTypeId: v('p_vtype'),
        }});
        state.user = out.user; toast('저장되었습니다.'); go('driverHome');
      } catch (e) { toast(e.message); }
    };

    // 유형 선택
    app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
      state.selectedType = state.vehicleTypes.find((t) => t.id === b.dataset.type);
      state.agreedRequired = false; state.agreedOther = false; state.files = {}; state.form = {};
      go('driverRequired');
    });

    // 안전수칙 체크 + 다음
    const chk = document.getElementById('agreeChk');
    if (chk) chk.onchange = () => {
      if (state.view === 'driverRequired') state.agreedRequired = chk.checked;
      else state.agreedOther = chk.checked;
      const nx = document.getElementById('rulesNext');
      if (nx && state.view === 'driverRequired') nx.disabled = !chk.checked;
    };
    const rulesNext = document.getElementById('rulesNext');
    if (rulesNext) rulesNext.onclick = () =>
      go(state.view === 'driverRequired' ? 'driverOther' : 'driverRoute');

    // 파일 선택 (이미지는 업로드 전 자동 압축)
    app.querySelectorAll('input[type=file][data-doc]').forEach((inp) => inp.onchange = async () => {
      const key = inp.dataset.doc;
      if (inp.files[0]) {
        readForm();
        state.files[key] = await compressImage(inp.files[0]);
      } else { delete state.files[key]; }
      render();
    });

    const submit = document.getElementById('submitReq');
    if (submit) submit.onclick = submitRequest;
    const refresh = document.getElementById('refreshStatus');
    if (refresh) refresh.onclick = refreshStatus;

    // 직원 콘솔
    app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.staffTab = b.dataset.tab; render(); });
    app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => reviewReq(b.dataset.approve, 'approve'));
    app.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => reviewReq(b.dataset.reject, 'reject'));
    const exp = document.getElementById('exportCsv');
    if (exp) exp.onclick = downloadCsv;
  }

  async function downloadCsv() {
    const res = await fetch('/api/requests/export.csv', { headers: { Authorization: 'Bearer ' + state.token } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'entry-records.csv'; a.click();
  }

  // 이미지는 긴 변 1600px·JPEG 품질 0.72 로 축소해 용량을 줄입니다 (사진 업로드 대비).
  // PDF 등 이미지가 아닌 파일은 그대로 둡니다.
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  async function compressImage(file) {
    if (!file.type || !file.type.startsWith('image/')) return file;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.72));
      if (blob && blob.size < file.size) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    } catch { /* 실패 시 원본 사용 */ }
    return file;
  }

  async function submitRequest() {
    readForm();
    const f = state.form;
    if (!f.driverName || !f.phone || !f.vehicleNumber) return toast('기사명·연락처·차량번호를 입력하세요.');
    const missing = state.selectedType.requiredDocuments.filter((d) => d.required && !state.files[d.key]);
    if (missing.length) return toast(`필수 서류 미첨부: ${missing[0].label}`);
    const tooBig = Object.values(state.files).find((file) => file.size > MAX_UPLOAD_BYTES);
    if (tooBig) return toast(`파일이 너무 큽니다(5MB 초과): ${tooBig.name}. 사진으로 찍어 올려주세요.`);
    const btn = document.getElementById('submitReq'); btn.disabled = true; btn.textContent = '제출 중…';
    const fd = new FormData();
    fd.append('vehicleTypeId', state.selectedType.id);
    fd.append('driverName', f.driverName); fd.append('phone', f.phone);
    fd.append('vehicleNumber', f.vehicleNumber); fd.append('company', f.company || '');
    fd.append('visitAt', f.visitAt || ''); fd.append('purpose', f.purpose || '');
    fd.append('agreedRequired', 'true'); fd.append('agreedOther', String(state.agreedOther));
    Object.values(state.files).forEach((file) => fd.append('documents', file));
    try {
      const data = await api('/requests', { method: 'POST', body: fd, isForm: true });
      state.lastRequest = data; state.form = {}; state.files = {};
      go('driverResult');
    } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = '출입 신청 제출'; }
  }

  async function refreshStatus() {
    if (!state.lastRequest) return;
    try {
      const data = await api('/requests/' + state.lastRequest.id);
      state.lastRequest = data; render();
      toast(data.status === 'pending' ? '아직 승인 대기 중입니다.' : '상태가 갱신되었습니다.');
    } catch (e) { toast(e.message); }
  }

  async function reviewReq(id, action) {
    let body = {};
    if (action === 'reject') body = { reason: prompt('반려 사유를 입력하세요 (선택):') || '' };
    try {
      await api(`/requests/${id}/${action}`, { method: 'POST', body });
      toast(action === 'approve' ? '승인되었습니다.' : '반려되었습니다.');
      await loadStaff();
    } catch (e) { toast(e.message); }
  }

  async function loadStaff() {
    try { state.staffData = await api('/requests'); } catch (e) { return toast(e.message); }
    if (state.view === 'staffConsole') render();
  }
  function startStaffPolling() { stopPoll(); loadStaff(); poll = setInterval(loadStaff, 5000); }

  // ==== 부팅 ===============================================================
  async function boot() {
    try {
      const [types, ret] = await Promise.all([
        fetch('/api/vehicle-types').then((r) => r.json()),
        fetch('/api/retention').then((r) => r.json()).catch(() => ({ retentionYears: 3 })),
      ]);
      state.vehicleTypes = types;
      state.retentionYears = ret.retentionYears || 3;
    } catch {
      app.innerHTML = '<div class="empty">서버에 연결할 수 없습니다.</div>'; return;
    }
    if (state.token) {
      try { const me = await api('/auth/me'); state.user = me.user; }
      catch { state.token = null; localStorage.removeItem(TOKEN_KEY); }
    }
    render();
  }
  boot();
})();
