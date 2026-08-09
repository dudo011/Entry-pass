(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_company_token';
  const DRIVER_PARAM = 'driverAccess';
  const state = {
    active: false,
    view: 'login',
    token: localStorage.getItem(TOKEN_KEY) || '',
    account: null,
    vehicles: [],
    requests: [],
    vehicleTypes: [],
    editingVehicleId: '',
    requestFiles: {},
    loginChecked: '',
    businessChecked: '',
    staffRequestId: '',
    currentRequestId: '',
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>\"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
  const fmtPhone = (value) => {
    const d = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };
  const fmtBusiness = (value) => {
    const d = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  };
  const fmtDate = (value) => {
    const s = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '-';
    const d = new Date(`${s}T00:00:00`);
    const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${w})`;
  };
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const style = document.createElement('style');
  style.textContent = `
    #app.company-flow-active{min-height:100dvh;background:#f8fafc;color:#0f172a}
    .cf-appbar{position:sticky;top:0;z-index:50;min-height:68px;box-sizing:border-box;padding:14px 16px;background:#0f172a;color:#fff;display:flex;align-items:center;gap:10px}
    .cf-appbar h1{margin:0;font-size:23px;letter-spacing:-.6px}.cf-appbar small{display:block;color:#cbd5e1;margin-top:2px}
    .cf-appbar .cf-spacer{flex:1}.cf-head-btn{border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:10px;min-width:42px;height:42px;padding:0 12px;font-weight:800;font-size:15px}
    .cf-screen{max-width:680px;margin:0 auto;padding:18px 16px calc(28px + env(safe-area-inset-bottom))}
    .cf-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:16px;margin-bottom:14px;box-shadow:0 4px 14px rgba(15,23,42,.05)}
    .cf-title{font-size:19px;font-weight:900;margin:6px 0 12px;letter-spacing:-.4px}
    .cf-field{display:block;margin:0 0 13px}.cf-field>span{display:block;font-size:14px;font-weight:800;margin-bottom:6px;color:#334155}
    .cf-field input,.cf-field select{width:100%;height:48px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:0 13px;background:#fff;color:#0f172a;font-size:16px}
    .cf-inline{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.cf-inline .cf-field{margin:0}
    .cf-check{height:48px;border:1px solid #94a3b8;border-radius:12px;background:#fff;padding:0 13px;font-weight:800;color:#334155}
    .cf-msg{min-height:20px;margin:5px 2px 0;font-size:13px;font-weight:700}.cf-msg.ok{color:#15803d}.cf-msg.err{color:#dc2626}
    .cf-btn{width:100%;min-height:50px;border:0;border-radius:13px;font-size:17px;font-weight:900;padding:10px 14px;cursor:pointer}
    .cf-primary{background:#2563eb;color:#fff}.cf-secondary{background:#e2e8f0;color:#0f172a}.cf-danger{background:#fee2e2;color:#b91c1c}.cf-success{background:#16a34a;color:#fff}
    .cf-btn:disabled{opacity:.5}.cf-row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}.cf-switch{text-align:center;margin:16px 0 4px;color:#64748b}
    .cf-link{border:0;background:none;color:#2563eb;font-weight:900;font-size:inherit;padding:3px}.cf-hero{padding:8px 2px 18px}.cf-hero strong{display:block;font-size:25px}.cf-hero span{display:block;color:#64748b;margin-top:5px}
    .cf-menu{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.cf-menu .cf-btn{min-height:86px;font-size:16px}
    .cf-item{width:100%;text-align:left;border:1px solid #e2e8f0;border-radius:15px;background:#fff;padding:14px;margin-bottom:10px}.cf-item-top{display:flex;gap:8px;align-items:center}.cf-item-top strong{font-size:18px}.cf-item-top .cf-stage{margin-left:auto}
    .cf-meta{margin-top:6px;color:#64748b;font-size:14px;line-height:1.45}.cf-stage{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#e2e8f0;font-size:12px;font-weight:900}
    .cf-stage.pending{background:#fef3c7;color:#92400e}.cf-stage.safety_pending{background:#dbeafe;color:#1d4ed8}.cf-stage.photo_pending{background:#ede9fe;color:#6d28d9}.cf-stage.completed{background:#dcfce7;color:#166534}.cf-stage.rejected{background:#fee2e2;color:#b91c1c}
    .cf-vehicle-actions{display:flex;gap:8px;margin-top:10px}.cf-small{width:auto;min-height:38px;font-size:14px;padding:6px 11px}.cf-mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px}
    .cf-mode label{border:1px solid #cbd5e1;border-radius:12px;padding:12px;display:flex;gap:8px;align-items:center;background:#fff;font-weight:800}
    .cf-doc{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border-bottom:1px solid #e2e8f0;padding:11px 0}.cf-doc:last-child{border-bottom:0}.cf-doc .dl{font-weight:850}.cf-doc-note{font-size:12px;color:#64748b;margin-top:3px}
    .cf-file-label{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:10px;background:#e2e8f0;padding:0 11px;font-weight:800;cursor:pointer}.cf-file-label input{display:none}.cf-file-label.has{background:#dcfce7;color:#166534}
    .cf-form-btn{margin-top:5px;border:0;background:none;color:#2563eb;font-weight:800;padding:0;cursor:pointer}.cf-toast{position:fixed;left:50%;bottom:calc(25px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:120000;max-width:calc(100vw - 32px);padding:12px 16px;border-radius:12px;background:#0f172a;color:#fff;font-weight:800;text-align:center}
    .cf-driver{min-height:100dvh;background:#f8fafc}.cf-driver .cf-screen{max-width:720px}.cf-rules{padding-left:0;list-style:none;margin:0}.cf-rules li{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #e2e8f0;line-height:1.45}.cf-rules li:last-child{border-bottom:0}
    .cf-num{flex:0 0 28px;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#dbeafe;color:#1d4ed8;font-weight:900}.cf-route-img{width:100%;height:auto;border-radius:12px;border:1px solid #e2e8f0;background:#fff}.cf-route-steps{padding-left:22px;line-height:1.65}
    .cf-agree{display:flex;gap:10px;align-items:flex-start;font-weight:800;line-height:1.45;margin:14px 0}.cf-agree input{width:22px;height:22px;margin-top:1px}.cf-photo input[type=file]{width:100%;padding:11px;border:1px dashed #94a3b8;border-radius:12px;background:#fff}
    .cf-admin-companies{position:fixed;inset:0;z-index:95000;background:#f8fafc;overflow:auto}.cf-admin-company{display:flex;gap:10px;align-items:center;padding:14px;border-bottom:1px solid #e2e8f0;background:#fff}.cf-admin-company-info{flex:1;min-width:0;border:0;background:none;text-align:left;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer}.cf-admin-company strong{display:block;font-size:16px}.cf-admin-company-info>div{margin-top:5px;color:#64748b;font-size:14px;line-height:1.45}.cf-admin-company-del{flex:0 0 auto;width:auto}
    .cf-reset-box{margin-top:12px;padding:12px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#78350f;font-size:15px;line-height:1.6;word-break:break-all}.cf-reset-box b{font-size:18px;color:#0f172a}
    .cf-staff-workflow{margin-top:14px}.cf-share-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.cf-annot{position:fixed;inset:0;z-index:100000;background:#cbd5e1;display:flex;flex-direction:column}
    .cf-annot-head{height:68px;background:#0f172a;color:#fff;display:flex;align-items:center;gap:8px;padding:10px}.cf-annot-head strong{flex:1;text-align:center}.cf-annot-head button{height:44px;border:0;border-radius:10px;padding:0 13px;font-weight:900}
    .cf-annot-stage{position:relative;flex:1;overflow:auto;background:#94a3b8;padding:8px;touch-action:none}.cf-annot-wrap{position:relative;margin:0 auto;background:#fff;width:min(100%,900px)}.cf-annot-wrap img{display:block;width:100%;height:auto}.cf-annot-wrap canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
    .cf-annot-tools{display:flex;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:#fff}.cf-annot-tools button{flex:1;height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800}
    @media(max-width:390px){.cf-screen{padding-left:12px;padding-right:12px}.cf-appbar h1{font-size:21px}}
  `;
  document.head.append(style);

  function toast(message) {
    document.querySelectorAll('.cf-toast').forEach((n) => n.remove());
    const node = document.createElement('div');
    node.className = 'cf-toast'; node.textContent = message; document.body.append(node);
    setTimeout(() => node.remove(), 2600);
  }

  async function api(path, { method = 'GET', body, form = false, companyAuth = true } = {}) {
    const headers = {};
    if (companyAuth && state.token) headers.Authorization = `Bearer ${state.token}`;
    if (!form && body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { method, headers, body: form ? body : body !== undefined ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await response.json(); } catch { /* noop */ }
    if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
    return data;
  }

  function head(title, sub = '', back = false) {
    return `<header class="cf-appbar">${back ? '<button class="cf-head-btn" data-cf-back>‹</button>' : ''}<div><h1>${esc(title)}</h1>${sub ? `<small>${esc(sub)}</small>` : ''}</div><div class="cf-spacer"></div>${state.account ? '<button class="cf-head-btn" data-cf-logout>로그아웃</button>' : ''}</header>`;
  }

  function workflowLabel(value) {
    return ({ pending: '승인 대기', safety_pending: '안전수칙 확인 대기', photo_pending: '현장사진 업로드 대기', completed: '최종 완료', rejected: '반려' })[value] || '승인 대기';
  }

  function setView(view, push = true) {
    state.active = true; state.view = view;
    if (push) history.pushState({ companyFlow: view }, '');
    render();
  }

  function loginView() {
    return head('계약업체', '업체 공동계정 로그인', true) + `<main class="cf-screen"><div class="cf-card"><label class="cf-field"><span>로그인 아이디</span><input id="cf_login_id" autocomplete="username"></label><label class="cf-field"><span>비밀번호</span><input id="cf_login_pw" type="password" autocomplete="current-password"></label><button class="cf-btn cf-primary" id="cf_login">로그인</button></div><div class="cf-switch">처음 이용하시나요? <button class="cf-link" data-cf-view="register">회원가입</button></div></main>`;
  }

  function registerView() {
    return head('업체 회원가입', '승인 없이 가입 즉시 이용할 수 있습니다', true) + `<main class="cf-screen"><div class="cf-card">
      <label class="cf-field"><span>업체명</span><input id="cf_reg_company"></label>
      <div class="cf-inline"><label class="cf-field"><span>사업자등록번호</span><input id="cf_reg_business" inputmode="numeric" placeholder="123-45-67890"></label><button class="cf-check" id="cf_check_business">중복확인</button></div><div class="cf-msg" id="cf_business_msg"></div>
      <div class="cf-inline" style="margin-top:10px"><label class="cf-field"><span>로그인 아이디</span><input id="cf_reg_login" autocomplete="username"></label><button class="cf-check" id="cf_check_login">중복확인</button></div><div class="cf-msg" id="cf_login_msg"></div>
      <label class="cf-field" style="margin-top:10px"><span>비밀번호</span><input id="cf_reg_pw" type="password" autocomplete="new-password" placeholder="최소 4자리"></label><label class="cf-field"><span>비밀번호 확인</span><input id="cf_reg_pw2" type="password" autocomplete="new-password"></label>
      <label class="cf-field"><span>담당자명</span><input id="cf_reg_name"></label><label class="cf-field"><span>담당자 연락처</span><input id="cf_reg_phone" type="tel" placeholder="010-0000-0000"></label><button class="cf-btn cf-primary" id="cf_register">회원가입</button>
      </div><div class="cf-switch">이미 계정이 있으신가요? <button class="cf-link" data-cf-view="login">로그인</button></div></main>`;
  }

  function requestCard(r) {
    const w = r.workflowStatus || r.status;
    return `<button class="cf-item" data-cf-request="${esc(r.id)}"><div class="cf-item-top"><strong>${esc(r.vehicleNumber)}</strong><span class="cf-stage ${esc(w)}">${workflowLabel(w)}</span></div><div class="cf-meta">${esc(r.passNo)} · ${fmtDate(r.visitAt)} · ${esc(r.driverName)}<br>${esc(r.vehicleTypeName)}</div></button>`;
  }

  function homeView() {
    return head(state.account?.companyName || '계약업체', state.account?.contactName ? `${state.account.contactName} 담당자` : '', false) + `<main class="cf-screen"><div class="cf-hero"><strong>출입 신청 관리</strong><span>소속 차량을 등록하고 출입신청과 작업서류를 관리합니다.</span></div><div class="cf-menu"><button class="cf-btn cf-primary" data-cf-view="request">＋ 새 출입 신청</button><button class="cf-btn cf-secondary" data-cf-view="vehicles">🚚 소속 차량 관리</button></div><button class="cf-btn cf-secondary" data-cf-view="profile" style="margin-bottom:18px">✏️ 회원정보 수정</button><div class="cf-title">신청 내역</div><div id="cf_request_list">${state.requests.length ? state.requests.map(requestCard).join('') : '<div class="cf-card" style="color:#64748b;text-align:center">아직 신청 내역이 없습니다.</div>'}</div></main>`;
  }

  function typeOptions(selected = '') {
    return state.vehicleTypes.map((t) => `<option value="${esc(t.id)}" ${selected === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  }

  function vehiclesView() {
    const edit = state.vehicles.find((v) => v.id === state.editingVehicleId);
    return head('소속 차량 관리', `${state.vehicles.length}대 등록`, true) + `<main class="cf-screen"><div class="cf-card"><div class="cf-title">${edit ? '차량정보 수정' : '차량 등록'}</div>
      <label class="cf-field"><span>차량번호</span><input id="cf_v_number" value="${esc(edit?.vehicleNumber || '')}"></label><label class="cf-field"><span>기본 운전자</span><input id="cf_v_driver" value="${esc(edit?.driverName || '')}"></label><label class="cf-field"><span>기본 운전자 연락처</span><input id="cf_v_phone" type="tel" value="${esc(edit?.driverPhone || '')}"></label><label class="cf-field"><span>기본 차량 유형</span><select id="cf_v_type"><option value="">선택 안 함</option>${typeOptions(edit?.defaultVehicleTypeId || '')}</select></label>
      <div class="cf-row2">${edit ? '<button class="cf-btn cf-secondary" id="cf_v_cancel">취소</button>' : '<span></span>'}<button class="cf-btn cf-primary" id="cf_v_save">${edit ? '수정 저장' : '차량 등록'}</button></div></div><div class="cf-title">등록 차량</div>
      ${state.vehicles.length ? state.vehicles.map((v) => `<div class="cf-item"><div class="cf-item-top"><strong>${esc(v.vehicleNumber)}</strong></div><div class="cf-meta">기본 운전자 ${esc(v.driverName)} · ${esc(v.driverPhone)}${v.defaultVehicleTypeId ? `<br>${esc(state.vehicleTypes.find((t) => t.id === v.defaultVehicleTypeId)?.name || '')}` : ''}</div><div class="cf-vehicle-actions"><button class="cf-btn cf-secondary cf-small" data-cf-edit-vehicle="${esc(v.id)}">수정</button><button class="cf-btn cf-danger cf-small" data-cf-delete-vehicle="${esc(v.id)}">삭제</button></div></div>`).join('') : '<div class="cf-card" style="color:#64748b">등록된 차량이 없습니다.</div>'}</main>`;
  }

  function requiredDocs(typeId) {
    const type = state.vehicleTypes.find((t) => t.id === typeId);
    return (type?.requiredDocuments || []).filter((d) => d.key !== 'sitePhoto');
  }

  function docsHtml(typeId) {
    const docs = requiredDocs(typeId);
    if (!docs.length) return '<div style="color:#64748b">사전 제출서류가 없는 차량 유형입니다.</div>';
    return docs.map((d) => {
      const file = state.requestFiles[d.key];
      const ownAnnot = d.key !== 'workPlan' && d.formImage;
      return `<div class="cf-doc doc-item"><div class="dl-wrap"><div class="dl">${esc(d.label)}</div>${d.required ? '<div class="cf-doc-note">필수</div>' : ''}${ownAnnot ? `<button type="button" class="cf-form-btn" data-cf-annot="${esc(d.key)}">양식 작성</button>` : ''}${d.formUrl && !ownAnnot ? `<a class="cf-form-btn" href="${esc(d.formUrl)}" target="_blank" rel="noopener">양식 보기</a>` : ''}</div><label class="cf-file-label ${file ? 'has' : ''}">${file ? '첨부 완료' : '파일 선택'}<input type="file" data-doc="${esc(d.key)}" accept="image/jpeg,image/png,application/pdf"></label></div>`;
    }).join('');
  }

  function requestView() {
    const firstType = state.vehicleTypes[0]?.id || '';
    return head('새 출입 신청', '업체 담당자가 신청하고 작업서류를 제출합니다', true) + `<main class="cf-screen"><div class="cf-card">
      <label class="cf-field"><span>출입일자</span><input type="date" id="cf_r_date" min="${today()}" value="${today()}"></label><label class="cf-field"><span>차량 유형</span><select id="cf_r_type">${typeOptions(firstType)}</select></label>
      <div class="cf-title" style="font-size:16px">차량 선택</div><div class="cf-mode"><label><input type="radio" name="cf_vehicle_mode" value="registered" ${state.vehicles.length ? 'checked' : ''}> 등록 차량</label><label><input type="radio" name="cf_vehicle_mode" value="temporary" ${state.vehicles.length ? '' : 'checked'}> 용차·일회성</label></div>
      <div id="cf_registered_box" ${state.vehicles.length ? '' : 'hidden'}><label class="cf-field"><span>등록 차량</span><select id="cf_r_vehicle"><option value="">차량 선택</option>${state.vehicles.map((v) => `<option value="${esc(v.id)}">${esc(v.vehicleNumber)} · ${esc(v.driverName)}</option>`).join('')}</select></label></div>
      <div id="cf_temp_box" ${state.vehicles.length ? 'hidden' : ''}><label class="cf-field"><span>용차 차량번호</span><input id="cf_r_vehicle_number"></label></div><label class="cf-field"><span>실제 운전자</span><input id="cf_r_driver" placeholder="등록 차량 선택 시 기본값 자동 입력"></label><label class="cf-field"><span>실제 운전자 연락처</span><input id="cf_r_phone" type="tel" placeholder="010-0000-0000"></label></div>
      <div class="cf-title">사전 제출서류</div><div class="cf-card" id="cf_docs">${docsHtml(firstType)}</div><button class="cf-btn cf-primary" id="cf_submit_request">출입 신청 제출</button></main>`;
  }

  function profileView() {
    const a = state.account || {};
    return head('회원정보 수정', '', true) + `<main class="cf-screen"><div class="cf-card">
      <label class="cf-field"><span>상호(업체명)</span><input id="cf_p_company" value="${esc(a.companyName || '')}"></label>
      <label class="cf-field"><span>담당자명</span><input id="cf_p_name" value="${esc(a.contactName || '')}"></label>
      <label class="cf-field"><span>담당자 연락처</span><input id="cf_p_phone" type="tel" value="${esc(a.phone || '')}"></label>
      <div class="cf-meta" style="margin:2px 2px 14px">로그인 아이디(${esc(a.loginId || '')})와 사업자등록번호는 변경할 수 없습니다. 비밀번호를 잊으신 경우 자재센터 관리자에게 초기화를 요청해 주세요.</div>
      <button class="cf-btn cf-primary" id="cf_p_save">저장</button></div></main>`;
  }

  function detailView() {
    const r = state.requests.find((x) => x.id === state.currentRequestId);
    if (!r) return homeView();
    const w = r.workflowStatus || r.status;
    return head('신청 상세', workflowLabel(w), true) + `<main class="cf-screen"><div class="cf-card"><div class="cf-item-top"><strong>${esc(r.vehicleNumber)}</strong><span class="cf-stage ${esc(w)}">${workflowLabel(w)}</span></div><div class="cf-meta" style="margin-top:12px;line-height:1.8">승인번호 ${esc(r.passNo)}<br>출입일자 ${fmtDate(r.visitAt)}<br>차량유형 ${esc(r.vehicleTypeName)}<br>운전자 ${esc(r.driverName)} · ${esc(r.phone)}${r.temporaryVehicle ? '<br>용차·일회성 차량' : ''}${r.rejectReason ? `<br><b style="color:#b91c1c">반려사유 ${esc(r.rejectReason)}</b>` : ''}</div></div>${r.status === 'pending' ? '<button class="cf-btn cf-danger" id="cf_cancel_request">승인 전 신청 취소</button>' : ''}</main>`;
  }

  async function refreshHomeData() {
    const [vehicles, requests, types] = await Promise.all([api('/api/company/vehicles'), api('/api/company/requests'), state.vehicleTypes.length ? Promise.resolve(state.vehicleTypes) : api('/api/vehicle-types', { companyAuth: false })]);
    state.vehicles = vehicles; state.requests = requests; state.vehicleTypes = types;
  }

  function render() {
    if (!state.active) return;
    app.classList.add('company-flow-active');
    const views = { login: loginView, register: registerView, home: homeView, vehicles: vehiclesView, request: requestView, detail: detailView, profile: profileView };
    app.innerHTML = (views[state.view] || loginView)();
    bindCompany();
  }

  function formValue(id) { return document.getElementById(id)?.value || ''; }

  function bindCompany() {
    app.querySelectorAll('[data-cf-view]').forEach((b) => b.onclick = async () => {
      const view = b.dataset.cfView;
      if (view === 'vehicles' || view === 'request' || view === 'home') { try { await refreshHomeData(); } catch (e) { toast(e.message); } }
      if (view === 'request') state.requestFiles = {};
      setView(view);
    });
    app.querySelectorAll('[data-cf-back]').forEach((b) => b.onclick = () => history.back());
    app.querySelectorAll('[data-cf-logout]').forEach((b) => b.onclick = async () => { try { await api('/api/company/logout', { method: 'POST' }); } catch { /* noop */ } localStorage.removeItem(TOKEN_KEY); state.token = ''; state.account = null; state.active = false; location.href = '/'; });
    app.querySelectorAll('input[type=tel]').forEach((i) => i.oninput = () => { i.value = fmtPhone(i.value); });

    const biz = document.getElementById('cf_reg_business');
    if (biz) biz.oninput = () => { biz.value = fmtBusiness(biz.value); state.businessChecked = ''; document.getElementById('cf_business_msg').textContent = ''; };
    const log = document.getElementById('cf_reg_login');
    if (log) log.oninput = () => { state.loginChecked = ''; document.getElementById('cf_login_msg').textContent = ''; };

    document.getElementById('cf_check_login')?.addEventListener('click', async () => {
      const loginId = formValue('cf_reg_login').trim(); const msg = document.getElementById('cf_login_msg');
      if (!loginId) return toast('로그인 아이디를 입력해 주세요.');
      try { const out = await api(`/api/company/check-login?loginId=${encodeURIComponent(loginId)}`, { companyAuth: false }); msg.className = `cf-msg ${out.available ? 'ok' : 'err'}`; msg.textContent = out.available ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'; state.loginChecked = out.available ? loginId : ''; }
      catch (e) { msg.className = 'cf-msg err'; msg.textContent = e.message; }
    });
    document.getElementById('cf_check_business')?.addEventListener('click', async () => {
      const value = formValue('cf_reg_business'); const msg = document.getElementById('cf_business_msg');
      try { const out = await api(`/api/company/check-business?businessNo=${encodeURIComponent(value)}`, { companyAuth: false }); msg.className = `cf-msg ${out.available ? 'ok' : 'err'}`; msg.textContent = out.available ? '등록 가능한 사업자등록번호입니다.' : '이미 가입된 사업자등록번호입니다.'; state.businessChecked = out.available ? value.replace(/\D/g, '') : ''; }
      catch (e) { msg.className = 'cf-msg err'; msg.textContent = e.message; state.businessChecked = ''; }
    });

    document.getElementById('cf_register')?.addEventListener('click', async () => {
      const companyName = formValue('cf_reg_company').trim(), businessNo = formValue('cf_reg_business'), loginId = formValue('cf_reg_login').trim(), password = formValue('cf_reg_pw'), password2 = formValue('cf_reg_pw2'), contactName = formValue('cf_reg_name').trim(), phone = formValue('cf_reg_phone').trim();
      if (!companyName || !businessNo || !loginId || !password || !contactName || !phone) return toast('모든 항목을 입력해 주세요.');
      if (state.loginChecked !== loginId) return toast('로그인 아이디 중복확인을 해주세요.');
      if (state.businessChecked !== businessNo.replace(/\D/g, '')) return toast('사업자등록번호 중복확인을 해주세요.');
      if (password.length < 4) return toast('비밀번호는 최소 4자리로 입력해 주세요.');
      if (password !== password2) return toast('비밀번호가 일치하지 않습니다.');
      try { const out = await api('/api/company/register', { method: 'POST', body: { companyName, businessNo, loginId, password, contactName, phone }, companyAuth: false }); state.token = out.token; state.account = out.account; localStorage.setItem(TOKEN_KEY, out.token); await refreshHomeData(); history.replaceState({ companyFlow: 'home' }, ''); setView('home', false); }
      catch (e) { toast(e.message); }
    });

    document.getElementById('cf_login')?.addEventListener('click', async () => {
      const loginId = formValue('cf_login_id').trim(), password = formValue('cf_login_pw');
      if (!loginId || !password) return toast('아이디와 비밀번호를 입력해 주세요.');
      try { const out = await api('/api/company/login', { method: 'POST', body: { loginId, password }, companyAuth: false }); state.token = out.token; state.account = out.account; localStorage.setItem(TOKEN_KEY, out.token); await refreshHomeData(); history.replaceState({ companyFlow: 'home' }, ''); setView('home', false); }
      catch (e) { toast(e.message); }
    });

    document.getElementById('cf_v_save')?.addEventListener('click', async () => {
      const body = { vehicleNumber: formValue('cf_v_number'), driverName: formValue('cf_v_driver'), driverPhone: formValue('cf_v_phone'), defaultVehicleTypeId: formValue('cf_v_type') };
      try { if (state.editingVehicleId) await api(`/api/company/vehicles/${encodeURIComponent(state.editingVehicleId)}`, { method: 'PUT', body }); else await api('/api/company/vehicles', { method: 'POST', body }); state.editingVehicleId = ''; await refreshHomeData(); render(); toast('차량정보를 저장했습니다.'); }
      catch (e) { toast(e.message); }
    });
    document.getElementById('cf_v_cancel')?.addEventListener('click', () => { state.editingVehicleId = ''; render(); });
    app.querySelectorAll('[data-cf-edit-vehicle]').forEach((b) => b.onclick = () => { state.editingVehicleId = b.dataset.cfEditVehicle; render(); window.scrollTo(0, 0); });
    app.querySelectorAll('[data-cf-delete-vehicle]').forEach((b) => b.onclick = async () => { if (!confirm('이 차량을 소속 차량 목록에서 삭제할까요? 기존 출입기록은 유지됩니다.')) return; try { await api(`/api/company/vehicles/${encodeURIComponent(b.dataset.cfDeleteVehicle)}`, { method: 'DELETE' }); await refreshHomeData(); render(); } catch (e) { toast(e.message); } });

    document.getElementById('cf_p_save')?.addEventListener('click', async () => {
      const companyName = formValue('cf_p_company').trim(), contactName = formValue('cf_p_name').trim(), phone = formValue('cf_p_phone').trim();
      if (!companyName) return toast('상호(업체명)를 입력해 주세요.');
      if (!phone) return toast('담당자 연락처를 입력해 주세요.');
      try { const out = await api('/api/company/me', { method: 'PUT', body: { companyName, contactName, phone } }); state.account = out.account; toast('회원정보를 저장했습니다.'); history.back(); }
      catch (e) { toast(e.message); }
    });

    app.querySelectorAll('[data-cf-request]').forEach((b) => b.onclick = () => { state.currentRequestId = b.dataset.cfRequest; setView('detail'); });
    document.getElementById('cf_cancel_request')?.addEventListener('click', async () => { if (!confirm('승인 대기 중인 신청을 취소할까요?')) return; try { await api(`/api/company/requests/${encodeURIComponent(state.currentRequestId)}`, { method: 'DELETE' }); await refreshHomeData(); setView('home'); } catch (e) { toast(e.message); } });

    const typeSelect = document.getElementById('cf_r_type');
    if (typeSelect) typeSelect.onchange = () => { state.requestFiles = {}; const docs = document.getElementById('cf_docs'); if (docs) docs.innerHTML = docsHtml(typeSelect.value); bindRequestDynamic(); };
    document.querySelectorAll('input[name=cf_vehicle_mode]').forEach((r) => r.onchange = toggleVehicleMode);
    document.getElementById('cf_r_vehicle')?.addEventListener('change', fillVehicleDefaults);
    bindRequestDynamic();
    document.getElementById('cf_submit_request')?.addEventListener('click', submitCompanyRequest);
  }

  function bindRequestDynamic() {
    app.querySelectorAll('#cf_docs input[type=file][data-doc]').forEach((input) => {
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) state.requestFiles[input.dataset.doc] = file; else delete state.requestFiles[input.dataset.doc];
        const label = input.closest('.cf-file-label');
        if (label) { label.classList.toggle('has', !!file); label.childNodes[0].textContent = file ? '첨부 완료' : '파일 선택'; }
      };
    });
    app.querySelectorAll('[data-cf-annot]').forEach((b) => b.onclick = () => {
      const type = state.vehicleTypes.find((t) => t.id === formValue('cf_r_type'));
      const doc = (type?.requiredDocuments || []).find((d) => d.key === b.dataset.cfAnnot);
      if (doc?.formImage) openSimpleAnnotator(doc);
    });
  }

  function toggleVehicleMode() {
    const mode = document.querySelector('input[name=cf_vehicle_mode]:checked')?.value || 'registered';
    const reg = document.getElementById('cf_registered_box'), temp = document.getElementById('cf_temp_box');
    if (reg) reg.hidden = mode !== 'registered'; if (temp) temp.hidden = mode !== 'temporary';
    if (mode === 'registered') fillVehicleDefaults(); else { const d = document.getElementById('cf_r_driver'), p = document.getElementById('cf_r_phone'); if (d) d.value = ''; if (p) p.value = ''; }
  }

  function fillVehicleDefaults() {
    const vehicle = state.vehicles.find((v) => v.id === formValue('cf_r_vehicle'));
    if (!vehicle) return;
    const driver = document.getElementById('cf_r_driver'), phone = document.getElementById('cf_r_phone'), type = document.getElementById('cf_r_type');
    if (driver) driver.value = vehicle.driverName || ''; if (phone) phone.value = vehicle.driverPhone || '';
    if (type && vehicle.defaultVehicleTypeId && type.value !== vehicle.defaultVehicleTypeId) { type.value = vehicle.defaultVehicleTypeId; state.requestFiles = {}; const docs = document.getElementById('cf_docs'); if (docs) docs.innerHTML = docsHtml(type.value); bindRequestDynamic(); }
  }

  async function submitCompanyRequest() {
    const typeId = formValue('cf_r_type'), mode = document.querySelector('input[name=cf_vehicle_mode]:checked')?.value || 'registered', temporary = mode === 'temporary';
    const driverName = formValue('cf_r_driver').trim(), driverPhone = formValue('cf_r_phone').trim(), vehicleId = formValue('cf_r_vehicle'), vehicleNumber = temporary ? formValue('cf_r_vehicle_number').trim() : '', visitAt = formValue('cf_r_date');
    if (!visitAt || !driverName || !driverPhone) return toast('출입일자와 실제 운전자 정보를 입력해 주세요.');
    if (temporary && !vehicleNumber) return toast('용차 차량번호를 입력해 주세요.');
    if (!temporary && !vehicleId) return toast('등록 차량을 선택해 주세요.');
    const docs = requiredDocs(typeId);
    for (const d of docs.filter((x) => x.required)) if (!state.requestFiles[d.key]) return toast(`${d.label} 서류를 첨부해 주세요.`);
    const form = new FormData();
    form.append('vehicleTypeId', typeId); form.append('visitAt', visitAt); form.append('temporaryVehicle', String(temporary)); form.append('companyVehicleId', vehicleId); form.append('vehicleNumber', vehicleNumber); form.append('driverName', driverName); form.append('driverPhone', driverPhone);
    for (const d of docs) { const f = state.requestFiles[d.key]; if (!f) continue; form.append('documents', f, f.name); form.append('documentKeys', d.key); }
    const button = document.getElementById('cf_submit_request'); if (button) button.disabled = true;
    try { const out = await api('/api/company/requests', { method: 'POST', body: form, form: true }); state.requestFiles = {}; await refreshHomeData(); state.currentRequestId = out.id; setView('detail'); toast('출입 신청이 접수되었습니다.'); }
    catch (e) { if (button) button.disabled = false; toast(e.message); }
  }

  function openSimpleAnnotator(doc) {
    const layer = document.createElement('section'); layer.className = 'cf-annot';
    layer.innerHTML = `<header class="cf-annot-head"><button data-a="close">✕</button><strong>${esc(doc.label)} 작성</strong><button data-a="save" style="background:#2563eb;color:#fff">저장</button></header><div class="cf-annot-stage"><div class="cf-annot-wrap"><img alt="${esc(doc.label)}"><canvas></canvas></div></div><div class="cf-annot-tools"><button data-a="undo">↩ 되돌리기</button><button data-a="clear">전체 지우기</button></div>`;
    document.body.append(layer);
    const img = layer.querySelector('img'), canvas = layer.querySelector('canvas'), wrap = layer.querySelector('.cf-annot-wrap'), ctx = canvas.getContext('2d'); const strokes = []; let cur = null;
    img.onload = () => { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; wrap.style.aspectRatio = `${img.naturalWidth}/${img.naturalHeight}`; }; img.src = doc.formImage;
    const point = (event) => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * canvas.width / r.width, y: (event.clientY - r.top) * canvas.height / r.height }; };
    const redraw = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 4; ctx.lineCap = ctx.lineJoin = 'round'; for (const s of strokes) { if (!s.length) continue; ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); s.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.stroke(); } };
    canvas.onpointerdown = (e) => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ } cur = [point(e)]; strokes.push(cur); };
    canvas.onpointermove = (e) => { if (!cur) return; e.preventDefault(); cur.push(point(e)); redraw(); }; canvas.onpointerup = canvas.onpointercancel = () => { cur = null; };
    layer.querySelector('[data-a=undo]').onclick = () => { strokes.pop(); redraw(); }; layer.querySelector('[data-a=clear]').onclick = () => { if (!strokes.length || confirm('작성한 내용을 모두 지울까요?')) { strokes.length = 0; redraw(); } }; layer.querySelector('[data-a=close]').onclick = () => layer.remove();
    layer.querySelector('[data-a=save]').onclick = async () => { const off = document.createElement('canvas'); const maxSide = 1400; const ratio = Math.min(1, maxSide / Math.max(canvas.width, canvas.height)); off.width = Math.round(canvas.width * ratio); off.height = Math.round(canvas.height * ratio); const x = off.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, off.width, off.height); x.drawImage(img, 0, 0, off.width, off.height); x.drawImage(canvas, 0, 0, off.width, off.height); const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/jpeg', .72)); state.requestFiles[doc.key] = new File([blob], `${doc.label}.jpg`, { type: 'image/jpeg' }); layer.remove(); const docs = document.getElementById('cf_docs'); if (docs) docs.innerHTML = docsHtml(formValue('cf_r_type')); bindRequestDynamic(); toast(`${doc.label} 첨부 완료`); };
  }

  async function startCompanyFlow(view = 'login') {
    state.active = true;
    try {
      if (!state.vehicleTypes.length) state.vehicleTypes = await api('/api/vehicle-types', { companyAuth: false });
      if (state.token) { const me = await api('/api/company/me'); state.account = me.account; await refreshHomeData(); history.pushState({ companyFlow: 'home' }, ''); state.view = 'home'; render(); return; }
    } catch { state.token = ''; state.account = null; localStorage.removeItem(TOKEN_KEY); }
    history.pushState({ companyFlow: view }, ''); state.view = view; render();
  }

  async function renderDriverAccess(token) {
    app.classList.remove('company-flow-active'); app.classList.add('cf-driver');
    let data;
    try { data = await api(`/api/driver-access/${encodeURIComponent(token)}`, { companyAuth: false }); }
    catch (e) { app.innerHTML = head('자재센터 출입 안내') + `<main class="cf-screen"><div class="cf-card"><div class="cf-title">링크를 사용할 수 없습니다.</div><div style="color:#64748b">${esc(e.message)}</div></div></main>`; return; }
    const rules = [...(data.requiredSafetyRules || []), ...(data.otherSafetyRules || [])], ruleHtml = rules.map((r, i) => `<li><span class="cf-num">${i + 1}</span><span>${esc(r)}</span></li>`).join(''), steps = (data.route?.steps || []).map((s) => `<li>${esc(s)}</li>`).join(''), stage = workflowLabel(data.workflowStatus);
    app.innerHTML = head('자재센터 출입 안내', stage) + `<main class="cf-screen"><div class="cf-card"><div class="cf-item-top"><strong>${esc(data.vehicleNumber)}</strong><span class="cf-stage ${esc(data.workflowStatus)}">${stage}</span></div><div class="cf-meta">${esc(data.company)} · ${esc(data.driverName)}<br>출입일자 ${fmtDate(data.visitAt)} · ${esc(data.vehicleTypeName)}</div></div><div class="cf-title">안전수칙</div><div class="cf-card"><ul class="cf-rules">${ruleHtml}</ul></div><div class="cf-title">차량동선</div><div class="cf-card"><div style="font-weight:900;margin-bottom:10px">${esc(data.route?.summary || '')}</div><img class="cf-route-img" src="${esc(data.routeImage)}" alt="차량동선"><ol class="cf-route-steps">${steps}</ol></div>
      ${data.workflowStatus === 'safety_pending' ? `<div class="cf-card"><label class="cf-agree"><input type="checkbox" id="cf_driver_agree"><span>위 안전수칙과 차량동선을 모두 확인했으며 준수하겠습니다.</span></label><button class="cf-btn cf-primary" id="cf_driver_confirm" disabled>안전수칙 확인 완료</button></div>` : ''}
      ${data.workflowStatus === 'photo_pending' ? `<div class="cf-card cf-photo"><div class="cf-title">현장사진 업로드</div><p style="color:#64748b;line-height:1.5">자재센터 출입 후 현장에서 촬영한 사진을 1장 이상 등록하면 최종 완료됩니다.</p><input type="file" id="cf_driver_photo" accept="image/jpeg,image/png" capture="environment"><button class="cf-btn cf-success" id="cf_driver_photo_send" style="margin-top:10px">현장사진 업로드 및 완료</button></div>` : ''}
      ${data.workflowStatus === 'completed' ? '<div class="cf-card" style="text-align:center"><div style="font-size:44px">✅</div><div class="cf-title">최종 완료되었습니다.</div><div style="color:#64748b">안전수칙 확인과 현장사진 등록이 완료되었습니다.</div></div>' : ''}</main>`;
    const agree = document.getElementById('cf_driver_agree'), confirmBtn = document.getElementById('cf_driver_confirm'); if (agree && confirmBtn) agree.onchange = () => { confirmBtn.disabled = !agree.checked; };
    if (confirmBtn) confirmBtn.onclick = async () => { confirmBtn.disabled = true; try { await api(`/api/driver-access/${encodeURIComponent(token)}/confirm-safety`, { method: 'POST', body: {}, companyAuth: false }); await renderDriverAccess(token); } catch (e) { confirmBtn.disabled = false; toast(e.message); } };
    document.getElementById('cf_driver_photo_send')?.addEventListener('click', async () => { const file = document.getElementById('cf_driver_photo')?.files?.[0]; if (!file) return toast('현장사진을 선택해 주세요.'); const form = new FormData(); form.append('photo', file, file.name); try { await api(`/api/driver-access/${encodeURIComponent(token)}/photo`, { method: 'POST', body: form, form: true, companyAuth: false }); await renderDriverAccess(token); } catch (e) { toast(e.message); } });
  }

  function shareText(meta) {
    return `[자재센터 출입승인]\n차량번호: ${meta.vehicleNumber}\n출입일: ${meta.visitAt}\n\n출입 전 안전수칙과 차량동선을 확인해 주세요.\n${meta.driverLink}`;
  }

  async function decorateStaffDetail() {
    if (!state.staffRequestId || document.querySelector('.cf-staff-workflow')) return;
    const title = document.querySelector('#app > .appbar h1')?.textContent?.trim(); if (title !== '출입 신청 상세') return;
    try {
      const response = await fetch(`/api/admin/company-requests/${encodeURIComponent(state.staffRequestId)}/meta`); if (!response.ok) return; const meta = await response.json(); const screen = document.querySelector('#app > .screen'); if (!screen) return;
      const card = document.createElement('div'); card.className = 'cf-card cf-staff-workflow'; const stage = workflowLabel(meta.workflowStatus);
      card.innerHTML = `<div class="cf-title">기사 진행상태</div><div><span class="cf-stage ${esc(meta.workflowStatus)}">${stage}</span></div>${meta.driverLink && meta.workflowStatus !== 'completed' ? `<div class="cf-meta">기사 ${esc(meta.driverName)} · ${esc(meta.driverPhone)}<br>링크 사용기한 ${esc(new Date(meta.expiresAt).toLocaleString('ko-KR'))}</div><div class="cf-share-row"><button class="cf-btn cf-primary cf-small" data-cf-share>기사에게 링크 보내기</button><button class="cf-btn cf-secondary cf-small" data-cf-copy>링크 복사</button></div>` : ''}`;
      screen.querySelector('.card')?.after(card);
      card.querySelector('[data-cf-share]')?.addEventListener('click', async () => { const text = shareText(meta); try { if (navigator.share) await navigator.share({ title: '자재센터 출입승인', text }); else { await navigator.clipboard.writeText(text); toast('공유문구를 복사했습니다. 카카오톡에 붙여넣어 주세요.'); } } catch (e) { if (e?.name !== 'AbortError') toast('공유하지 못했습니다. 링크 복사를 이용해 주세요.'); } });
      card.querySelector('[data-cf-copy]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(meta.driverLink); toast('기사 전용 링크를 복사했습니다.'); } catch { toast(meta.driverLink); } });
    } catch { /* legacy request */ }
  }

  function contractTypeName(id) {
    if (!id) return '';
    return state.vehicleTypes.find((t) => t.id === id)?.name || '';
  }

  function companyAdminRow(c) {
    const contract = contractTypeName(c.contractTypeId);
    const line2 = [contract, c.phone].filter(Boolean).join(', ');
    return `<div class="cf-admin-company"><button class="cf-admin-company-info" data-cf-company-open="${esc(c.id)}"><strong>${esc(c.companyName)} (${esc(c.businessNo)})</strong><div>${esc(line2)}</div></button><button class="cf-btn cf-danger cf-small cf-admin-company-del" data-cf-company-del="${esc(c.id)}" data-cf-company-name="${esc(c.companyName)}">삭제</button></div>`;
  }

  async function openCompanyManager() {
    document.querySelector('.cf-admin-companies')?.remove();
    const layer = document.createElement('section'); layer.className = 'cf-admin-companies';
    // 헤더: 뒤로가기 버튼·설명 없이 제목만 크게(다른 관리 화면과 동일하게).
    layer.innerHTML = `<header class="cf-appbar"><div><h1 style="font-size:23px;font-weight:800;letter-spacing:-.6px;margin:0">업체관리</h1></div></header><main id="cf_company_admin_list"><div class="cf-screen">불러오는 중…</div></main>`;
    document.body.append(layer);
    // 하드웨어/브라우저 뒤로가기 시 앱이 종료되지 않고 이 화면만 닫혀 이전(관리자모드) 화면으로
    // 돌아가도록 히스토리 상태를 쌓고 popstate에서 닫는다.
    history.pushState({ adminCompanyManager: true }, '');
    const onPop = () => { window.removeEventListener('popstate', onPop); if (layer.isConnected) layer.remove(); };
    window.addEventListener('popstate', onPop);

    const listBox = layer.querySelector('#cf_company_admin_list');
    let companies = [];

    async function loadList() {
      try {
        if (!state.vehicleTypes.length) { try { state.vehicleTypes = await api('/api/vehicle-types', { companyAuth: false }); } catch { /* noop */ } }
        const res = await fetch('/api/admin/companies'); const data = await res.json();
        if (!res.ok) throw new Error(data?.error || '조회 실패');
        companies = data;
        listBox.innerHTML = `<div class="cf-screen">${data.length ? data.map(companyAdminRow).join('') : '<div class="cf-card">등록 업체가 없습니다.</div>'}</div>`;
      } catch (e) {
        listBox.innerHTML = `<div class="cf-screen"><div class="cf-card">${esc(e.message)}</div></div>`;
      }
    }

    function loadDetail(id) {
      const c = companies.find((x) => x.id === id); if (!c) return loadList();
      const contract = contractTypeName(c.contractTypeId);
      listBox.innerHTML = `<div class="cf-screen">
        <button class="cf-form-btn" data-cf-company-back style="margin:0 0 10px">‹ 업체 목록</button>
        <div class="cf-card"><div class="cf-item-top"><strong style="font-size:18px">${esc(c.companyName)}</strong></div>
          <div class="cf-meta" style="margin-top:8px;line-height:1.8">사업자번호 ${esc(c.businessNo)}<br>로그인 아이디 ${esc(c.loginId)}${contract ? `<br>계약유형 ${esc(contract)}` : ''}${c.phone ? `<br>연락처 ${esc(c.phone)}` : ''}</div>
          <button class="cf-btn cf-secondary" style="margin-top:12px" data-cf-company-reset="${esc(c.id)}">🔑 비밀번호 초기화</button>
          <div id="cf_reset_result"></div>
        </div>
      </div>`;
    }

    listBox.addEventListener('click', async (event) => {
      const open = event.target.closest?.('[data-cf-company-open]');
      if (open) { await loadDetail(open.dataset.cfCompanyOpen); return; }

      if (event.target.closest?.('[data-cf-company-back]')) { await loadList(); return; }

      const del = event.target.closest?.('[data-cf-company-del]');
      if (del) {
        const id = del.dataset.cfCompanyDel; const name = del.dataset.cfCompanyName || '';
        if (!confirm(`'${name}' 업체 계정을 삭제하시겠습니까?\n등록된 차량 정보도 함께 삭제됩니다.`)) return;
        del.disabled = true;
        try {
          const res = await fetch(`/api/admin/companies/${encodeURIComponent(id)}`, { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || '삭제하지 못했습니다.');
          toast('업체를 삭제했습니다.');
          await loadList();
        } catch (e) { del.disabled = false; toast(e.message); }
        return;
      }

      const reset = event.target.closest?.('[data-cf-company-reset]');
      if (reset) {
        if (!confirm('임시 비밀번호를 발급하시겠습니까?\n기존 비밀번호는 즉시 사용할 수 없게 됩니다.')) return;
        reset.disabled = true;
        try {
          const res = await fetch(`/api/admin/companies/${encodeURIComponent(reset.dataset.cfCompanyReset)}/reset-password`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || '초기화하지 못했습니다.');
          const box = document.getElementById('cf_reset_result');
          if (box) box.innerHTML = `<div class="cf-reset-box">임시 비밀번호가 발급되었습니다.<br>아이디 <b>${esc(data.loginId)}</b><br>임시 비밀번호 <b>${esc(data.tempPassword)}</b><div style="margin-top:6px;font-weight:700;color:#92400e">이 화면을 벗어나면 다시 확인할 수 없습니다. 업체 담당자에게 안전하게 전달해 주세요.</div></div>`;
          reset.disabled = false;
        } catch (e) { reset.disabled = false; toast(e.message); }
        return;
      }
    });

    await loadList();
  }

  document.addEventListener('click', (event) => {
    const detail = event.target.closest?.('[data-detail]'); if (detail) state.staffRequestId = detail.dataset.detail || '';
    const memberTool = event.target.closest?.('[data-admin-tool="members"]'); if (memberTool) { event.preventDefault(); event.stopImmediatePropagation(); openCompanyManager(); }
  }, true);

  document.addEventListener('click', (event) => {
    const role = event.target.closest?.('#app [data-role="driver"]'); if (!role) return; event.preventDefault(); event.stopImmediatePropagation(); startCompanyFlow('login');
  }, true);

  new MutationObserver(() => {
    const member = document.querySelector('[data-admin-tool="members"]');
    if (member) { const strong = member.querySelector('strong'), span = member.querySelector('span'); if (strong) strong.textContent = '업체관리'; if (span) span.innerHTML = '업체 공동계정과<br>등록차량을 조회합니다.'; }
    decorateStaffDetail();
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', (event) => {
    if (!state.active) return;
    if (event.state?.companyFlow) { state.view = event.state.companyFlow; render(); }
    else { state.active = false; app.classList.remove('company-flow-active'); location.reload(); }
  });

  (async () => {
    const hashParams = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const queryParams = new URLSearchParams(location.search);
    const driverToken = hashParams.get(DRIVER_PARAM) || queryParams.get(DRIVER_PARAM);
    if (driverToken) { state.active = true; await renderDriverAccess(driverToken); return; }
    if (state.token) {
      try { state.vehicleTypes = await api('/api/vehicle-types', { companyAuth: false }); const me = await api('/api/company/me'); state.account = me.account; await refreshHomeData(); state.active = true; state.view = 'home'; history.replaceState({ companyFlow: 'home' }, ''); render(); }
      catch { localStorage.removeItem(TOKEN_KEY); state.token = ''; }
    }
  })();
})();
