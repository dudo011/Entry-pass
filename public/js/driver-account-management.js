(() => {
  const TOKEN_KEY = 'ep_token';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const style = document.createElement('style');
  style.textContent = `
    .driver-manage-open{flex:none;order:2;margin-left:auto;margin-right:8px;width:auto;min-height:40px;padding:0 10px;border:0;border-radius:10px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;font-weight:800;white-space:nowrap;cursor:pointer}
    .appbar .driver-manage-open + .staff-manage-open{margin-left:0}
    .driver-manage-layer{position:fixed;inset:0;z-index:10020;background:#f1f5f9;overflow:auto}
    .driver-manage-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:16px;background:#0f172a;color:#fff}
    .driver-manage-head button{width:40px;height:40px;border:0;border-radius:10px;background:rgba(255,255,255,.14);color:#fff;font-size:25px;cursor:pointer}
    .driver-manage-head h2{margin:0;font-size:21px}
    .driver-manage-body{max-width:760px;margin:0 auto;padding:16px}
    .driver-search{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:13px 14px;font-size:16px;margin-bottom:12px}
    .driver-account-item{background:#fff;border:1px solid #e2e8f0;border-radius:15px;padding:14px;margin-bottom:10px}
    .driver-account-name{font-size:17px;font-weight:900;color:#0f172a}
    .driver-account-meta{margin-top:5px;color:#64748b;font-size:14px;line-height:1.55}
    .driver-account-actions{display:flex;gap:8px;margin-top:12px}
    .driver-account-actions button{flex:1;min-height:42px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800;cursor:pointer}
    .driver-account-actions .reset{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}
    .driver-account-actions .transfer{color:#9a3412;border-color:#fed7aa;background:#fff7ed}
    .driver-badge{display:inline-block;margin-left:7px;padding:3px 7px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:900}
    .driver-empty{text-align:center;color:#64748b;padding:28px 6px}
    .driver-modal-backdrop{position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,.6);display:grid;place-items:center;padding:18px}
    .driver-modal{width:min(100%,460px);background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(15,23,42,.3)}
    .driver-modal h3{margin:0 0 10px;font-size:21px}
    .driver-modal p{color:#475569;line-height:1.55}
    .driver-modal label{display:block;margin-top:12px;font-size:14px;font-weight:800;color:#334155}
    .driver-modal input{width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px;padding:12px;font-size:16px}
    .driver-modal-actions{display:flex;gap:8px;margin-top:18px}
    .driver-modal-actions button{flex:1;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:900;cursor:pointer}
    .driver-modal-actions .primary{background:#2563eb;border-color:#2563eb;color:#fff}
    .temporary-password{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:900;text-align:center;letter-spacing:1px;padding:14px;border-radius:12px;background:#f8fafc;border:1px dashed #94a3b8;user-select:all}
    .forced-password-layer{position:fixed;inset:0;z-index:11000;background:#f1f5f9;display:grid;place-items:center;padding:18px}
    .forced-password-card{width:min(100%,430px);background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(15,23,42,.15)}
    .forced-password-card h2{margin:0 0 8px}.forced-password-card p{color:#64748b;line-height:1.5}
    .forced-password-card input{width:100%;box-sizing:border-box;margin-top:10px;border:1px solid #cbd5e1;border-radius:11px;padding:13px;font-size:16px}
    .forced-password-card button{width:100%;margin-top:14px;min-height:46px;border:0;border-radius:11px;background:#2563eb;color:#fff;font-weight:900;font-size:16px;cursor:pointer}
    @media(max-width:460px){.driver-manage-open{font-size:13px;padding:0 8px}.driver-account-actions{flex-direction:column}}
  `;
  document.head.appendChild(style);

  function csrfToken() {
    const part = document.cookie.split(';').map((v) => v.trim())
      .find((v) => v.startsWith('ep_csrf='));
    return part ? decodeURIComponent(part.slice('ep_csrf='.length)) : '';
  }

  async function request(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const csrf = csrfToken();
    if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      ...options,
      headers,
      body: options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }

  function notify(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  function modal(content) {
    const backdrop = document.createElement('div');
    backdrop.className = 'driver-modal-backdrop';
    backdrop.innerHTML = `<div class="driver-modal">${content}</div>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function showTemporaryPassword(title, data) {
    const layer = modal(`
      <h3>${esc(title)}</h3>
      <p>${esc(data.message || '임시 비밀번호가 발급되었습니다.')}</p>
      ${data.loginId ? `<p><b>로그인 ID(차량번호)</b><br>${esc(data.loginId)}</p>` : ''}
      <div class="temporary-password">${esc(data.temporaryPassword)}</div>
      <p style="font-size:13px">이 값은 지금 화면에서만 확인할 수 있습니다. 기사에게 전화 등 안전한 방법으로 전달하고, 최초 로그인 시 새 비밀번호로 변경하도록 안내해 주세요.</p>
      <div class="driver-modal-actions">
        <button type="button" data-copy>복사</button>
        <button type="button" class="primary" data-close>확인</button>
      </div>`);
    layer.querySelector('[data-copy]').onclick = async () => {
      await navigator.clipboard?.writeText(data.temporaryPassword).catch(() => {});
      notify('임시 비밀번호를 복사했습니다.');
    };
    layer.querySelector('[data-close]').onclick = () => layer.remove();
  }

  function transferDialog(account, onDone) {
    const layer = modal(`
      <h3>차주 변경</h3>
      <p><b>${esc(account.vehicleNumber)}</b> 차량의 기존 차주 기록은 보존하고, 새 차주 계정을 만듭니다. 차량등록증 등 증빙을 확인한 뒤 처리하세요.</p>
      <label>새 차주 이름<input data-name autocomplete="name"></label>
      <label>새 차주 연락처<input data-phone inputmode="tel" autocomplete="tel"></label>
      <label>업체명(선택)<input data-company autocomplete="organization"></label>
      <div class="driver-modal-actions">
        <button type="button" data-cancel>취소</button>
        <button type="button" class="primary" data-submit>변경 승인</button>
      </div>`);
    layer.querySelector('[data-cancel]').onclick = () => layer.remove();
    layer.querySelector('[data-submit]').onclick = async (event) => {
      const name = layer.querySelector('[data-name]').value.trim();
      const phone = layer.querySelector('[data-phone]').value.trim();
      const company = layer.querySelector('[data-company]').value.trim();
      if (!name || !phone) return notify('새 차주의 이름과 연락처를 입력해 주세요.');
      if (!confirm('기존 차주의 로그인은 즉시 종료됩니다. 차주 변경을 확정하시겠습니까?')) return;
      event.currentTarget.disabled = true;
      try {
        const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/transfer`, {
          method: 'POST',
          body: { name, phone, company },
        });
        layer.remove();
        showTemporaryPassword('차주 변경 완료', result);
        onDone();
      } catch (error) {
        event.currentTarget.disabled = false;
        notify(error.message);
      }
    };
  }

  async function loadDriverAccounts(layer) {
    const list = layer.querySelector('[data-list]');
    const search = layer.querySelector('[data-search]');
    try {
      const accounts = (await request('/api/admin/driver-accounts'))
        .filter((item) => !item.archived);

      const render = () => {
        const keyword = search.value.trim().toLowerCase();
        const filtered = accounts.filter((item) => [
          item.name, item.phone, item.company, item.vehicleNumber,
        ].some((value) => String(value || '').toLowerCase().includes(keyword)));

        list.innerHTML = filtered.length ? filtered.map((item) => `
          <div class="driver-account-item">
            <div class="driver-account-name">${esc(item.name)}
              ${item.mustChangePassword ? '<span class="driver-badge">비밀번호 변경 대기</span>' : ''}
            </div>
            <div class="driver-account-meta">
              차량번호 ${esc(item.vehicleNumber)}<br>
              연락처 ${esc(item.phone || '-')} · 업체 ${esc(item.company || '-')}
            </div>
            <div class="driver-account-actions">
              <button type="button" class="reset" data-reset="${esc(item.id)}">임시 비밀번호 발급</button>
              <button type="button" class="transfer" data-transfer="${esc(item.id)}">차주 변경</button>
            </div>
          </div>`).join('') : '<div class="driver-empty">검색 결과가 없습니다.</div>';

        list.querySelectorAll('[data-reset]').forEach((button) => {
          button.onclick = async () => {
            const account = accounts.find((item) => item.id === button.dataset.reset);
            if (!account || !confirm(`${account.name} 기사 계정의 비밀번호를 초기화하시겠습니까?\n기존 로그인은 모두 종료됩니다.`)) return;
            button.disabled = true;
            try {
              const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/reset-password`, {
                method: 'POST',
              });
              showTemporaryPassword('임시 비밀번호 발급', result);
              loadDriverAccounts(layer);
            } catch (error) {
              button.disabled = false;
              notify(error.message);
            }
          };
        });

        list.querySelectorAll('[data-transfer]').forEach((button) => {
          const account = accounts.find((item) => item.id === button.dataset.transfer);
          if (account) button.onclick = () => transferDialog(account, () => loadDriverAccounts(layer));
        });
      };

      search.oninput = render;
      render();
    } catch (error) {
      list.innerHTML = `<div class="driver-empty">${esc(error.message)}</div>`;
    }
  }

  function openDriverManagement() {
    const layer = document.createElement('div');
    layer.className = 'driver-manage-layer';
    layer.innerHTML = `
      <div class="driver-manage-head">
        <button type="button" aria-label="닫기">‹</button><h2>차량기사 관리</h2>
      </div>
      <div class="driver-manage-body">
        <input class="driver-search" data-search placeholder="이름, 차량번호, 연락처, 업체명 검색">
        <div data-list><div class="driver-empty">불러오는 중…</div></div>
      </div>`;
    document.body.appendChild(layer);
    layer.querySelector('.driver-manage-head button').onclick = () => layer.remove();
    loadDriverAccounts(layer);
  }

  let currentUser = null;
  let passwordPromptOpen = false;

  async function enforcePasswordChange(user) {
    if (passwordPromptOpen || user?.role !== 'driver' || !user.mustChangePassword) return;
    passwordPromptOpen = true;
    const layer = document.createElement('div');
    layer.className = 'forced-password-layer';
    layer.innerHTML = `
      <div class="forced-password-card">
        <h2>새 비밀번호를 설정해 주세요</h2>
        <p>관리자가 발급한 임시 비밀번호로 로그인했습니다. 계속 사용하려면 본인만 아는 새 비밀번호로 변경해야 합니다.</p>
        <input data-password type="password" autocomplete="new-password" placeholder="새 비밀번호(4자 이상)">
        <input data-confirm type="password" autocomplete="new-password" placeholder="새 비밀번호 확인">
        <button type="button">비밀번호 변경</button>
      </div>`;
    document.body.appendChild(layer);
    layer.querySelector('button').onclick = async (event) => {
      const password = layer.querySelector('[data-password]').value;
      const confirmPassword = layer.querySelector('[data-confirm]').value;
      if (password.length < 4) return notify('비밀번호는 4자 이상이어야 합니다.');
      if (password !== confirmPassword) return notify('비밀번호가 일치하지 않습니다.');
      event.currentTarget.disabled = true;
      try {
        await request('/api/auth/profile', {
          method: 'PUT',
          body: {
            name: user.name,
            phone: user.phone,
            company: user.company || '',
            defaultVehicleTypeId: user.defaultVehicleTypeId || '',
            password,
          },
        });
        layer.remove();
        passwordPromptOpen = false;
        notify('새 비밀번호가 설정되었습니다. 다시 로그인해 주세요.');
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        event.currentTarget.disabled = false;
        notify(error.message);
      }
    };
  }

  let enhancing = false;
  async function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        currentUser = null;
        return;
      }

      try {
        currentUser = (await request('/api/auth/me')).user;
        await enforcePasswordChange(currentUser);
      } catch {
        currentUser = null;
        return;
      }

      if (currentUser?.role !== 'staff' || currentUser?.staffRole !== 'admin') return;
      const appbar = document.querySelector('#app > .appbar');
      const logout = appbar?.querySelector('[data-logout]');
      if (!appbar || !logout || appbar.querySelector('.driver-manage-open')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'driver-manage-open';
      button.textContent = '🚚 기사관리';
      appbar.insertBefore(button, appbar.querySelector('.staff-manage-open') || logout);
      button.onclick = openDriverManagement;
    } finally {
      enhancing = false;
    }
  }

  const app = document.getElementById('app');
  if (!app) return;
  let queued = false;
  const apply = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };
  new MutationObserver(apply).observe(app, { childList: true, subtree: true });
  apply();
})();
