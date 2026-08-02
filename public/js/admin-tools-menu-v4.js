(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_token';
  let currentUser = null;
  let currentToken = '';
  let userPromise = null;
  let menuLayer = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const normalize = (value) => String(value || '').replace(/\s+/g, '');
  const normalizeSearch = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_.]/g, '');

  const style = document.createElement('style');
  style.textContent = `
    #app > .appbar .driver-manage-open,
    #app > .appbar .staff-manage-open,
    #app > .appbar .staff-role-manage-open{display:none!important}

    .admin-console-bar,
    .ep-admin-head,
    .driver-manage-head,
    .staff-manage-head{
      height:76px!important;min-height:76px!important;box-sizing:border-box!important;
      padding:14px 16px!important;display:flex!important;align-items:center!important
    }
    .admin-console-bar{gap:10px!important}
    .admin-console-bar h1{font-size:23px!important;line-height:1.15!important;white-space:nowrap!important;letter-spacing:-.7px!important}
    .admin-console-bar .sub{margin-top:2px!important;line-height:1.2!important}
    .admin-console-bar .admin-tools-open{
      flex:none;order:2;margin-left:auto;margin-right:7px;min-height:42px;padding:0 12px;
      border:0;border-radius:11px;background:rgba(255,255,255,.14);color:#fff;
      font-size:14px;font-weight:900;white-space:nowrap;cursor:pointer;touch-action:manipulation
    }
    .admin-console-bar .admin-tools-open[aria-busy="true"]{opacity:.72;cursor:wait}
    .admin-console-bar [data-logout]{order:3;margin-left:0!important;flex:none}

    .ep-admin-layer{
      position:fixed;inset:0;z-index:50000;background:#f8fafc;overflow:auto;
      overscroll-behavior:contain;isolation:isolate
    }
    .ep-admin-layer[hidden]{display:none!important}
    .ep-admin-head{position:sticky;top:0;z-index:2;background:#0f172a;color:#fff}
    .ep-admin-head h2{margin:0;font-size:24px;letter-spacing:-.7px}
    .ep-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 16px 28px}
    .ep-admin-card{
      appearance:none;-webkit-appearance:none;width:100%;min-width:0;min-height:190px;
      box-sizing:border-box;border:1px solid #e2e8f0;border-radius:20px;background:#fff;
      box-shadow:0 5px 16px rgba(15,23,42,.08);display:flex;flex-direction:column;
      align-items:center;justify-content:center;text-align:center;padding:20px 12px;
      color:#0f172a;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent
    }
    .ep-admin-card:active{transform:scale(.985)}
    .ep-admin-card-icon{font-size:48px;line-height:1;margin-bottom:15px;pointer-events:none}
    .ep-admin-card strong{font-size:22px;line-height:1.25;letter-spacing:-.6px;pointer-events:none}
    .ep-admin-card span{margin-top:10px;color:#64748b;font-size:14px;line-height:1.5;word-break:keep-all;pointer-events:none}

    .ep-management-layer{position:fixed;inset:0;z-index:60000;background:#f1f5f9;overflow:auto;overscroll-behavior:contain}
    .driver-manage-head,.staff-manage-head{position:sticky!important;top:0!important;z-index:2!important;background:#0f172a!important;color:#fff!important}
    .driver-manage-head h2,.staff-manage-head h2{margin:0;font-size:24px;letter-spacing:-.7px}
    .ep-member-body,.staff-manage-body{max-width:760px;margin:0 auto;padding:16px}
    .ep-member-search{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:13px 14px;font-size:16px;margin-bottom:12px;background:#fff}
    .driver-account-item{background:#fff;border:1px solid #e2e8f0;border-radius:15px;padding:14px;margin-bottom:10px}
    .driver-account-name{font-size:17px;font-weight:900;color:#0f172a;line-height:1.4;word-break:break-word}
    .driver-account-meta{margin-top:5px;color:#64748b;font-size:14px;line-height:1.5;word-break:break-word}
    .driver-account-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
    .driver-account-actions button{width:100%;min-width:0;min-height:42px;padding:8px 6px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800;font-size:14px;cursor:pointer;touch-action:manipulation}
    .driver-account-actions .reset{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}
    .driver-account-actions .transfer{color:#9a3412;border-color:#fed7aa;background:#fff7ed}
    .driver-badge{display:inline-block;margin-left:7px;padding:3px 7px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:900;vertical-align:middle}
    .driver-empty,.staff-empty{text-align:center;color:#64748b;padding:28px 6px}

    .staff-manage-section{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:14px}
    .staff-manage-section h3{margin:0 0 12px;font-size:18px}
    .staff-account-item{border:1px solid #e2e8f0;border-radius:13px;padding:13px;margin-top:10px}
    .staff-account-main{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .staff-account-name{font-weight:800;font-size:17px;color:#0f172a}
    .staff-account-meta{margin-top:4px;color:#64748b;font-size:14px;line-height:1.45}
    .staff-account-actions,.staff-role-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}
    .staff-account-actions button,.staff-role-actions button{min-width:0;min-height:40px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer}
    .staff-account-actions .approve{background:#2563eb;border-color:#2563eb;color:#fff}
    .staff-account-actions .reject,.staff-account-actions .disable,.staff-role-actions .staff-delete-account{color:#b91c1c;border-color:#fecaca;background:#fff7f7}
    .staff-role-actions .staff-change-role{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}
    .staff-status{display:inline-block;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800;white-space:nowrap}
    .staff-status.pending{background:#fef3c7;color:#92400e}.staff-status.active{background:#dcfce7;color:#166534}.staff-status.disabled{background:#fee2e2;color:#991b1b}

    .ep-admin-modal-backdrop{position:fixed;inset:0;z-index:70000;background:rgba(15,23,42,.6);display:grid;place-items:center;padding:18px;box-sizing:border-box}
    .ep-admin-modal{width:min(100%,460px);max-height:calc(100vh - 36px);overflow:auto;box-sizing:border-box;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(15,23,42,.3)}
    .ep-admin-modal h3{margin:0 0 10px;font-size:21px}.ep-admin-modal p{color:#475569;line-height:1.55}
    .ep-admin-modal label{display:block;margin-top:12px;font-size:14px;font-weight:800;color:#334155}
    .ep-admin-modal input{width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px;padding:12px;font-size:16px}
    .ep-admin-modal-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:18px}
    .ep-admin-modal-actions button{min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:900;cursor:pointer}
    .ep-admin-modal-actions .primary{background:#2563eb;border-color:#2563eb;color:#fff}
    .ep-temporary-password{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:900;text-align:center;letter-spacing:1px;padding:14px;border-radius:12px;background:#f8fafc;border:1px dashed #94a3b8;user-select:all}

    .ep-admin-toast{position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80000;box-sizing:border-box;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:12px;background:#0f172a;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.24);font-size:15px;font-weight:800;line-height:1.35;text-align:center;white-space:nowrap;pointer-events:none}

    @media(max-width:390px){
      .admin-console-bar h1{font-size:20px!important}
      .admin-console-bar .admin-tools-open{padding:0 9px;font-size:13px;margin-right:5px}
      .ep-admin-grid{gap:11px;padding:16px 13px 24px}
      .ep-admin-card{min-height:174px;border-radius:17px;padding:16px 8px}
      .ep-admin-card-icon{font-size:43px;margin-bottom:13px}
      .ep-admin-card strong{font-size:20px}.ep-admin-card span{font-size:13px}
      .ep-member-body,.staff-manage-body{padding:13px}
      .driver-account-actions button{font-size:13px;padding:7px 4px}
      .ep-admin-toast{font-size:14px;white-space:normal;width:max-content}
    }
  `;
  document.head.appendChild(style);

  function csrfToken() {
    const part = document.cookie.split(';').map((value) => value.trim())
      .find((value) => value.startsWith('ep_csrf='));
    return part ? decodeURIComponent(part.slice('ep_csrf='.length)) : '';
  }

  async function request(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const csrf = csrfToken();
    if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
      body: options.body !== undefined && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }

  function toast(message) {
    document.querySelectorAll('.ep-admin-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'ep-admin-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2600);
  }

  function modal(content) {
    const backdrop = document.createElement('div');
    backdrop.className = 'ep-admin-modal-backdrop';
    backdrop.innerHTML = `<div class="ep-admin-modal">${content}</div>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  async function getCurrentUser() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (!token) {
      currentUser = null;
      currentToken = '';
      userPromise = null;
      return null;
    }
    if (currentUser && currentToken === token) return currentUser;
    if (userPromise && currentToken === token) return userPromise;

    currentUser = null;
    currentToken = token;
    userPromise = request('/api/auth/me')
      .then((data) => {
        if ((localStorage.getItem(TOKEN_KEY) || '') !== token) return null;
        currentUser = data.user || null;
        return currentUser;
      })
      .catch(() => null)
      .finally(() => {
        if (currentToken === token) userPromise = null;
      });
    return userPromise;
  }

  const isAdminUser = (user) => user?.role === 'staff' && user?.staffRole === 'admin';
  const isStaffConsole = (appbar) => normalize(appbar?.querySelector('h1')?.textContent).includes('출입신청관리');

  function removeManagementLayers() {
    document.querySelectorAll('.ep-management-layer,.ep-admin-modal-backdrop').forEach((node) => node.remove());
  }

  function showTemporaryPassword(title, data) {
    const layer = modal(`
      <h3>${esc(title)}</h3>
      <p>${esc(data.message || '임시 비밀번호가 발급되었습니다.')}</p>
      ${data.loginId ? `<p><b>로그인 ID(차량번호)</b><br>${esc(data.loginId)}</p>` : ''}
      <div class="ep-temporary-password">${esc(data.temporaryPassword)}</div>
      <p style="font-size:13px">이 값은 현재 창에서만 확인할 수 있습니다. 기사에게 안전한 방법으로 전달해 주세요.</p>
      <div class="ep-admin-modal-actions"><button type="button" data-copy>복사</button><button type="button" class="primary" data-close>확인</button></div>`);
    layer.querySelector('[data-copy]').onclick = async () => {
      await navigator.clipboard?.writeText(data.temporaryPassword).catch(() => {});
      toast('임시 비밀번호를 복사했습니다.');
    };
    layer.querySelector('[data-close]').onclick = () => layer.remove();
  }

  function transferDialog(account, refresh) {
    const layer = modal(`
      <h3>차주 변경</h3>
      <p><b>${esc(account.vehicleNumber)}</b> 차량의 기존 차주 기록은 보존하고 새 차주 계정을 만듭니다.</p>
      <label>새 차주 이름<input data-name autocomplete="name"></label>
      <label>새 차주 연락처<input data-phone inputmode="tel" autocomplete="tel"></label>
      <label>소속업체(선택)<input data-company autocomplete="organization"></label>
      <div class="ep-admin-modal-actions"><button type="button" data-cancel>취소</button><button type="button" class="primary" data-submit>변경 승인</button></div>`);
    layer.querySelector('[data-cancel]').onclick = () => layer.remove();
    layer.querySelector('[data-submit]').onclick = async (event) => {
      const name = layer.querySelector('[data-name]').value.trim();
      const phone = layer.querySelector('[data-phone]').value.trim();
      const company = layer.querySelector('[data-company]').value.trim();
      if (!name || !phone) return toast('새 차주의 이름과 연락처를 입력해 주세요.');
      if (!confirm('기존 차주의 로그인은 즉시 종료됩니다. 차주 변경을 확정하시겠습니까?')) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/transfer`, {
          method: 'POST', body: { name, phone, company },
        });
        layer.remove();
        showTemporaryPassword('차주 변경 완료', result);
        await refresh();
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    };
  }

  function renderMembers(layer, accounts) {
    const list = layer.querySelector('[data-list]');
    const keyword = normalizeSearch(layer.querySelector('[data-search]').value);
    const filtered = accounts.filter((item) => [item.vehicleNumber, item.name, item.phone, item.company]
      .some((value) => normalizeSearch(value).includes(keyword)));
    list.innerHTML = filtered.length ? filtered.map((item) => `
      <article class="driver-account-item">
        <div class="driver-account-name">${esc(item.vehicleNumber || item.loginId || '-')} (${esc(item.name || '-')})${item.mustChangePassword ? '<span class="driver-badge">비밀번호 변경 대기</span>' : ''}</div>
        <div class="driver-account-meta">${esc(item.phone || '-')}, ${esc(item.company || '-')}</div>
        <div class="driver-account-actions">
          <button type="button" class="reset" data-reset="${esc(item.id)}">임시 비밀번호 발급</button>
          <button type="button" class="transfer" data-transfer="${esc(item.id)}">차주 변경</button>
        </div>
      </article>`).join('') : '<div class="driver-empty">검색 결과가 없습니다.</div>';

    list.querySelectorAll('[data-reset]').forEach((button) => {
      button.onclick = async () => {
        const account = accounts.find((item) => item.id === button.dataset.reset);
        if (!account || !confirm(`${account.vehicleNumber} (${account.name}) 회원의 비밀번호를 초기화하시겠습니까?\n기존 로그인은 모두 종료됩니다.`)) return;
        button.disabled = true;
        try {
          const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/reset-password`, { method: 'POST' });
          showTemporaryPassword('임시 비밀번호 발급', result);
          await loadMembers(layer);
        } catch (error) {
          button.disabled = false;
          toast(error.message);
        }
      };
    });
    list.querySelectorAll('[data-transfer]').forEach((button) => {
      const account = accounts.find((item) => item.id === button.dataset.transfer);
      if (account) button.onclick = () => transferDialog(account, () => loadMembers(layer));
    });
  }

  async function loadMembers(layer) {
    const list = layer.querySelector('[data-list]');
    try {
      const accounts = (await request('/api/admin/driver-accounts')).filter((item) => !item.archived);
      layer._accounts = accounts;
      renderMembers(layer, accounts);
    } catch (error) {
      list.innerHTML = `<div class="driver-empty">${esc(error.message)}</div>`;
    }
  }

  function openMembers() {
    removeManagementLayers();
    const layer = document.createElement('section');
    layer.className = 'ep-management-layer driver-manage-layer';
    layer.innerHTML = `
      <header class="driver-manage-head"><h2>회원관리</h2></header>
      <main class="ep-member-body">
        <input class="ep-member-search" data-search placeholder="차량번호, 이름, 연락처, 소속업체 검색">
        <div data-list><div class="driver-empty">불러오는 중…</div></div>
      </main>`;
    document.body.appendChild(layer);
    layer.querySelector('[data-search]').addEventListener('input', () => renderMembers(layer, layer._accounts || []));
    loadMembers(layer);
  }

  function staffAccountHtml(item) {
    const isSelf = currentUser?.id === item.id;
    const nextRole = item.staffRole === 'admin' ? 'approver' : 'admin';
    const roleLabel = item.staffRole === 'admin' ? '직원 권한으로 변경' : '관리자 권한 부여';
    return `
      <div class="staff-account-item">
        <div class="staff-account-main"><div><div class="staff-account-name">${esc(item.name)}</div>
          <div class="staff-account-meta">사번 ${esc(item.loginId)} · ${item.staffRole === 'admin' ? '관리자' : '직원'}</div></div>
          <span class="staff-status ${item.disabled ? 'disabled' : 'active'}">${item.disabled ? '사용 중지' : '사용 중'}</span></div>
        ${item.staffRole !== 'admin' ? `<div class="staff-account-actions"><button class="${item.disabled ? '' : 'disable'}" data-toggle="${esc(item.id)}" data-disabled="${item.disabled ? '1' : '0'}">${item.disabled ? '사용 재개' : '사용 중지'}</button></div>` : ''}
        ${!isSelf ? `<div class="staff-role-actions"><button class="staff-change-role" data-role="${esc(item.id)}" data-next-role="${nextRole}">${roleLabel}</button><button class="staff-delete-account" data-delete="${esc(item.id)}">계정 삭제</button></div>` : ''}
      </div>`;
  }

  async function loadStaff(layer) {
    const pendingBox = layer.querySelector('[data-pending]');
    const activeBox = layer.querySelector('[data-active]');
    try {
      const [applications, accounts] = await Promise.all([
        request('/api/admin/staff-applications'), request('/api/admin/staff-accounts'),
      ]);
      layer._staffAccounts = accounts;
      const pending = applications.filter((item) => item.status === 'pending');
      pendingBox.innerHTML = pending.length ? pending.map((item) => `
        <div class="staff-account-item">
          <div class="staff-account-main"><div><div class="staff-account-name">${esc(item.name)}</div>
            <div class="staff-account-meta">사번 ${esc(item.employeeNo)}<br>신청 ${esc(new Date(item.createdAt).toLocaleString('ko-KR'))}</div></div>
            <span class="staff-status pending">승인 대기</span></div>
          <div class="staff-account-actions"><button class="approve" data-approve="${esc(item.id)}">승인</button><button class="reject" data-reject="${esc(item.id)}">반려</button></div>
        </div>`).join('') : '<div class="staff-empty">승인 대기 중인 직원이 없습니다.</div>';
      activeBox.innerHTML = accounts.length ? accounts.map(staffAccountHtml).join('') : '<div class="staff-empty">등록된 직원 계정이 없습니다.</div>';

      layer.querySelectorAll('[data-approve]').forEach((button) => button.onclick = async () => {
        if (!confirm('이 직원을 승인하시겠습니까?')) return;
        try { await request(`/api/admin/staff-applications/${button.dataset.approve}/approve`, { method: 'POST' }); toast('직원 계정을 승인했습니다.'); await loadStaff(layer); } catch (error) { toast(error.message); }
      });
      layer.querySelectorAll('[data-reject]').forEach((button) => button.onclick = async () => {
        if (!confirm('이 가입 신청을 반려하시겠습니까?')) return;
        try { await request(`/api/admin/staff-applications/${button.dataset.reject}/reject`, { method: 'POST' }); toast('가입 신청을 반려했습니다.'); await loadStaff(layer); } catch (error) { toast(error.message); }
      });
      layer.querySelectorAll('[data-toggle]').forEach((button) => button.onclick = async () => {
        const disabled = button.dataset.disabled === '1';
        if (!confirm(disabled ? '이 직원 계정의 사용을 재개하시겠습니까?' : '이 직원 계정의 사용을 중지하시겠습니까?')) return;
        try { await request(`/api/admin/staff-accounts/${button.dataset.toggle}/${disabled ? 'enable' : 'disable'}`, { method: 'POST' }); toast(disabled ? '계정 사용을 재개했습니다.' : '계정 사용을 중지했습니다.'); await loadStaff(layer); } catch (error) { toast(error.message); }
      });
      layer.querySelectorAll('[data-role]').forEach((button) => button.onclick = async () => {
        const account = accounts.find((item) => item.id === button.dataset.role);
        if (!account) return;
        const nextRole = button.dataset.nextRole;
        const message = nextRole === 'admin'
          ? `${account.name} 직원에게 관리자 권한을 부여하시겠습니까?`
          : `${account.name} 관리자를 일반 직원 권한으로 변경하시겠습니까?`;
        if (!confirm(message)) return;
        try { const result = await request(`/api/admin/staff-accounts/${account.id}/role`, { method: 'POST', body: { staffRole: nextRole } }); toast(result.message || '권한을 변경했습니다.'); await loadStaff(layer); } catch (error) { toast(error.message); }
      });
      layer.querySelectorAll('[data-delete]').forEach((button) => button.onclick = async () => {
        const account = accounts.find((item) => item.id === button.dataset.delete);
        if (!account || !confirm(`${account.name} (${account.loginId}) 계정을 완전히 삭제하시겠습니까?`)) return;
        try { const result = await request(`/api/admin/staff-accounts/${account.id}`, { method: 'DELETE' }); toast(result.message || '직원 계정을 삭제했습니다.'); await loadStaff(layer); } catch (error) { toast(error.message); }
      });
    } catch (error) {
      pendingBox.innerHTML = activeBox.innerHTML = `<div class="staff-empty">${esc(error.message)}</div>`;
    }
  }

  function openStaff() {
    removeManagementLayers();
    const layer = document.createElement('section');
    layer.className = 'ep-management-layer staff-manage-layer';
    layer.innerHTML = `
      <header class="staff-manage-head"><h2>직원관리</h2></header>
      <main class="staff-manage-body">
        <section class="staff-manage-section"><h3>가입 승인 대기</h3><div data-pending><div class="staff-empty">불러오는 중…</div></div></section>
        <section class="staff-manage-section"><h3>직원 계정</h3><div data-active><div class="staff-empty">불러오는 중…</div></div></section>
      </main>`;
    document.body.appendChild(layer);
    loadStaff(layer);
  }

  function openManagement(kind) {
    if (!menuLayer || menuLayer.hidden) return;
    history.pushState({ ...(history.state || {}), adminTools: 'management', adminToolKind: kind }, '');
    menuLayer.hidden = true;
    if (kind === 'members') openMembers();
    else openStaff();
  }

  function openMenu() {
    if (menuLayer?.isConnected) {
      menuLayer.hidden = false;
      return;
    }
    document.querySelectorAll('.ep-admin-layer').forEach((node) => node.remove());
    removeManagementLayers();
    menuLayer = document.createElement('section');
    menuLayer.className = 'ep-admin-layer';
    menuLayer.setAttribute('aria-label', '관리자모드');
    menuLayer.innerHTML = `
      <header class="ep-admin-head"><h2>관리자모드</h2></header>
      <main class="ep-admin-grid">
        <button type="button" class="ep-admin-card" data-admin-tool="members">
          <div class="ep-admin-card-icon" aria-hidden="true">👥</div><strong>회원관리</strong><span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
        </button>
        <button type="button" class="ep-admin-card" data-admin-tool="staff">
          <div class="ep-admin-card-icon" aria-hidden="true">🪪</div><strong>직원관리</strong><span>직원 계정과 권한을<br>조회하고 관리합니다.</span>
        </button>
      </main>`;
    document.body.appendChild(menuLayer);
    history.pushState({ ...(history.state || {}), adminTools: 'menu' }, '');
    menuLayer.querySelector('[data-admin-tool="members"]').onclick = () => openManagement('members');
    menuLayer.querySelector('[data-admin-tool="staff"]').onclick = () => openManagement('staff');
  }

  async function handleAdminMode(button) {
    if (button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    try {
      const user = await getCurrentUser();
      if (!isAdminUser(user)) return toast('관리자 권한이 없습니다.');
      openMenu();
    } finally {
      button.removeAttribute('aria-busy');
    }
  }

  async function enhanceHeader() {
    const appbar = app.querySelector(':scope > .appbar');
    const logout = appbar?.querySelector('[data-logout]');
    if (!appbar || !logout || !isStaffConsole(appbar)) return;
    const user = await getCurrentUser();
    if (!isAdminUser(user)) {
      appbar.classList.remove('admin-console-bar');
      appbar.querySelector('.admin-tools-open')?.remove();
      return;
    }
    appbar.classList.add('admin-console-bar');
    if (appbar.querySelector('.admin-tools-open')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-tools-open';
    button.textContent = '관리자모드';
    button.onclick = () => handleAdminMode(button);
    appbar.insertBefore(button, logout);
  }

  function handlePopState(event) {
    if (event.state?.adminTools === 'menu') {
      removeManagementLayers();
      if (menuLayer) menuLayer.hidden = false;
      return;
    }
    removeManagementLayers();
    menuLayer?.remove();
    menuLayer = null;
  }

  let scheduled = false;
  const scheduleEnhance = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceHeader();
    });
  };

  new MutationObserver(scheduleEnhance).observe(app, { childList: true, subtree: true });
  window.addEventListener('popstate', handlePopState);
  scheduleEnhance();
})();
