(() => {
  const TOKEN_KEY = 'ep_token';
  let loading = false;
  let cachedCounts = null;

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function visitKeyFromMeta(text) {
    const match = String(text || '').match(/방문\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (!match) return '';
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  function activeTabId() {
    return document.querySelector('#app .tabs .tab.active')?.dataset.tab || '';
  }

  function updateTabCount(tabId, count) {
    const tab = document.querySelector(`#app .tabs .tab[data-tab="${tabId}"]`);
    const counter = tab?.querySelector('.cnt');
    if (counter) counter.textContent = String(count);
  }

  function filterCurrentList() {
    const tabId = activeTabId();
    if (tabId !== 'approved' && tabId !== 'rejected') return;

    const screen = document.querySelector('#app > .screen');
    if (!screen) return;

    const cards = [...screen.querySelectorAll('.mini-card[data-detail]')];
    let visible = 0;
    cards.forEach((card) => {
      const visitKey = visitKeyFromMeta(card.querySelector('.meta')?.textContent);
      const show = visitKey === todayKey();
      card.hidden = !show;
      card.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    screen.querySelector('.today-only-empty')?.remove();
    const originalEmpty = screen.querySelector('.empty:not(.today-only-empty)');
    if (originalEmpty) originalEmpty.style.display = visible ? 'none' : '';

    if (!visible && !originalEmpty) {
      const empty = document.createElement('div');
      empty.className = 'empty today-only-empty';
      empty.textContent = `오늘 ${tabId === 'approved' ? '승인' : '반려'}된 출입 신청이 없습니다.`;
      screen.appendChild(empty);
    }
  }

  async function refreshCounts() {
    if (loading) return;
    loading = true;
    try {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const response = await fetch('/api/requests', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return;
      const requests = await response.json();
      if (!Array.isArray(requests)) return;
      const today = todayKey();
      cachedCounts = {
        approved: requests.filter((request) => request.status === 'approved' && String(request.visitAt || '').slice(0, 10) === today).length,
        rejected: requests.filter((request) => request.status === 'rejected' && String(request.visitAt || '').slice(0, 10) === today).length,
      };
    } catch { /* 기존 화면 유지 */ }
    finally { loading = false; }
  }

  function applyCounts() {
    if (!cachedCounts) return;
    updateTabCount('approved', cachedCounts.approved);
    updateTabCount('rejected', cachedCounts.rejected);
  }

  async function apply() {
    const tabs = document.querySelector('#app .tabs');
    if (!tabs) return;
    if (!cachedCounts) await refreshCounts();
    applyCounts();
    filterCurrentList();
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

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  window.addEventListener('focus', () => {
    cachedCounts = null;
    schedule();
  });
  schedule();
})();
