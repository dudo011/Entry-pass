(() => {
  const TOKEN_KEY = 'ep_token';
  const app = document.getElementById('app');
  if (!app) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const normalizeSearch = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_.]/g, '');

  const style = document.createElement('style');
  style.textContent = `
    .driver-manage-open{display:none!important}
    .driver-manage-layer{position:fixed;inset:0;z-index:13000;background:#f1f5f9;overflow:auto;overscroll-behavior:contain}
    .driver-manage-head{position:sticky;top:0;z-index:2;height:76px;min-height:76px;box-sizing:border-box;display:flex;align-items:center;padding:14px 16px;background:#0f172a;color:#fff}
    .driver-manage-head h2{margin:0;font-size:24px;letter-spacing:-.7px}
    .driver-manage-body{max-width:760px;margin:0 auto;padding:16px}
    .driver-search{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:13px 14px;font-size:16px;margin-bottom:12px;background:#fff}
    .driver-account-item{background:#fff;border:1px solid #e2e8f0;border-radius:15px;padding:14px;margin-bottom:10px}
    .driver-account-top{display:flex;align-items:flex-start;gap:8px}
    .driver-account-name{min-width:0;flex:1;font-size:17px;font-weight:900;color:#0f172a;line-height:1.4;word-break:break-word}
    .driver-account-meta{margin-top:5px;color:#64748b;font-size:14px;line-height:1.5;word-break:break-word}
    .driver-account-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
    .driver-account-actions button{width:100%;min-width:0;min-height:42px;padding:8px 6px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800;font-size:14px;cursor:pointer;touch-action:manipulation}
    .driver-account-actions .reset{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}
    .driver-account-actions .transfer{color:#9a3412;border-color:#fed7aa;background:#fff7ed}
    .driver-account-actions .delete{grid-column:1/-1;color:#b91c1c;border-color:#fecaca;background:#fff7f7}
    .driver-badge{display:inline-block;margin-left:7px;padding:3px 7px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:900;vertical-align:middle}
    .driver-dormant-badge{flex:none;margin-top:1px;padding:4px 8px;border-radius:999px;background:#e2e8f0;color:#475569;font-size:11px;font-weight:900;white-space:nowrap}
    .driver-empty{text-align:center;color:#64748b;padding:28px 6px}
    .driver-modal-backdrop{position:fixed;inset:0;z-index:14500;background:rgba(15,23,42,.6);display:grid;place-items:center;padding:18px;box-sizing:border-box}
    .driver-modal{width:min(100%,460px);max-height:calc(100vh - 36px);overflow:auto;box-sizing:border-box;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(15,23,42,.3)}
    .driver-modal h3{margin:0 0 10px;font-size:21px}.driver-modal p{color:#475569;line-height:1.55}
    .driver-modal label{display:block;margin-top:12px;font-size:14px;font-weight:800;color:#334155}
    .driver-modal input{width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px;padding:12px;font-size:16px}
    .driver-modal-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:18px}
    .driver-modal-actions button{min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:900;cursor:pointer}
    .driver-modal-actions .primary{background:#2563eb;border-color:#2563eb;color:#fff}
    .temporary-password{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:900;text-align:center;letter-spacing:1px;padding:14px;border-radius:12px;background:#f8fafc;border:1px dashed #94a3b8;user-select:all}
    .forced-password-layer{position:fixed;inset:0;z-index:15000;background:#f1f5f9;display:grid;place-items:center;padding:18px;box-sizing:border-box}
    .forced-password-card{width:min(100%,430px);box-sizing:border-box;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(15,23,42,.15)}
    .forced-password-card h2{margin:0 0 8px}.forced-password-card p{color:#64748b;line-height:1.5}
    .forced-password-card input{width:100%;box-sizing:border-box;margin-top:10px;border:1px solid #cbd5e1;border-radius:11px;padding:13px;font-size:16px}
    .forced-password-card button{width:100%;margin-top:14px;min-height:46px;border:0;border-radius:11px;background:#2563eb;color:#fff;font-weight:900;font-size:16px;cursor:pointer}
    .forced-password-error{min-height:20px;margin:10px 0 0;color:#b91c1c;font-size:14px;font-weight:700}
    @media(max-width:390px){
      .driver-manage-body{padding:13px}.driver-account-item{padding:13px}
      .driver-account-actions button{font-size:13px;padding:7px 4px}
      .driver-dormant-badge{padding:4px 7px;font-size:10px}
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
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

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
      <p style="font-size:13px">이 값은 현재 창에서만 확인할 수 있습니다. 기사에게 안전한 방법으로 전달해 주세요.</p>
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
      <p><b>${esc(account.vehicleNumber)}</b> 차량의 기존 차주 기록은 보존하고 새 차주 계정을 만듭니다.</p>
      <label>새 차주 이름<input data-name autocomplete="name"></label>
      <label>새 차주 연락처<input data-phone inputmode="tel" autocomplete="tel"></label>
      <label>소속업체(선택)<input data-company autocomplete="organization"></label>
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

      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/transfer`, {
          method: 'POST',
          body: { name, phone, company },
        });
        layer.remove();
        showTemporaryPassword('차주 변경 완료', result);
        onDone();
      } catch (error) {
        button.disabled = false;
        notify(error.message);
      }
    };
  }

  function renderAccounts(layer, accounts) {
    const list = layer.querySelector('[data-list]');
    const search = layer.querySelector('[data-search]');
    const keyword = normalizeSearch(search.value);
    const filtered = accounts.filter((item) => [
      item.vehicleNumber, item.name, item.phone, item.company,
    ].some((value) => normalizeSearch(value).includes(keyword)));

    list.innerHTML = filtered.length ? filtered.map((item) => `
      <article class="driver-account-item">
        <div class="driver-account-top">
          <div class="driver-account-name">
            ${esc(item.vehicleNumber || item.loginId || '-')} (${esc(item.name || '-')})
            ${item.mustChangePassword ? '<span class="driver-badge">비밀번호 변경 대기</span>' : ''}
          </div>
          ${item.dormant ? '<span class="driver-dormant-badge">휴면 고객</span>' : ''}
        </div>
        <div class="driver-account-meta">${esc(item.phone || '-')}, ${esc(item.company || '-')}</div>
        <div class="driver-account-actions">
          <button type="button" class="reset" data-reset="${esc(item.id)}">임시 비밀번호 발급</button>
          <button type="button" class="transfer" data-transfer="${esc(item.id)}">차주 변경</button>
          <button type="button" class="delete" data-delete="${esc(item.id)}">회원 삭제</button>
        </div>
      </article>`).join('') : '<div class="driver-empty">검색 결과가 없습니다.</div>';

    list.querySelectorAll('[data-reset]').forEach((button) => {
      button.onclick = async () => {
        const account = accounts.find((item) => item.id === button.dataset.reset);
        if (!account || !confirm(`${account.vehicleNumber} (${account.name}) 회원의 비밀번호를 초기화하시겠습니까?\n기존 로그인은 모두 종료됩니다.`)) return;

        button.disabled = true;
        try {
          const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/reset-password`, {
            method: 'POST',
          });
          showTemporaryPassword('임시 비밀번호 발급', result);
          await loadDriverAccounts(layer);
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

    list.querySelectorAll('[data-delete]').forEach((button) => {
      button.onclick = async () => {
        const account = accounts.find((item) => item.id === button.dataset.delete);
        if (!account) return;
        const message = `${account.vehicleNumber} (${account.name}) 회원을 삭제하시겠습니까?\n\n회원은 즉시 로그인할 수 없게 되며 목록에서 제거됩니다. 기존 출입신청 기록은 보존됩니다.`;
        if (!confirm(message)) return;

        button.disabled = true;
        button.textContent = '삭제 중…';
        try {
          const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}`, {
            method: 'DELETE',
          });
          notify(result.message || '회원을 삭제했습니다.');
          await loadDriverAccounts(layer);
        } catch (error) {
          button.disabled = false;
          button.textContent = '회원 삭제';
          notify(error.message);
        }
      };
    });
  }

  async function loadDriverAccounts(layer) {
    const list = layer.querySelector('[data-list]');
    try {
      const accounts = (await request('/api/admin/driver-accounts'))
        .filter((item) => !item.archived);
      layer._driverAccounts = accounts;
      renderAccounts(layer, accounts);
    } catch (error) {
      list.innerHTML = `<div class="driver-empty">${esc(error.message)}</div>`;
    }
  }

  function openDriverManagement() {
    document.querySelectorAll('.driver-manage-layer').forEach((node) => node.remove());
    const layer = document.createElement('section');
    layer.className = 'driver-manage-layer';
    layer.innerHTML = `
      <header class="driver-manage-head"><h2>회원관리</h2></header>
      <main class="driver-manage-body">
        <input class="driver-search" data-search placeholder="차량번호, 이름, 연락처, 소속업체 검색">
        <div data-list><div class="driver-empty">불러오는 중…</div></div>
      </main>`;
    document.body.appendChild(layer);

    const search = layer.querySelector('[data-search]');
    search.addEventListener('input', () => renderAccounts(layer, layer._driverAccounts || []));
    loadDriverAccounts(layer);
  }

  let currentUser = null;
  let currentToken = '';
  let userPromise = null;
  let passwordPromptOpen = false;

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

  async function clearSessionAfterPasswordChange() {
    const headers = {};
    const csrf = csrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
    }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
  }

  function enforcePasswordChange(user) {
    if (passwordPromptOpen || user?.role !== 'driver' || !user.mustChangePassword) return;
    passwordPromptOpen = true;

    const layer = document.createElement('section');
    layer.className = 'forced-password-layer';
    layer.innerHTML = `
      <div class="forced-password-card">
        <h2>새 비밀번호를 설정해 주세요</h2>
        <p>관리자가 발급한 임시 비밀번호로 로그인했습니다. 계속 사용하려면 본인만 아는 새 비밀번호로 변경해야 합니다.</p>
        <input data-password type="password" autocomplete="new-password" placeholder="새 비밀번호(4자 이상)">
        <input data-confirm type="password" autocomplete="new-password" placeholder="새 비밀번호 확인">
        <p class="forced-password-error" role="alert"></p>
        <button type="button">비밀번호 변경</button>
      </div>`;
    document.body.appendChild(layer);

    const errorBox = layer.querySelector('.forced-password-error');
    layer.querySelector('button').onclick = async (event) => {
      const password = layer.querySelector('[data-password]').value;
      const confirmPassword = layer.querySelector('[data-confirm]').value;
      errorBox.textContent = '';
      if (password.length < 4) {
        errorBox.textContent = '비밀번호는 4자 이상이어야 합니다.';
        return;
      }
      if (password !== confirmPassword) {
        errorBox.textContent = '비밀번호가 일치하지 않습니다.';
        return;
      }

      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '변경 중…';
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
        await clearSessionAfterPasswordChange();
        layer.remove();
        passwordPromptOpen = false;
        notify('새 비밀번호가 설정되었습니다. 다시 로그인해 주세요.');
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        button.disabled = false;
        button.textContent = '비밀번호 변경';
        errorBox.textContent = error.message;
      }
    };
  }

  let enhancing = false;
  async function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      const user = await getCurrentUser();
      if (!user) return;
      enforcePasswordChange(user);

      if (user.role !== 'staff' || user.staffRole !== 'admin') return;
      const appbar = app.querySelector(':scope > .appbar');
      const logout = appbar?.querySelector('[data-logout]');
      if (!appbar || !logout || appbar.querySelector('.driver-manage-open')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'driver-manage-open';
      button.textContent = '회원관리';
      button.onclick = openDriverManagement;
      appbar.insertBefore(button, logout);
    } finally {
      enhancing = false;
    }
  }

  let scheduled = false;
  const scheduleEnhance = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  };

  new MutationObserver(scheduleEnhance).observe(app, { childList: true, subtree: true });
  scheduleEnhance();
})();
