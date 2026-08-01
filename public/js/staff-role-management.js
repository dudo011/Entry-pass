(() => {
  const TOKEN_KEY = 'ep_token';

  const style = document.createElement('style');
  style.textContent = `
    .staff-role-actions{display:flex;gap:7px;margin-top:8px}
    .staff-role-actions button{flex:1;min-height:40px;border-radius:10px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-weight:800;cursor:pointer}
    .staff-role-actions .staff-delete-account{border-color:#fecaca;background:#fff7f7;color:#b91c1c}
  `;
  document.head.appendChild(style);

  async function request(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      ...options,
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

  function reopenManagement(layer) {
    layer.remove();
    setTimeout(() => document.querySelector('.staff-manage-open')?.click(), 60);
  }

  async function enhanceLayer(layer) {
    if (!layer || layer.dataset.roleControlsLoading === '1') return;
    layer.dataset.roleControlsLoading = '1';
    try {
      const accounts = await request('/api/admin/staff-accounts');
      const activeBox = layer.querySelector('[data-active]');
      if (!activeBox) return;

      accounts.forEach((account) => {
        const item = [...activeBox.querySelectorAll('.staff-account-item')]
          .find((node) => node.textContent.includes(`사번 ${account.loginId}`));
        if (!item || item.querySelector('.staff-role-actions')) return;

        const actions = document.createElement('div');
        actions.className = 'staff-role-actions';
        const nextRole = account.staffRole === 'admin' ? 'approver' : 'admin';
        const roleLabel = account.staffRole === 'admin' ? '직원 권한으로 변경' : '관리자 권한 부여';
        actions.innerHTML = `
          <button type="button" class="staff-change-role">${roleLabel}</button>
          <button type="button" class="staff-delete-account">계정 삭제</button>`;
        item.appendChild(actions);

        actions.querySelector('.staff-change-role').onclick = async () => {
          const message = nextRole === 'admin'
            ? `${account.name} 직원에게 관리자 권한을 부여하시겠습니까?\n관리자는 직원관리와 전체 관리자 기능을 사용할 수 있습니다.`
            : `${account.name} 관리자를 일반 직원 권한으로 변경하시겠습니까?`;
          if (!confirm(message)) return;
          try {
            const result = await request(`/api/admin/staff-accounts/${account.id}/role`, {
              method: 'POST', body: { staffRole: nextRole },
            });
            notify(result.message || '권한을 변경했습니다.');
            reopenManagement(layer);
          } catch (error) {
            notify(error.message);
          }
        };

        actions.querySelector('.staff-delete-account').onclick = async () => {
          const warning = `${account.name} (${account.loginId}) 계정을 완전히 삭제하시겠습니까?\n삭제하면 해당 계정의 모든 로그인 세션이 종료되며 되돌릴 수 없습니다.`;
          if (!confirm(warning)) return;
          try {
            const result = await request(`/api/admin/staff-accounts/${account.id}`, { method: 'DELETE' });
            notify(result.message || '직원 계정을 삭제했습니다.');
            reopenManagement(layer);
          } catch (error) {
            notify(error.message);
          }
        };
      });
    } catch (error) {
      notify(error.message);
    } finally {
      layer.dataset.roleControlsLoading = '0';
    }
  }

  let queued = false;
  const scan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const layer = document.querySelector('.staff-manage-layer');
      if (layer) enhanceLayer(layer);
    });
  };

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
