(() => {
  const TOKEN_KEY = 'ep_token';
  const REQUEST_CACHE_KEY = 'ep_my_requests_session';
  const HOME_CACHE_KEY = 'ep_my_requests_token_cache';

  const style = document.createElement('style');
  style.textContent = `
    #app > .appbar .driver-result-edit{margin-left:auto!important}
    #app > .appbar .driver-result-delete{
      position:static!important;transform:none!important;margin-left:4px!important;
      color:#dc2626!important;font-weight:700!important
    }
  `;
  document.head.appendChild(style);

  function readRequests() {
    try {
      const session = JSON.parse(sessionStorage.getItem(REQUEST_CACHE_KEY) || '[]');
      if (Array.isArray(session) && session.length) return session;
      const home = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
      return Array.isArray(home?.requests) ? home.requests : [];
    } catch { return []; }
  }

  function normalize(value) {
    return String(value || '').replace(/\s/g, '').replace(/[.년월일()-]/g, '');
  }

  function findPendingRequest() {
    const screen = document.querySelector('#app .driver-result-refined-screen');
    if (!screen) return null;
    const details = [...screen.querySelectorAll('.result-detail')].map((node) => node.textContent?.trim() || '');
    if (details.length < 3) return null;
    const [vehicleNumber, visitDate, company] = details;
    return readRequests().find((request) =>
      request.status === 'pending' &&
      normalize(request.vehicleNumber) === normalize(vehicleNumber) &&
      normalize(String(request.visitAt || '').slice(0, 10)) === normalize(visitDate) &&
      normalize(request.company || '-') === normalize(company || '-')) || null;
  }

  function removeFromCaches(id) {
    const filtered = readRequests().filter((request) => String(request.id) !== String(id));
    try {
      sessionStorage.setItem(REQUEST_CACHE_KEY, JSON.stringify(filtered));
      localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
        token: localStorage.getItem(TOKEN_KEY) || '',
        requests: filtered,
      }));
    } catch { /* noop */ }
  }

  function toast(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  async function deleteRequest(request, button) {
    if (!window.confirm('이 출입 신청을 삭제하시겠습니까?\n삭제한 신청은 복구할 수 없습니다.')) return;
    button.disabled = true;
    button.textContent = '삭제 중…';
    try {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const response = await fetch(`/api/requests/${encodeURIComponent(request.id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '삭제하지 못했습니다.');
      removeFromCaches(request.id);
      toast('출입 신청이 삭제되었습니다.');
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      button.disabled = false;
      button.textContent = '삭제';
      toast(error.message);
    }
  }

  function apply() {
    const appbar = document.querySelector('#app > .appbar');
    const edit = appbar?.querySelector('.driver-result-edit');
    if (!appbar || !edit || appbar.querySelector('.driver-result-delete')) return;
    const request = findPendingRequest();
    if (!request) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-btn driver-result-delete';
    button.textContent = '삭제';
    button.onclick = () => deleteRequest(request, button);
    edit.insertAdjacentElement('afterend', button);
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
