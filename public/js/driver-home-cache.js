(() => {
  const REQUEST_CACHE_KEY = 'ep_my_requests_cache';

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function readRequests() {
    try {
      const value = JSON.parse(localStorage.getItem(REQUEST_CACHE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveRequests(requests) {
    if (!Array.isArray(requests)) return;
    try { localStorage.setItem(REQUEST_CACHE_KEY, JSON.stringify(requests)); } catch { /* noop */ }
  }

  function clearRequests() {
    try { localStorage.removeItem(REQUEST_CACHE_KEY); } catch { /* noop */ }
  }

  function formatVisitDate(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '출입일자 미정';
    const [year, month, day] = key.split('-');
    return `${year}. ${Number(month)}. ${Number(day)}`;
  }

  function isPastVisit(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return key < today;
  }

  function statusLabel(status) {
    if (status === 'approved') return '승인 완료';
    if (status === 'rejected') return '반려';
    return '승인 대기 중';
  }

  function cachedListHtml(requests) {
    if (!requests.length) return '<div class="empty">아직 신청 내역이 없습니다.</div>';
    return requests.map((request) => `
      <button class="mini-card ${isPastVisit(request.visitAt) ? 'visit-expired' : ''}" data-open="${esc(request.id)}" data-visit-refined="true">
        <div class="mc-top"><span class="veh">${esc(formatVisitDate(request.visitAt))}</span>
          <span class="status-pill ${esc(request.status)}">${statusLabel(request.status)}</span></div>
        <div class="meta">${esc(request.passNo)} · ${new Date(request.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      </button>`).join('');
  }

  function showCachedList() {
    const list = document.getElementById('myList');
    if (!list || list.dataset.cacheRendered === 'true') return;
    const requests = readRequests();
    if (!requests.length) return;
    list.className = '';
    list.innerHTML = cachedListHtml(requests);
    list.dataset.cacheRendered = 'true';
  }

  function normalizeRenderedList() {
    const list = document.getElementById('myList');
    if (!list) return;
    const requests = readRequests();
    if (!requests.length) return;
    const byId = new Map(requests.map((request) => [String(request.id), request]));
    list.querySelectorAll('.mini-card[data-open]').forEach((card) => {
      const request = byId.get(String(card.dataset.open));
      if (!request) return;
      const label = card.querySelector('.veh');
      if (label) label.textContent = formatVisitDate(request.visitAt);
      card.classList.toggle('visit-expired', isPastVisit(request.visitAt));
      card.dataset.visitRefined = 'true';
    });
  }

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await previousFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';

    if (/\/api\/my\/requests(?:\?|$)/.test(url) && response.ok) {
      try {
        const requests = await response.clone().json();
        saveRequests(requests);
      } catch { /* 기존 응답 유지 */ }
    } else if (/\/api\/requests(?:\?|$)/.test(url) && String(init.method || 'GET').toUpperCase() === 'POST' && response.ok) {
      clearRequests();
    } else if (/\/api\/auth\/logout(?:\?|$)/.test(url) && response.ok) {
      clearRequests();
    }

    return response;
  };

  const app = document.getElementById('app');
  if (!app) return;

  let scheduled = false;
  const apply = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      showCachedList();
      normalizeRenderedList();
    });
  };

  new MutationObserver(apply).observe(app, { childList: true, subtree: true });
  apply();
})();