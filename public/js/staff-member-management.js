(() => {
  const TOKEN_KEY = 'ep_token';
  const app = document.getElementById('app');
  if (!app) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const normalizeSearch = (value) => String(value || '')
    .normalize('NFKC').toLowerCase().replace(/[\s\-_.]/g, '');

  function csrfToken() {
    const part = document.cookie.split(';').map((value) => value.trim())
      .find((value) => value.startsWith('ep_csrf='));
    return part ? decodeURIComponent(part.slice('ep_csrf='.length)) : '';
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.method && options.method !== 'GET') {
      const csrf = csrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
          method: 'POST', body: { name, phone, company },
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
    const keyword = normalizeSearch(layer.querySelector('[data-search]').value);
    const filtered = accounts.filter((item) => [
      item.vehicleNumber, item.name, item.phone, item.company,
    ].some((value) => normalizeSearch(value).includes(keyword)));

    list.innerHTML = filtered.length ? filtered.map((item) => `
      <article class="driver-account-item">
        <div class="driver-account-top">
          <div class="driver-account-name">
            ${esc(item.vehicleNumber || item.loginId || '-')} (${esc(item.name || '-')})
            ${item.mustChangePassword ? '<span class="driver-badge">새 비밀번호 설정 대기</span>' : ''}
          </div>
          ${item.dormant ? '<span class="driver-dormant-badge">휴면 고객</span>' : ''}
        </div>
        <div class="driver-account-meta">${esc(item.phone || '-')}, ${esc(item.company || '-')}</div>
        <div class="driver-account-actions">
          <button type="button" class="reset" data-reset="${esc(item.id)}">임시 비밀번호</button>
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
          const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}/reset-password`, { method: 'POST' });
          showTemporaryPassword('임시 비밀번호 발급', result);
          await loadAccounts(layer);
        } catch (error) {
          button.disabled = false;
          notify(error.message);
        }
      };
    });

    list.querySelectorAll('[data-transfer]').forEach((button) => {
      const account = accounts.find((item) => item.id === button.dataset.transfer);
      if (account) button.onclick = () => transferDialog(account, () => loadAccounts(layer));
    });

    list.querySelectorAll('[data-delete]').forEach((button) => {
      button.onclick = async () => {
        const account = accounts.find((item) => item.id === button.dataset.delete);
        if (!account) return;
        if (!confirm(`${account.vehicleNumber} (${account.name}) 회원을 삭제하시겠습니까?\n\n회원은 즉시 로그인할 수 없게 되며 목록에서 제거됩니다. 기존 출입신청 기록은 보존됩니다.`)) return;
        button.disabled = true;
        button.textContent = '삭제 중…';
        try {
          const result = await request(`/api/admin/driver-accounts/${encodeURIComponent(account.id)}`, { method: 'DELETE' });
          notify(result.message || '회원을 삭제했습니다.');
          await loadAccounts(layer);
        } catch (error) {
          button.disabled = false;
          button.textContent = '회원 삭제';
          notify(error.message);
        }
      };
    });
  }

  async function loadAccounts(layer) {
    const list = layer.querySelector('[data-list]');
    try {
      const accounts = (await request('/api/admin/driver-accounts')).filter((item) => !item.archived);
      layer._driverAccounts = accounts;
      renderAccounts(layer, accounts);
    } catch (error) {
      list.innerHTML = `<div class="driver-empty">${esc(error.message)}</div>`;
    }
  }

  function openMemberManagement() {
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
    layer.querySelector('[data-search]').addEventListener('input', () => {
      renderAccounts(layer, layer._driverAccounts || []);
    });
    loadAccounts(layer);
  }

  function ensureOpenButton() {
    const appbar = app.querySelector(':scope > .appbar');
    if (!appbar || !appbar.classList.contains('staff-console-bar')) return;
    if (!['admin', 'staff'].includes(appbar.dataset.staffConsoleRole || '')) return;
    if (appbar.querySelector('.driver-manage-open')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'driver-manage-open';
    button.textContent = '회원관리';
    button.onclick = openMemberManagement;
    const logout = appbar.querySelector('[data-logout]');
    if (logout) appbar.insertBefore(button, logout);
    else appbar.appendChild(button);
  }

  new MutationObserver(ensureOpenButton).observe(app, { childList: true, subtree: true });
  ensureOpenButton();
})();
