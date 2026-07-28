/* 자재센터 출입 사전승인 앱 - 프런트엔드 (빌드 불필요 SPA) */
(() => {
  const app = document.getElementById('app');
  const api = (path, opts) => fetch('/api' + path, opts).then((r) => r.json());
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 앱 상태
  const state = {
    view: 'landing',
    vehicleTypes: [],
    selectedType: null,
    step: 0,          // 기사 플로우 단계 (0~3)
    agreed: false,
    form: {},
    files: {},        // { docKey: File }
    lastRequest: null,
    staffTab: 'pending',
    staffData: [],
  };

  let staffTimer = null;
  function stopPolling() { if (staffTimer) { clearInterval(staffTimer); staffTimer = null; } }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function go(view) { stopPolling(); state.view = view; render(); window.scrollTo(0, 0); }

  // ---- 화면들 -------------------------------------------------------------

  function landing() {
    return `
      <div class="hero">
        <div class="logo">🏭</div>
        <h1>자재센터 출입 신청</h1>
        <p>출입 전 안전수칙을 확인하고 사전 승인을 받으세요.</p>
      </div>
      <div class="role-grid">
        <button class="role-btn" data-act="driver">
          <span class="emoji">🚚</span>
          <span><span class="rt">운전기사</span><br><span class="rd">안전수칙 확인 후 출입 신청</span></span>
          <span class="arrow">›</span>
        </button>
        <button class="role-btn" data-act="staff">
          <span class="emoji">🧑‍💼</span>
          <span><span class="rt">자재센터 직원</span><br><span class="rd">출입 신청 확인 및 승인</span></span>
          <span class="arrow">›</span>
        </button>
      </div>`;
  }

  function appbar(title, sub, backTo) {
    return `<div class="appbar">
      ${backTo ? `<button class="back" data-back="${backTo}">‹</button>` : ''}
      <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    </div>`;
  }

  function stepBar(n) {
    return `<div class="steps">${[0, 1, 2, 3].map((i) =>
      `<div class="dot ${i <= n ? 'done' : ''}"></div>`).join('')}</div>`;
  }

  // 1) 차량 유형 선택
  function driverTypes() {
    const cards = state.vehicleTypes.map((t) => `
      <button class="type-card" data-type="${t.id}" style="--tc:${t.color}">
        <div class="ico">${t.icon}</div>
        <div class="tn">${esc(t.name)}</div>
        <div class="ts">${esc(t.subtitle)}</div>
      </button>`).join('');
    return appbar('차량 유형 선택', '해당하는 차량을 선택하세요', 'landing') +
      `<div class="screen"><div class="type-grid">${cards}</div></div>`;
  }

  // 2) 안전수칙
  function driverRules() {
    const t = state.selectedType;
    const rules = t.safetyRules.map((r, i) =>
      `<li><span class="n">${i + 1}</span><span>${esc(r)}</span></li>`).join('');
    return appbar(t.name, '필수 안전수칙', null) + stepBar(0) + `
      <div class="screen">
        <div class="section-title">⚠️ 출입 전 반드시 확인하세요</div>
        <div class="card"><ul class="rule-list">${rules}</ul></div>
        <label class="agree">
          <input type="checkbox" id="agree" ${state.agreed ? 'checked' : ''}>
          <span>위 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.</span>
        </label>
        <div class="sticky-cta">
          <button class="btn btn-primary" id="toRoute" ${state.agreed ? '' : 'disabled'}>
            다음 · 차량동선 안내
          </button>
        </div>
      </div>`;
  }

  // 3) 차량 동선
  function driverRoute() {
    const t = state.selectedType;
    const steps = t.route.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    return appbar(t.name, '차량 동선 안내', null) + stepBar(1) + `
      <div class="screen">
        <div class="section-title">🗺️ 센터 내 이동 경로</div>
        <div class="card">
          <div class="route-summary">${esc(t.route.summary)}</div>
          <ul class="route-list">${steps}</ul>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" data-back-step="0">이전</button>
          <button class="btn btn-primary" id="toDocs">다음 · 서류 제출</button>
        </div>
      </div>`;
  }

  // 4) 서류 업로드 + 신청정보
  function driverDocs() {
    const t = state.selectedType;
    const docs = t.requiredDocuments.map((d) => {
      const has = state.files[d.key];
      return `<div class="doc-item">
        <span class="dl">${esc(d.label)}</span>
        <span class="badge ${d.required ? 'required' : 'optional'}">${d.required ? '필수' : '선택'}</span>
        <span class="up">
          <label class="file-btn ${has ? 'has' : ''}">
            ${has ? '✓ 첨부됨' : '파일 선택'}
            <input type="file" data-doc="${d.key}" accept="image/*,application/pdf">
          </label>
        </span>
      </div>`;
    }).join('');
    const f = state.form;
    return appbar(t.name, '서류 제출 및 신청', null) + stepBar(2) + `
      <div class="screen">
        <div class="section-title">📎 필요 서류</div>
        <div class="card">${docs}</div>
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <label class="field"><span class="lb">기사명 <span class="req">*</span></span>
            <input type="text" id="driverName" value="${esc(f.driverName)}" placeholder="홍길동"></label>
          <label class="field"><span class="lb">연락처 <span class="req">*</span></span>
            <input type="tel" id="phone" value="${esc(f.phone)}" placeholder="010-0000-0000"></label>
          <label class="field"><span class="lb">차량번호 <span class="req">*</span></span>
            <input type="text" id="vehicleNumber" value="${esc(f.vehicleNumber)}" placeholder="12가 3456"></label>
          <label class="field"><span class="lb">소속 업체</span>
            <input type="text" id="company" value="${esc(f.company)}" placeholder="OO물류"></label>
          <label class="field"><span class="lb">방문 예정 일시</span>
            <input type="datetime-local" id="visitAt" value="${esc(f.visitAt)}"></label>
          <label class="field"><span class="lb">방문/작업 목적</span>
            <textarea id="purpose" placeholder="예: 철근 자재 납품">${esc(f.purpose)}</textarea></label>
        </div>
        <div class="sticky-cta">
          <div class="btn-row">
            <button class="btn btn-ghost" data-back-step="1">이전</button>
            <button class="btn btn-primary" id="submitReq">출입 신청 제출</button>
          </div>
        </div>
      </div>`;
  }

  // 완료 / 상태 조회
  function driverResult() {
    const r = state.lastRequest;
    const st = statusInfo(r.status);
    return appbar('신청 완료', null, null) + `
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
        </div>
        <button class="btn btn-ghost" id="refreshStatus">🔄 승인 상태 새로고침</button>
        <div style="height:10px"></div>
        <button class="btn btn-ghost" data-back="landing">처음으로</button>
      </div>`;
  }

  function statusInfo(s) {
    if (s === 'approved') return { icon: '✅', title: '출입이 승인되었습니다', pill: '승인 완료' };
    if (s === 'rejected') return { icon: '⛔', title: '출입이 반려되었습니다', pill: '반려' };
    return { icon: '📨', title: '신청이 접수되었습니다', pill: '승인 대기 중' };
  }

  // 직원 화면
  function staff() {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    state.staffData.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const list = state.staffData.filter((r) => r.status === state.staffTab);
    const tab = (id, label) => `<button class="tab ${state.staffTab === id ? 'active' : ''}" data-tab="${id}">
      ${label} <span class="cnt">${counts[id] || 0}</span></button>`;

    const cards = list.length ? list.map((r) => renderReqCard(r)).join('')
      : `<div class="empty">${state.staffTab === 'pending' ? '대기 중인 신청이 없습니다.' : '항목이 없습니다.'}</div>`;

    return appbar('출입 신청 관리', '자재센터 직원', 'landing') +
      `<div class="tabs">${tab('pending', '대기')}${tab('approved', '승인')}${tab('rejected', '반려')}</div>
       <div class="screen">${cards}</div>`;
  }

  function renderReqCard(r) {
    const t = state.vehicleTypes.find((x) => x.id === r.vehicleTypeId);
    const st = statusInfo(r.status);
    const docs = (r.documents || []).map((d) =>
      `<a href="${esc(d.url)}" target="_blank" rel="noopener">📄 ${esc(d.label)}</a>`).join('') ||
      '<span class="meta">첨부 서류 없음</span>';
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
      <div class="row"><span class="k">안전수칙</span><span>${r.agreedRules ? '✅ 동의' : '미동의'}</span></div>
      <div class="docs">${docs}</div>
      ${r.status === 'rejected' && r.rejectReason ? `<div class="meta">반려 사유: ${esc(r.rejectReason)}</div>` : ''}
      ${r.status === 'pending' ? `<div class="btn-row" style="margin-top:8px">
        <button class="btn btn-danger" data-reject="${r.id}">반려</button>
        <button class="btn btn-success" data-approve="${r.id}">승인</button>
      </div>` : ''}
    </div>`;
  }

  // ---- 렌더 + 이벤트 ------------------------------------------------------

  function render() {
    const views = {
      landing, driverTypes, driverRules, driverRoute, driverDocs, driverResult, staff,
    };
    app.innerHTML = (views[state.view] || landing)();
    bind();
    if (state.view === 'staff') startStaffPolling();
  }

  function readForm() {
    ['driverName', 'phone', 'vehicleNumber', 'company', 'visitAt', 'purpose'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) state.form[id] = el.value;
    });
  }

  function bind() {
    // 랜딩 역할 선택
    app.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
      if (b.dataset.act === 'driver') go('driverTypes');
      else { state.staffTab = 'pending'; go('staff'); }
    });
    // 뒤로가기 (특정 뷰로)
    app.querySelectorAll('[data-back]').forEach((b) => b.onclick = () => go(b.dataset.back));

    // 유형 선택
    app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
      state.selectedType = state.vehicleTypes.find((t) => t.id === b.dataset.type);
      state.agreed = false; state.step = 0; state.files = {};
      go('driverRules');
    });

    // 안전수칙 동의
    const agree = document.getElementById('agree');
    if (agree) agree.onchange = () => {
      state.agreed = agree.checked;
      const btn = document.getElementById('toRoute');
      if (btn) btn.disabled = !state.agreed;
    };
    const toRoute = document.getElementById('toRoute');
    if (toRoute) toRoute.onclick = () => go('driverRoute');

    // 동선 → 서류
    const toDocs = document.getElementById('toDocs');
    if (toDocs) toDocs.onclick = () => go('driverDocs');

    // 단계 뒤로 (기사 플로우 내)
    app.querySelectorAll('[data-back-step]').forEach((b) => b.onclick = () => {
      readForm();
      const map = { 0: 'driverRules', 1: 'driverRoute' };
      go(map[b.dataset.backStep]);
    });

    // 파일 선택
    app.querySelectorAll('input[type=file][data-doc]').forEach((inp) => inp.onchange = () => {
      const key = inp.dataset.doc;
      if (inp.files[0]) state.files[key] = inp.files[0];
      else delete state.files[key];
      readForm();
      render();
    });

    // 제출
    const submit = document.getElementById('submitReq');
    if (submit) submit.onclick = submitRequest;

    // 상태 새로고침
    const refresh = document.getElementById('refreshStatus');
    if (refresh) refresh.onclick = refreshStatus;

    // 직원 탭
    app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
      state.staffTab = b.dataset.tab; render();
    });
    // 승인 / 반려
    app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => review(b.dataset.approve, 'approve'));
    app.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => review(b.dataset.reject, 'reject'));
  }

  async function submitRequest() {
    readForm();
    const f = state.form;
    if (!f.driverName || !f.phone || !f.vehicleNumber) {
      return toast('기사명·연락처·차량번호를 입력하세요.');
    }
    // 필수 서류 확인
    const missing = state.selectedType.requiredDocuments
      .filter((d) => d.required && !state.files[d.key]);
    if (missing.length) return toast(`필수 서류 미첨부: ${missing[0].label}`);

    const btn = document.getElementById('submitReq');
    btn.disabled = true; btn.textContent = '제출 중…';

    const fd = new FormData();
    fd.append('vehicleTypeId', state.selectedType.id);
    fd.append('driverName', f.driverName);
    fd.append('phone', f.phone);
    fd.append('vehicleNumber', f.vehicleNumber);
    fd.append('company', f.company || '');
    fd.append('visitAt', f.visitAt || '');
    fd.append('purpose', f.purpose || '');
    fd.append('agreedRules', 'true');
    Object.values(state.files).forEach((file) => fd.append('documents', file));

    try {
      const res = await fetch('/api/requests', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '제출 실패');
      state.lastRequest = data;
      state.form = {};
      go('driverResult');
    } catch (e) {
      toast(e.message);
      btn.disabled = false; btn.textContent = '출입 신청 제출';
    }
  }

  async function refreshStatus() {
    if (!state.lastRequest) return;
    const data = await api('/requests/' + state.lastRequest.id);
    if (data && data.id) {
      state.lastRequest = data;
      render();
      toast(data.status === 'pending' ? '아직 승인 대기 중입니다.' : '상태가 갱신되었습니다.');
    }
  }

  async function review(id, action) {
    let body = {};
    if (action === 'reject') {
      const reason = prompt('반려 사유를 입력하세요 (선택):') || '';
      body = { reason };
    }
    await fetch(`/api/requests/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    toast(action === 'approve' ? '승인되었습니다.' : '반려되었습니다.');
    await loadStaff();
  }

  async function loadStaff() {
    state.staffData = await api('/requests');
    if (state.view === 'staff') render();
  }

  function startStaffPolling() {
    stopPolling();
    loadStaff();
    staffTimer = setInterval(loadStaff, 5000); // 신규 신청 실시간 반영
  }

  // ---- 부팅 ---------------------------------------------------------------
  async function boot() {
    try {
      state.vehicleTypes = await api('/vehicle-types');
    } catch {
      app.innerHTML = '<div class="empty">서버에 연결할 수 없습니다.</div>';
      return;
    }
    render();
  }
  boot();
})();
