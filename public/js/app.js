/* 자재센터 출입 사전승인 앱 - 프런트엔드 (빌드 불필요 SPA) */
(() => {
  const app = document.getElementById('app');
  const TOKEN_KEY = 'ep_token';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 연락처 자동 하이픈: 010-1234-5678 형식
  const formatPhone = (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  };
  // 대한민국 공휴일(대체공휴일 포함). 음력 명절(설날·추석·부처님오신날)은 매년 달라지므로
  // 연 1회 갱신이 필요합니다. 미포함 연도는 주말만 제외합니다.
  const HOLIDAYS = new Set([
    // 2026
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
    '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28', '2026-10-03', '2026-10-05',
    '2026-10-09', '2026-12-25',
    // 2027
    '2027-01-01', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
    '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16',
    '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04',
    '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
  ]);
  const dateKey = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  // 다음 영업일(주말·공휴일 제외) 오전 9시
  function nextBusinessDay() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS.has(dateKey(d))) d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const toLocalDatetime = (d) =>
    `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // 방문 예정 일시 표시/선택용
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtVisit = (d) => {
    const h = d.getHours(); const ap = h < 12 ? '오전' : '오후'; const h12 = ((h + 11) % 12) + 1;
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${WD[d.getDay()]}) ${ap} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // 갤럭시 캘린더 앱 스타일의 월(月) 달력 + 시간 선택 모달
  function openCalendar() {
    const cur = state.form.visitAt ? new Date(state.form.visitAt) : nextBusinessDay();
    const sel = new Date(cur);
    const view = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const close = openOverlay(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    const hourOpts = Array.from({ length: 24 }, (_, h) =>
      `<option value="${h}">${String(h).padStart(2, '0')}</option>`).join('');
    const minOpts = ['00', '10', '20', '30', '40', '50'].map((m) =>
      `<option value="${m}">${m}</option>`).join('');

    function draw() {
      const y = view.getFullYear(), m = view.getMonth();
      const startWd = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const now = new Date();
      let cells = '';
      for (let i = 0; i < startWd; i++) cells += '<div></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(y, m, day);
        const wd = d.getDay();
        const cls = ['cal-cell'];
        if (wd === 0) cls.push('sun'); else if (wd === 6) cls.push('sat');
        if (HOLIDAYS.has(dateKey(d))) cls.push('hol');
        if (sameDay(d, now)) cls.push('today');
        if (sameDay(d, sel)) cls.push('sel');
        const blocked = d < today || HOLIDAYS.has(dateKey(d)); // 지난 날짜·공휴일 선택 불가
        cells += `<button type="button" class="${cls.join(' ')}" data-day="${day}" ${blocked ? 'disabled' : ''}>${day}</button>`;
      }
      backdrop.innerHTML = `<div class="cal-sheet">
        <div class="cal-head">
          <button class="cal-nav" data-mv="-1">‹</button>
          <div class="mtitle">${y}년 ${m + 1}월</div>
          <button class="cal-nav" data-mv="1">›</button>
        </div>
        <div class="cal-grid">
          <div class="cal-wd sun">일</div><div class="cal-wd">월</div><div class="cal-wd">화</div>
          <div class="cal-wd">수</div><div class="cal-wd">목</div><div class="cal-wd">금</div><div class="cal-wd sat">토</div>
          ${cells}
        </div>
        <div class="cal-time">
          <span class="lb">시간</span>
          <select id="cal-h">${hourOpts}</select><span>:</span><select id="cal-m">${minOpts}</select>
        </div>
        <div class="cal-actions">
          <button class="btn btn-ghost" data-cal="cancel">취소</button>
          <button class="btn btn-primary" data-cal="ok">확인</button>
        </div>
      </div>`;
      backdrop.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
        view.setMonth(view.getMonth() + Number(b.dataset.mv)); draw();
      });
      backdrop.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => {
        sel.setFullYear(y, m, Number(b.dataset.day)); draw();
      });
      const hSel = backdrop.querySelector('#cal-h'); hSel.value = String(sel.getHours());
      const mSel = backdrop.querySelector('#cal-m');
      mSel.value = String(Math.floor(sel.getMinutes() / 10) * 10).padStart(2, '0');
      hSel.onchange = () => sel.setHours(Number(hSel.value));
      mSel.onchange = () => sel.setMinutes(Number(mSel.value));
      backdrop.querySelector('[data-cal="cancel"]').onclick = close;
      backdrop.querySelector('[data-cal="ok"]').onclick = () => {
        state.form.visitAt = toLocalDatetime(sel);
        const btn = document.getElementById('visitAt');
        if (btn) btn.textContent = fmtVisit(sel);
        close();
      };
    }
    draw();
  }

  // 사진 확대(라이트박스) — 앱을 벗어나지 않고 인앱 오버레이로 표시, 뒤로가기로 닫힘
  function openLightbox(url, label) {
    const el = document.createElement('div');
    el.className = 'lightbox';
    el.innerHTML = `<button class="lb-close" type="button" aria-label="닫기">✕</button>
      <img src="${esc(url)}" alt="${esc(label || '')}">`;
    const close = openOverlay(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.classList.contains('lb-close')) close();
    });
  }

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
    safetyPages: [],        // 선택 유형의 안전수칙 페이지들(필수 여러 장 + 기타)
    safetyIndex: 0,
    safetyAgree: {},        // 페이지별 동의 체크 상태
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

  // 뒤로가기(하드웨어/브라우저 '<') 지원용 화면 검증
  const AUTH_VIEWS = ['driverHome', 'driverProfile', 'driverTypes', 'driverSafety',
    'driverRoute', 'driverDocs', 'driverResult', 'staffConsole', 'staffDetail'];
  function canRender(view) {
    if (AUTH_VIEWS.includes(view) && !state.user) return false;
    if (['driverSafety', 'driverRoute', 'driverDocs'].includes(view) && !state.selectedType) return false;
    if (view === 'driverSafety' && !(state.safetyPages && state.safetyPages[state.safetyIndex])) return false;
    if (view === 'driverResult' && !state.lastRequest) return false;
    if (view === 'staffDetail' && !state.staffDetail) return false;
    return true;
  }
  const fallbackView = () => state.user ? (state.user.role === 'staff' ? 'staffConsole' : 'driverHome') : 'landing';
  function showView(view) { stopPoll(); state.view = view; render(); window.scrollTo(0, 0); }

  // 오버레이(달력·사진 확대 등): 뒤로가기 시 화면 이동 대신 오버레이만 닫히게
  const overlays = [];
  function openOverlay(node) {
    document.body.appendChild(node);
    overlays.push(() => node.remove());
    history.pushState({ view: state.view, ov: overlays.length }, '');
    return () => history.back(); // 닫기: 뒤로가기로 처리해 히스토리 일관성 유지
  }

  window.addEventListener('popstate', (e) => {
    if (overlays.length) { const rm = overlays.pop(); try { rm(); } catch { /* noop */ } return; }
    let view = (e.state && e.state.view) || 'landing';
    if (e.state && typeof e.state.si === 'number') state.safetyIndex = e.state.si;
    if (!canRender(view)) view = fallbackView();
    showView(view);
  });

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
  function go(view, opts) {
    const hs = { view };
    if (opts && opts.si !== undefined) { hs.si = opts.si; state.safetyIndex = opts.si; }
    try {
      if (opts && opts.replace) history.replaceState(hs, '');
      else history.pushState(hs, '');
    } catch { /* noop */ }
    showView(view);
  }
  function logout() {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.token = null; state.user = null; state.form = {}; state.files = {};
    localStorage.removeItem(TOKEN_KEY);
    go('landing');
  }

  // ==== 공통 UI ============================================================
  function appbar(title, sub, opts = {}) {
    return `<div class="appbar">
      ${opts.back ? '<button class="back" data-histback>‹</button>' : ''}
      <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      ${opts.logout ? `<button class="link-btn" data-logout>로그아웃</button>` : ''}
    </div>`;
  }
  function stepBar(current, total) {
    let d = '';
    for (let i = 0; i < total; i++) d += `<div class="dot ${i <= current ? 'done' : ''}"></div>`;
    return `<div class="steps">${d}</div>`;
  }
  // 안전수칙 페이지 구성: 필수(6개 초과 시 여러 장) + 기타 1장
  function buildSafetyPages(t) {
    const PER = 6;
    const req = t.requiredSafetyRules || [];
    const nReq = Math.max(1, Math.ceil(req.length / PER));
    const pages = [];
    for (let i = 0; i < nReq; i++) {
      pages.push({ kind: 'required', rules: req.slice(i * PER, i * PER + PER),
        offset: i * PER, reqPage: i + 1, reqTotal: nReq });
    }
    pages.push({ kind: 'other', rules: t.otherSafetyRules || [] });
    return pages;
  }
  // 전체 단계 수 = 안전수칙 페이지들 + 동선 + 서류
  const safetyTotal = () => (state.safetyPages && state.safetyPages.length ? state.safetyPages.length : 1) + 2;
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

    // 라벨(항목명)과 입력칸을 좌우로 나란히 배치 (모든 항목 필수라 별표 생략)
    const fld = (label, input) =>
      `<label class="field-h"><span class="lb">${label}</span>${input}</label>`;

    const cardInner = isReg ? `
      ${fld('계약(차량) 유형', `<select id="a_vtype">${typeOpts}</select>`)}
      ${fld('아이디(차량번호)', '<input type="text" id="a_loginId" autocomplete="username" placeholder="예: 12가3456">')}
      ${fld('비밀번호', '<input type="password" id="a_password" autocomplete="new-password" placeholder="비밀번호">')}
      ${fld('비밀번호 확인', '<input type="password" id="a_password2" autocomplete="new-password" placeholder="다시 입력">')}
      ${fld('이름', '<input type="text" id="a_name" placeholder="홍길동">')}
      ${fld('연락처', '<input type="tel" id="a_phone" placeholder="010-0000-0000">')}
      <p class="hint" style="margin:2px 2px 12px;text-align:left">※ 아이디는 <b>차량번호</b>로 입력하세요. (소속업체는 출입 신청 시 입력)</p>
      <button class="btn btn-primary" id="a_submit">가입하고 시작</button>` : `
      ${fld(isDriver ? '아이디(차량번호)' : '아이디', `<input type="text" id="a_loginId" autocomplete="username" placeholder="${isDriver ? '차량번호' : '아이디'}">`)}
      ${fld('비밀번호', '<input type="password" id="a_password" autocomplete="current-password" placeholder="비밀번호">')}
      <button class="btn btn-primary" id="a_submit">로그인</button>`;

    return appbar(isDriver ? '운전기사' : '자재센터 직원', isReg ? '회원가입' : '로그인', { back: 'landing' }) + `
      <div class="screen">
        <div class="card">${cardInner}</div>
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
    if (!loginId || !password) return toast('아이디(차량번호)와 비밀번호를 입력하세요.');
    const btn = document.getElementById('a_submit');
    btn.disabled = true;
    try {
      let out;
      if (state.authRole === 'driver' && state.authMode === 'register') {
        const name = v('a_name').trim(), phone = v('a_phone').trim();
        if (!name || !phone) {
          btn.disabled = false; return toast('모든 항목을 입력해 주세요.');
        }
        if (password !== v('a_password2')) {
          btn.disabled = false; return toast('비밀번호가 일치하지 않습니다.');
        }
        // 아이디를 차량번호로 사용
        out = await api('/auth/register', { method: 'POST', body: {
          loginId, password, name, phone, defaultVehicleTypeId: v('a_vtype'),
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
    // 로그인/회원가입 화면을 히스토리에서 대체 → 뒤로가기 시 로그인 화면이 다시 뜨지 않음
    if (state.user.role === 'staff') { state.staffTab = 'pending'; go('staffConsole', { replace: true }); }
    else go('driverHome', { replace: true });
  }

  // ==== 기사 홈 (신규 신청 / 내 이력) ======================================
  function driverHome() {
    const u = state.user;
    return appbar('출입 신청', `${u.name}님`, { logout: true }) + `
      <div class="screen">
        <button class="btn btn-primary big-cta" data-nav="driverTypes">＋ 새 출입 신청</button>
        <div class="profile-card card">
          <div class="section-title">내 기본정보 <a class="link-inline" data-nav="driverProfile">수정</a></div>
          <div class="row"><span class="k">차량번호(아이디)</span><span>${esc(u.defaultVehicleNumber || u.loginId) || '-'}</span></div>
          <div class="row"><span class="k">연락처</span><span>${esc(u.phone) || '-'}</span></div>
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
        <div class="row"><span class="k">차량번호(아이디)</span><span>${esc(u.defaultVehicleNumber || u.loginId)}</span></div>
        <label class="field" style="margin-top:12px"><span class="lb">이름</span><input type="text" id="p_name" value="${esc(u.name)}"></label>
        <label class="field"><span class="lb">연락처</span><input type="tel" id="p_phone" value="${esc(u.phone)}"></label>
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
        <div class="tn-wrap"><div class="tn">${esc(t.name)}</div><div class="ts">${esc(t.subtitle)}</div></div>
      </button>`).join('');
    return appbar('차량 유형 선택', '해당하는 차량을 선택하세요', { back: 'driverHome' }) +
      `<div class="screen"><div class="type-grid">${cards}</div></div>`;
  }

  function safetyScreen(idx) {
    const t = state.selectedType;
    const page = state.safetyPages[idx];
    const isReq = page.kind === 'required';
    const rules = page.rules.map((r, i) => {
      const n = (isReq ? page.offset : 0) + i + 1;
      return `<li><span class="n ${isReq ? '' : 'other'}">${n}</span><span>${esc(r)}</span></li>`;
    }).join('');
    const checked = !!state.safetyAgree[idx];
    const lastSafety = idx === state.safetyPages.length - 1;
    const nextKind = lastSafety ? null : state.safetyPages[idx + 1].kind;
    const nextLabel = lastSafety ? '다음 · 차량동선 안내'
      : (nextKind === 'other' ? '다음 · 기타 안전수칙' : '다음 · 필수 안전수칙');
    const sub = isReq
      ? (page.reqTotal > 1 ? `필수 안전수칙 (${page.reqPage}/${page.reqTotal})` : '필수 안전수칙')
      : '기타 안전수칙';
    const headText = isReq ? '필수안전수칙 : 위반시 안전지도서' : '기타안전수칙 : 위반시 안전계도서';
    const agreeText = isReq
      ? '위 필수 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.'
      : '위 기타 안전수칙을 확인하였습니다.';
    return appbar(t.name, sub, { back: true }) + stepBar(idx, safetyTotal()) + `
      <div class="screen">
        <div class="rules-head ${isReq ? 'req' : 'other'}">${headText}</div>
        <div class="card"><ul class="rule-list">${rules}</ul></div>
        <label class="agree ${isReq ? '' : 'soft'}">
          <input type="checkbox" id="agreeChk" ${checked ? 'checked' : ''}>
          <span>${agreeText}</span>
        </label>
        <div class="sticky-cta">
          <button class="btn btn-primary" id="rulesNext" ${isReq && !checked ? 'disabled' : ''}>${nextLabel}</button>
        </div>
      </div>`;
  }

  function driverRoute() {
    const t = state.selectedType;
    const steps = t.route.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    return appbar(t.name, '차량 동선 안내', { back: true }) + stepBar(state.safetyPages.length, safetyTotal()) + `
      <div class="screen">
        <div class="section-title">🗺️ 센터 내 이동 경로</div>
        <div class="card">
          <div class="route-summary">${esc(t.route.summary)}</div>
          <ul class="route-list">${steps}</ul>
        </div>
        <div class="sticky-cta"><button class="btn btn-primary" data-nav="driverDocs">${t.requiredDocuments.length ? '다음 · 서류 제출' : '다음 · 출입 신청'}</button></div>
      </div>`;
  }

  function driverDocs() {
    const t = state.selectedType;
    const u = state.user;
    const f = state.form;
    const hasDocs = t.requiredDocuments.length > 0;
    // 방문 예정 일시 기본값(다음 영업일 09시)을 최초 진입 시 설정
    if (state.form.visitAt === undefined) state.form.visitAt = toLocalDatetime(nextBusinessDay());
    // 저장된 기본정보로 프리필
    const val = (k, dflt) => esc(f[k] !== undefined ? f[k] : dflt);
    const docs = t.requiredDocuments.map((d) => {
      const has = state.files[d.key];
      return `<div class="doc-item">
        <span class="dl-wrap"><span class="dl">${esc(d.label)}</span><span class="badge ${d.required ? 'required' : 'optional'}">${d.required ? '필수' : '선택'}</span>${d.formUrl ? `<a class="form-dl" href="${esc(d.formUrl)}" target="_blank" rel="noopener">양식 ↓</a>` : ''}</span>
        <span class="up"><label class="file-btn ${has ? 'has' : ''}">
          ${has ? '✓ 첨부 · ' + (has.size / 1048576).toFixed(1) + 'MB' : '파일 선택'}
          <input type="file" data-doc="${d.key}" accept="image/*,application/pdf"></label></span>
      </div>`;
    }).join('');
    const infoCard = `
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <label class="field"><span class="lb">계약 업체</span>
            <input type="text" id="company" value="${val('company', '')}" placeholder="예: OO전력"></label>
          <label class="field"><span class="lb">방문 예정 일시</span>
            <button type="button" id="visitAt" class="datebtn">${esc(fmtVisit(new Date(state.form.visitAt)))}</button></label>
        </div>`;
    const docsCard = hasDocs ? `
        <div class="section-title">📎 필요 서류 (모두 필수)</div>
        <div class="card">${docs}</div>` : '';
    return appbar(t.name, hasDocs ? '신청 정보 및 서류' : '출입 신청 정보', { back: true }) + stepBar(state.safetyPages.length + 1, safetyTotal()) + `
      <div class="screen">
        ${infoCard}
        ${docsCard}
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

    const tabs = tab('pending', '대기') + tab('approved', '승인') + tab('rejected', '반려');

    const list = state.staffData.filter((r) => r.status === state.staffTab);
    const items = list.length ? list.map(staffListItem).join('')
      : `<div class="empty">${state.staffTab === 'pending' ? '대기 중인 신청이 없습니다.' : '항목이 없습니다.'}</div>`;

    const adminBar = isAdmin ? `<div class="admin-bar">
      <span class="role-badge admin">관리자</span>
      <button class="link-btn" id="exportCsv">📥 기록 CSV 내보내기</button>
    </div>` : `<div class="admin-bar"><span class="role-badge">승인담당</span></div>`;

    return appbar('출입 신청 관리', `${u.name}님`, { logout: true }) +
      `<div class="tabs">${tabs}</div>${adminBar}
       <div class="screen">${items}</div>`;
  }

  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  // 대기/승인/반려 리스트: 방문일자 + 차량번호만 표시, 클릭 시 상세
  function staffListItem(r) {
    const st = statusInfo(r.status);
    const t = state.vehicleTypes.find((x) => x.id === r.vehicleTypeId);
    return `<button class="mini-card" data-detail="${r.id}">
      <div class="mc-top"><span class="veh">${esc(r.vehicleNumber)}</span>
        <span class="status-pill ${r.status}">${st.pill}</span></div>
      <div class="meta">방문 ${esc(fmtDateTime(r.visitAt))} · ${t ? t.icon : '🚚'} ${esc(r.vehicleTypeName)}</div>
    </button>`;
  }

  // 직원용 상세: 신청정보 박스 + 필수서류 박스(사진 바로 표시)
  function staffDetail() {
    const r = state.staffDetail;
    if (!r) return staffConsole();
    const st = statusInfo(r.status);
    const docs = (r.documents || []);
    const docsHtml = docs.length ? `<div class="doc-thumbs">${docs.map((d) => {
      const isImg = (d.contentType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(d.label);
      return `<div class="doc-thumb-item">
        <div class="lbl">${esc(d.label)}</div>
        ${isImg
          ? `<img src="${esc(d.url)}" alt="${esc(d.label)}" loading="lazy" data-lightbox="${esc(d.url)}" data-label="${esc(d.label)}">`
          : `<a class="pdf" href="${esc(d.url)}" target="_blank" rel="noopener">📄 파일 열기</a>`}
      </div>`;
    }).join('')}</div>` : '<div class="muted" style="padding:0 2px">첨부 서류 없음</div>';

    return appbar('출입 신청 상세', st.pill, { back: true }) + `
      <div class="screen">
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <div class="row"><span class="k">방문일자</span><span>${esc(fmtDateTime(r.visitAt))}</span></div>
          <div class="row"><span class="k">차량번호</span><span>${esc(r.vehicleNumber)}</span></div>
          <div class="row"><span class="k">방문목적</span><span>${esc(r.vehicleTypeName)}</span></div>
          <div class="row"><span class="k">계약업체</span><span>${esc(r.company) || '-'}</span></div>
          <div class="row"><span class="k">연락처</span><span>${esc(r.phone)}</span></div>
          ${r.status === 'rejected' && r.rejectReason ? `<div class="row"><span class="k">반려사유</span><span>${esc(r.rejectReason)}</span></div>` : ''}
        </div>
        <div class="section-title">📎 필수 서류</div>
        ${docsHtml}
        ${r.status === 'pending' ? `<div class="sticky-cta"><div class="btn-row">
          <button class="btn btn-danger" data-reject="${r.id}">반려</button>
          <button class="btn btn-success" data-approve="${r.id}">승인</button>
        </div></div>` : ''}
      </div>`;
  }

  // ==== 렌더 + 이벤트 ======================================================
  function render() {
    const views = { landing, authView, driverHome, driverProfile, driverTypes,
      driverSafety: () => safetyScreen(state.safetyIndex),
      driverRoute, driverDocs, driverResult, staffConsole, staffDetail };
    app.innerHTML = (views[state.view] || landing)();
    bind();
    if (state.view === 'driverHome') loadMyRequests();
    if (state.view === 'staffConsole') startStaffPolling();
  }

  function readForm() {
    // 방문 예정 일시(visitAt)는 달력에서 직접 state.form 에 저장하므로 여기서 읽지 않음
    const el = document.getElementById('company');
    if (el) state.form.company = el.value;
  }

  function bind() {
    app.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      if (b.dataset.nav === 'driverDocs') readForm();
      go(b.dataset.nav);
    });
    app.querySelectorAll('[data-logout]').forEach((b) => b.onclick = logout);
    app.querySelectorAll('[data-histback]').forEach((b) => b.onclick = () => history.back());
    // 연락처 입력 시 자동 하이픈
    app.querySelectorAll('input[type=tel]').forEach((inp) => inp.oninput = () => { inp.value = formatPhone(inp.value); });
    // 방문 예정 일시: 탭하면 커스텀 월 달력 모달 열기
    const visitBtn = document.getElementById('visitAt');
    if (visitBtn) visitBtn.onclick = openCalendar;

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
          name: v('p_name'), phone: v('p_phone'), defaultVehicleTypeId: v('p_vtype'),
        }});
        state.user = out.user; toast('저장되었습니다.'); go('driverHome');
      } catch (e) { toast(e.message); }
    };

    // 유형 선택
    app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
      state.selectedType = state.vehicleTypes.find((t) => t.id === b.dataset.type);
      state.safetyPages = buildSafetyPages(state.selectedType);
      state.safetyAgree = {}; state.agreedRequired = true; state.agreedOther = false;
      state.files = {}; state.form = {};
      go('driverSafety', { si: 0 });
    });

    // 안전수칙 체크 + 다음 (여러 장의 필수/기타 페이지 공통)
    const chk = document.getElementById('agreeChk');
    if (chk) chk.onchange = () => {
      const idx = state.safetyIndex;
      const page = state.safetyPages[idx];
      state.safetyAgree[idx] = chk.checked;
      if (page && page.kind === 'other') state.agreedOther = chk.checked;
      const nx = document.getElementById('rulesNext');
      if (nx && page && page.kind === 'required') nx.disabled = !chk.checked;
    };
    const rulesNext = document.getElementById('rulesNext');
    if (rulesNext) rulesNext.onclick = () => {
      const idx = state.safetyIndex;
      if (idx < state.safetyPages.length - 1) go('driverSafety', { si: idx + 1 });
      else go('driverRoute');
    };

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
    app.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => {
      state.staffDetail = state.staffData.find((r) => r.id === b.dataset.detail);
      go('staffDetail');
    });
    app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => reviewReq(b.dataset.approve, 'approve'));
    app.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => reviewReq(b.dataset.reject, 'reject'));
    app.querySelectorAll('img[data-lightbox]').forEach((im) => im.onclick = () => openLightbox(im.dataset.lightbox, im.dataset.label));
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
    const u = state.user;
    // 기사명·연락처·차량번호는 회원가입 정보(프로필)에서 자동 사용
    const vnum = u.defaultVehicleNumber || u.loginId;
    const missing = state.selectedType.requiredDocuments.filter((d) => d.required && !state.files[d.key]);
    if (missing.length) return toast(`필수 서류 미첨부: ${missing[0].label}`);
    const tooBig = Object.values(state.files).find((file) => file.size > MAX_UPLOAD_BYTES);
    if (tooBig) return toast(`파일이 너무 큽니다(5MB 초과): ${tooBig.name}. 사진으로 찍어 올려주세요.`);
    const btn = document.getElementById('submitReq'); btn.disabled = true; btn.textContent = '제출 중…';
    const fd = new FormData();
    fd.append('vehicleTypeId', state.selectedType.id);
    fd.append('driverName', u.name); fd.append('phone', u.phone);
    fd.append('vehicleNumber', vnum); fd.append('company', f.company || '');
    fd.append('visitAt', f.visitAt || ''); fd.append('purpose', '');
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
      // 상세 화면에서 처리했으면 목록으로 복귀
      if (state.view === 'staffDetail') history.back();
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
    try { history.replaceState({ view: state.view }, ''); } catch { /* noop */ }
    render();
  }
  boot();
})();
