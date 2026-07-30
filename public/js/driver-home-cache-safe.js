(() => {
  const TOKEN_KEY = 'ep_token';
  const USER_CACHE_KEY = 'ep_user_cache';
  const CACHE_KEY = 'ep_my_requests_cache_safe';

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>\"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[ch]));

  function readUser() {
    try { return JSON.parse(localStorage.getItem(USER_CACHE_KEY) || 'null'); } catch { return null; }
  }

  function readCache() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return value && Array.isArray(value.requests) ? value : null;
    } catch {
      return null;
    }
  }

  function saveCache(loginId, requests) {
    if (!loginId || !Array.isArray(requests)) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ loginId, requests })); } catch { /* noop */ }
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

  function listHtml(requests) {
    if (!requests.length) return '<div class="empty">아직 신청 내역이 없습니다.</div>';
    return requests.map((request) => `
      <button class="mini-card ${isPastVisit(request.visitAt) ? 'visit-expired' : ''}" data-open="${esc(request.id)}" data-cache-card="true" data-visit-refined="true">
        <div class="mc-top"><span class="veh">${esc(formatVisitDate(request.visitAt))}</span>
          <span class="status-pill ${esc(request.status)}">${statusLabel(request.status)}</span></div>
        <div class="meta">${esc(request.passNo)} · ${new Date(request.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      </button>`).join('');
  }

  function matchingCache() {
    const user = readUser();
    const cache = readCache();
    if (!user?.loginId || !cache || cache.loginId !== user.loginId) return null;
    return cache.requests;
  }

  function renderCachedImmediately() {
    const list = document.getElementById('myList');
    if (!list) return;
    const requests = matchingCache();
    if (!requests) return;

    const currentlyLoading = list.textContent?.includes('불러오는 중');
    if (currentlyLoading) {
      list.className = '';
      list.innerHTML = listHtml(requests);
    }
  }

  function normalizeCurrentList() {
    const list = document.getElementById('myList');
    const requests = matchingCache();
    if (!list || !requests?.length) return;
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

  function bridgeCachedClicks() {
    const list = document.getElementById('myList');
    if (!list || list.dataset.cacheClickBound === 'true') return;
    list.dataset.cacheClickBound = 'true';
    list.addEventListener('click', (event) => {
      const card = event.target.closest('[data-cache-card="true"]');
      if (!card) return;
      event.preventDefault();
      const id = card.dataset.open;
      let attempts = 0;
      const openWhenReady = () => {
        const live = document.querySelector(`#myList .mini-card[data-open="${CSS.escape(id)}"]:not([data-cache-card="true"])`);
        if (live) return live.click();
        if (++attempts < 15) setTimeout(openWhenReady, 50);
      };
      openWhenReady();
    });
  }

  async function refreshCache() {
    const list = document.getElementById('myList');
    const user = readUser();
    const token = localStorage.getItem(TOKEN_KEY);
    if (!list || !user?.loginId || !token || list.dataset.cacheRefreshStarted === 'true') return;
    list.dataset.cacheRefreshStarted = 'true';
    try {
      const response = await fetch('/api/my/requests', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const requests = await response.json();
      saveCache(user.loginId, requests);
      normalizeCurrentList();
    } catch { /* 기존 앱의 조회 결과를 그대로 사용 */ }
  }

  function apply() {
    renderCachedImmediately();
    normalizeCurrentList();
    bridgeCachedClicks();
    refreshCache();
  }

  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver(apply).observe(app, { childList: true, subtree: true });
  apply();
})();
