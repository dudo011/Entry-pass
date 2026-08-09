(() => {
  let menuLayer = null;
  let opening = false;

  const style = document.createElement('style');
  style.textContent = `
    .admin-tools-head,.driver-manage-head,.staff-manage-head{
      height:68px!important;min-height:68px!important;box-sizing:border-box!important;
      padding:13px 16px!important;display:flex!important;align-items:center!important
    }
    .admin-tools-layer{
      position:fixed;inset:0;z-index:50000;background:#f8fafc;overflow:auto;
      overscroll-behavior:contain;isolation:isolate;pointer-events:auto
    }
    .admin-tools-layer[hidden]{display:none!important}
    .admin-tools-head{position:sticky;top:0;z-index:2;background:#0f172a;color:#fff}
    .admin-tools-head h2,.driver-manage-head h2,.staff-manage-head h2{margin:0;font-size:23px;letter-spacing:-.6px}
    .driver-manage-head,.staff-manage-head{position:sticky!important;top:0!important;z-index:2!important;gap:0!important;background:#0f172a!important;color:#fff!important}
    .driver-manage-head > button,.staff-manage-head > button{display:none!important}
    .admin-tools-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px 16px 28px}
    .admin-tools-card{
      appearance:none;-webkit-appearance:none;width:100%;min-width:0;min-height:190px;box-sizing:border-box;
      border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.08);
      display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px 12px;
      color:#0f172a;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none
    }
    .admin-tools-card:active{transform:scale(.985)}
    .admin-tools-card:disabled{opacity:.65;cursor:wait}
    .admin-tools-card.restricted{background:#f1f5f9;color:#64748b;border-color:#cbd5e1;box-shadow:none;cursor:not-allowed}
    .admin-tools-card.restricted:active{transform:none}
    .admin-tools-card.restricted .admin-tools-icon{filter:grayscale(1);opacity:.65}
    .admin-tools-card.restricted span{color:#94a3b8}
    .admin-tools-icon{font-size:48px;line-height:1;margin-bottom:15px;pointer-events:none}
    .admin-tools-card strong{font-size:22px;line-height:1.25;letter-spacing:-.6px;pointer-events:none}
    .admin-tools-card span{margin-top:10px;color:#64748b;font-size:14px;line-height:1.5;word-break:keep-all;pointer-events:none}
    .driver-manage-layer,.staff-manage-layer{z-index:60000!important;pointer-events:auto!important}
    .driver-modal-backdrop{z-index:70000!important;pointer-events:auto!important}
    .forced-password-layer{z-index:80000!important;pointer-events:auto!important}
    .admin-tools-notice{
      position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);
      z-index:90000;box-sizing:border-box;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:12px;
      background:#0f172a;color:#fff;box-shadow:0 8px 24px rgba(15,23,42,.24);font-size:15px;font-weight:800;
      line-height:1.35;text-align:center;white-space:nowrap;pointer-events:none
    }
    @media(max-width:390px){
      .admin-tools-grid{gap:11px;padding:16px 13px 24px}
      .admin-tools-card{min-height:174px;border-radius:17px;padding:16px 8px}
      .admin-tools-icon{font-size:43px;margin-bottom:13px}
      .admin-tools-card strong{font-size:20px}.admin-tools-card span{font-size:13px}
      .admin-tools-notice{font-size:14px;white-space:normal;width:max-content}
    }
  `;
  document.head.appendChild(style);

  function currentRole() {
    return document.querySelector('#app > .appbar')?.dataset.staffConsoleRole === 'admin'
      ? 'admin'
      : 'staff';
  }

  function notify(message) {
    document.querySelectorAll('.admin-tools-notice').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'admin-tools-notice';
    node.setAttribute('role', 'status');
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  function removeManagementLayers() {
    document.querySelectorAll('.driver-manage-layer,.staff-manage-layer').forEach((node) => node.remove());
  }

  function removeMenuLayer() {
    menuLayer?.remove();
    menuLayer = null;
  }

  function showMenuLayer() {
    if (menuLayer?.isConnected) menuLayer.hidden = false;
  }

  async function openManagement(kind, card) {
    const actions = window.EntryPassAdminActions || {};
    const action = kind === 'members' ? actions.openMembers : actions.openStaff;
    if (typeof action !== 'function') {
      notify('관리 기능을 준비하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.');
      return;
    }

    card.disabled = true;
    try {
      removeManagementLayers();
      const layer = await action();
      if (!layer || !layer.isConnected) throw new Error('관리 화면 생성 실패');
      history.pushState({ ...(history.state || {}), adminTools: 'management', adminToolKind: kind }, '');
      menuLayer.hidden = true;
    } catch {
      notify('관리 화면을 열지 못했습니다. 앱을 다시 실행해 주세요.');
    } finally {
      card.disabled = false;
    }
  }

  function buildMenu(role) {
    const isAdmin = role === 'admin';
    menuLayer = document.createElement('section');
    menuLayer.className = 'admin-tools-layer';
    menuLayer.dataset.role = role;
    menuLayer.setAttribute('aria-label', '관리자모드');
    menuLayer.innerHTML = `
      <header class="admin-tools-head"><h2>관리자모드</h2></header>
      <main class="admin-tools-grid">
        <button type="button" class="admin-tools-card" data-admin-tool="members">
          <div class="admin-tools-icon" aria-hidden="true">👥</div>
          <strong>회원관리</strong>
          <span>차량기사 회원 정보를<br>조회하고 관리합니다.</span>
        </button>
        <button type="button" class="admin-tools-card${isAdmin ? '' : ' restricted'}" data-admin-tool="staff" aria-disabled="${isAdmin ? 'false' : 'true'}">
          <div class="admin-tools-icon" aria-hidden="true">${isAdmin ? '🪪' : '🔒'}</div>
          <strong>직원관리</strong>
          <span>${isAdmin ? '직원 계정과 권한을<br>조회하고 관리합니다.' : '관리자 계정만<br>사용할 수 있습니다.'}</span>
        </button>
      </main>`;

    document.body.appendChild(menuLayer);
    const memberCard = menuLayer.querySelector('[data-admin-tool="members"]');
    const staffCard = menuLayer.querySelector('[data-admin-tool="staff"]');
    memberCard.onclick = () => openManagement('members', memberCard);
    staffCard.onclick = () => {
      if (!isAdmin) {
        notify('직원관리는 관리자 계정만 사용할 수 있습니다.');
        return;
      }
      openManagement('staff', staffCard);
    };
  }

  function openMenu() {
    if (opening) return;
    opening = true;
    try {
      const role = currentRole();
      if (menuLayer?.isConnected && menuLayer.dataset.role === role) {
        showMenuLayer();
        return;
      }

      document.querySelectorAll('.admin-tools-layer').forEach((node) => node.remove());
      removeManagementLayers();
      buildMenu(role);
      history.pushState({ ...(history.state || {}), adminTools: 'menu' }, '');
    } finally {
      opening = false;
    }
  }

  function handlePopState(event) {
    if (event.state?.adminTools === 'menu') {
      removeManagementLayers();
      showMenuLayer();
      return;
    }
    removeManagementLayers();
    removeMenuLayer();
  }

  window.addEventListener('entrypass:open-admin-tools', openMenu);
  window.addEventListener('popstate', handlePopState);
  window.EntryPassAdminMenu = Object.freeze({ open: openMenu });
})();
