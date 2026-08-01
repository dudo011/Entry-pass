(() => {
  const TOKEN_KEY = 'ep_token';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const style = document.createElement('style');
  style.textContent = `
    .staff-signup-switch{text-align:center;margin:16px 0;color:#64748b;font-size:15px}
    .staff-signup-switch button{border:0;background:none;color:#2563eb;font-weight:800;cursor:pointer;font-size:15px}
    .staff-manage-open{flex:none;order:2;margin-left:auto;margin-right:8px;width:auto;min-height:40px;padding:0 10px;border:0;border-radius:10px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;font-weight:800;white-space:nowrap;cursor:pointer}
    .appbar .staff-manage-open + [data-logout]{order:3;margin-left:0}
    .staff-manage-layer{position:fixed;inset:0;z-index:10000;background:#f1f5f9;overflow:auto}
    .staff-manage-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:16px;background:#0f172a;color:#fff}
    .staff-manage-head button{width:40px;height:40px;border:0;border-radius:10px;background:rgba(255,255,255,.14);color:#fff;font-size:25px;cursor:pointer}
    .staff-manage-head h2{margin:0;font-size:21px}
    .staff-manage-body{max-width:720px;margin:0 auto;padding:16px}
    .staff-manage-section{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:14px}
    .staff-manage-section h3{margin:0 0 12px;font-size:18px}
    .staff-account-item{border:1px solid #e2e8f0;border-radius:13px;padding:13px;margin-top:10px}
    .staff-account-main{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .staff-account-name{font-weight:800;font-size:17px;color:#0f172a}
    .staff-account-meta{margin-top:4px;color:#64748b;font-size:14px;line-height:1.45}
    .staff-account-actions{display:flex;gap:7px;margin-top:11px}
    .staff-account-actions button{flex:1;min-height:40px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer}
    .staff-account-actions .approve{background:#2563eb;border-color:#2563eb;color:#fff}
    .staff-account-actions .reject,.staff-account-actions .disable{color:#b91c1c;border-color:#fecaca;background:#fff7f7}
    .staff-status{display:inline-block;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800}
    .staff-status.pending{background:#fef3c7;color:#92400e}.staff-status.active{background:#dcfce7;color:#166534}
    .staff-status.disabled{background:#fee2e2;color:#991b1b}.staff-empty{padding:18px 4px;text-align:center;color:#64748b}
    @media (max-width:390px){.staff-manage-open{padding:0 8px;font-size:13px;margin-right:6px}}
  `;
  document.head.appendChild(style);

  async function request(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { ...options, headers,
      body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }

  function notify(message) {
    const node = document.createElement('div');
    node.className = 'toast'; node.textContent = message;
    document.body.appendChild(node); setTimeout(() => node.remove(), 2600);
  }

  function renderStaffSignup(card, switchNode) {
    card.innerHTML = `
      <label class="field-h"><span class="lb">사번(ID)</span><input id="staff_reg_id" inputmode="numeric" autocomplete="username" placeholder="사번 입력"></label>
      <label class="field-h"><span class="lb">이름</span><input id="staff_reg_name" autocomplete="name" placeholder="이름 입력"></label>
      <label class="field-h"><span class="lb">비밀번호</span><input id="staff_reg_pw" type="password" autocomplete="new-password" placeholder="8자 이상"></label>
      <label class="field-h"><span class="lb">비밀번호 확인</span><input id="staff_reg_pw2" type="password" autocomplete="new-password" placeholder="다시 입력"></label>
      <p class="hint" style="margin:4px 2px 14px;text-align:left">가입 신청 후 관리자가 사번과 이름을 확인하여 승인합니다.</p>
      <button class="btn btn-primary" id="staff_reg_submit">직원 가입 신청</button>`;
    switchNode.innerHTML = `이미 계정이 있으신가요? <button type="button" id="staff_login_back">로그인</button>`;

    document.getElementById('staff_login_back').onclick = () => location.reload();
    document.getElementById('staff_reg_submit').onclick = async (event) => {
      const button = event.currentTarget;
      const employeeNo = document.getElementById('staff_reg_id').value.trim();
      const name = document.getElementById('staff_reg_name').value.trim();
      const password = document.getElementById('staff_reg_pw').value;
      const password2 = document.getElementById('staff_reg_pw2').value;
      if (!employeeNo || !name || !password) return notify('모든 항목을 입력해 주세요.');
      if (!/^\d{4,12}$/.test(employeeNo)) return notify('사번은 숫자 4~12자리로 입력해 주세요.');
      if (password.length < 8) return notify('비밀번호는 8자 이상이어야 합니다.');
      if (password !== password2) return notify('비밀번호가 일치하지 않습니다.');
      button.disabled = true; button.textContent = '신청 중…';
      try {
        await request('/api/staff-applications', { method: 'POST', body: { employeeNo, name, password } });
        card.innerHTML = `<div style="text-align:center;padding:22px 8px"><div style="font-size:42px">✅</div><h3>가입 신청이 접수되었습니다</h3><p class="hint">관리자 승인 후 사번으로 로그인할 수 있습니다.</p></div>`;
        switchNode.innerHTML = `<button type="button" id="staff_login_back">로그인 화면으로</button>`;
        document.getElementById('staff_login_back').onclick = () => location.reload();
      } catch (error) {
        button.disabled = false; button.textContent = '직원 가입 신청'; notify(error.message);
      }
    };
  }

  function enhanceStaffAuth() {
    const appbar = document.querySelector('#app > .appbar');
    const title = appbar?.querySelector('h1')?.textContent?.trim();
    const card = document.querySelector('#app > .screen > .card');
    if (title !== '자재센터 직원' || !card || document.querySelector('.staff-signup-switch')) return;
    const switchNode = document.createElement('p');
    switchNode.className = 'staff-signup-switch';
    switchNode.innerHTML = `처음 이용하시나요? <button type="button">직원 회원가입</button>`;
    card.insertAdjacentElement('afterend', switchNode);
    switchNode.querySelector('button').onclick = () => renderStaffSignup(card, switchNode);
    const oldHint = [...document.querySelectorAll('#app > .screen > .hint')]
      .find((node) => node.textContent.includes('직원 계정은 관리자'));
    if (oldHint) oldHint.remove();
  }

  async function loadManagement(layer) {
    const pendingBox = layer.querySelector('[data-pending]');
    const activeBox = layer.querySelector('[data-active]');
    try {
      const [applications, accounts] = await Promise.all([
        request('/api/admin/staff-applications'), request('/api/admin/staff-accounts'),
      ]);
      const pending = applications.filter((item) => item.status === 'pending');
      pendingBox.innerHTML = pending.length ? pending.map((item) => `
        <div class="staff-account-item">
          <div class="staff-account-main"><div><div class="staff-account-name">${esc(item.name)}</div>
          <div class="staff-account-meta">사번 ${esc(item.employeeNo)}<br>신청 ${esc(new Date(item.createdAt).toLocaleString('ko-KR'))}</div></div>
          <span class="staff-status pending">승인 대기</span></div>
          <div class="staff-account-actions"><button class="approve" data-approve="${esc(item.id)}">승인</button><button class="reject" data-reject="${esc(item.id)}">반려</button></div>
        </div>`).join('') : '<div class="staff-empty">승인 대기 중인 직원이 없습니다.</div>';
      activeBox.innerHTML = accounts.length ? accounts.map((item) => `
        <div class="staff-account-item"><div class="staff-account-main"><div><div class="staff-account-name">${esc(item.name)}</div>
        <div class="staff-account-meta">사번 ${esc(item.loginId)} · ${item.staffRole === 'admin' ? '관리자' : '직원'}</div></div>
        <span class="staff-status ${item.disabled ? 'disabled' : 'active'}">${item.disabled ? '사용 중지' : '사용 중'}</span></div>
        ${item.staffRole !== 'admin' ? `<div class="staff-account-actions"><button class="${item.disabled ? '' : 'disable'}" data-toggle="${esc(item.id)}" data-disabled="${item.disabled ? '1' : '0'}">${item.disabled ? '사용 재개' : '사용 중지'}</button></div>` : ''}</div>`).join('') : '<div class="staff-empty">등록된 직원 계정이 없습니다.</div>';

      layer.querySelectorAll('[data-approve]').forEach((button) => button.onclick = async () => {
        if (!confirm('이 직원을 승인하시겠습니까?')) return;
        try { await request(`/api/admin/staff-applications/${button.dataset.approve}/approve`, { method: 'POST' }); notify('직원 계정을 승인했습니다.'); loadManagement(layer); } catch (error) { notify(error.message); }
      });
      layer.querySelectorAll('[data-reject]').forEach((button) => button.onclick = async () => {
        if (!confirm('이 가입 신청을 반려하시겠습니까?')) return;
        try { await request(`/api/admin/staff-applications/${button.dataset.reject}/reject`, { method: 'POST' }); notify('가입 신청을 반려했습니다.'); loadManagement(layer); } catch (error) { notify(error.message); }
      });
      layer.querySelectorAll('[data-toggle]').forEach((button) => button.onclick = async () => {
        const disabled = button.dataset.disabled === '1';
        if (!confirm(disabled ? '이 직원 계정의 사용을 재개하시겠습니까?' : '이 직원 계정의 사용을 중지하시겠습니까?')) return;
        try { await request(`/api/admin/staff-accounts/${button.dataset.toggle}/${disabled ? 'enable' : 'disable'}`, { method: 'POST' }); notify(disabled ? '계정 사용을 재개했습니다.' : '계정 사용을 중지했습니다.'); loadManagement(layer); } catch (error) { notify(error.message); }
      });
    } catch (error) {
      pendingBox.innerHTML = activeBox.innerHTML = `<div class="staff-empty">${esc(error.message)}</div>`;
    }
  }

  function openManagement() {
    const layer = document.createElement('div');
    layer.className = 'staff-manage-layer';
    layer.innerHTML = `<div class="staff-manage-head"><button type="button" aria-label="닫기">‹</button><h2>직원관리</h2></div>
      <div class="staff-manage-body"><section class="staff-manage-section"><h3>가입 승인 대기</h3><div data-pending><div class="staff-empty">불러오는 중…</div></div></section>
      <section class="staff-manage-section"><h3>직원 계정</h3><div data-active><div class="staff-empty">불러오는 중…</div></div></section></div>`;
    document.body.appendChild(layer);
    layer.querySelector('.staff-manage-head button').onclick = () => layer.remove();
    loadManagement(layer);
  }

  let currentUser = null;
  async function enhanceAdminConsole() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { currentUser = null; return; }
    const appbar = document.querySelector('#app > .appbar');
    const logout = appbar?.querySelector('[data-logout]');
    if (!appbar || !logout || appbar.querySelector('.staff-manage-open')) return;
    try {
      if (!currentUser) currentUser = (await request('/api/auth/me')).user;
      if (currentUser?.role !== 'staff' || currentUser?.staffRole !== 'admin') return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'staff-manage-open'; button.textContent = '👥 직원관리';
      appbar.insertBefore(button, logout); button.onclick = openManagement;
    } catch { /* 로그인 화면 또는 만료 세션 */ }
  }

  const app = document.getElementById('app');
  if (!app) return;
  let queued = false;
  const apply = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhanceStaffAuth(); enhanceAdminConsole(); });
  };
  new MutationObserver(apply).observe(app, { childList: true, subtree: true });
  apply();
})();