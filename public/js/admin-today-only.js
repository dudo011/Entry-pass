(() => {
  const TOKEN_KEY = 'ep_token';
  const WORKFLOW_LABEL = {
    pending: '승인대기',
    safety_pending: '안전수칙',
    photo_pending: '현장사진',
    completed: '최종완료',
    rejected: '반려',
  };

  let loading = false;
  let cachedRecords = [];
  let recordsById = new Map();
  let lastRefreshAt = 0;

  const style = document.createElement('style');
  style.textContent = `
    #app .status-pill.safety_pending{background:#dbeafe!important;color:#1d4ed8!important}
    #app .status-pill.photo_pending{background:#ede9fe!important;color:#6d28d9!important}
    #app .status-pill.completed{background:#dcfce7!important;color:#166534!important}
  `;
  document.head.appendChild(style);

  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function visitKey(record) {
    return String(record?.visitAt || '').slice(0, 10);
  }

  function visitKeyFromMeta(text) {
    const match = String(text || '').match(/방문\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (!match) return '';
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  function workflow(record) {
    return String(record?.workflowStatus || record?.status || '');
  }

  function isCompanyApprovedInProgress(record) {
    if (!record?.companyFlow) return record?.status === 'approved';
    const value = workflow(record);
    return value === 'safety_pending' || value === 'photo_pending';
  }

  function activeTabId() {
    return document.querySelector('#app .tabs .tab.active')?.dataset.tab || '';
  }

  function updateTabCount(tabId, count) {
    const tab = document.querySelector(`#app .tabs .tab[data-tab="${tabId}"]`);
    const counter = tab?.querySelector('.cnt');
    if (counter) counter.textContent = String(count);
  }

  function applyCounts() {
    if (!cachedRecords.length && !lastRefreshAt) return;
    const today = todayKey();
    updateTabCount('pending', cachedRecords.filter((request) => request.status === 'pending').length);
    updateTabCount('approved', cachedRecords.filter((request) =>
      visitKey(request) === today && isCompanyApprovedInProgress(request)).length);
    updateTabCount('rejected', cachedRecords.filter((request) =>
      request.status === 'rejected' && visitKey(request) === today).length);
  }

  function decorateWorkflowCards() {
    document.querySelectorAll('#app .mini-card[data-detail]').forEach((card) => {
      const record = recordsById.get(String(card.dataset.detail || ''));
      if (!record?.companyFlow) return;

      const value = workflow(record);
      const pill = card.querySelector('.status-pill');
      if (!pill || !WORKFLOW_LABEL[value]) return;

      pill.textContent = WORKFLOW_LABEL[value];
      pill.classList.remove('pending', 'approved', 'rejected', 'safety_pending', 'photo_pending', 'completed');
      pill.classList.add(value);
    });
  }

  function filterCurrentList() {
    const tabId = activeTabId();
    if (tabId !== 'approved' && tabId !== 'rejected') return;

    const screen = document.querySelector('#app > .screen');
    if (!screen) return;

    const today = todayKey();
    const cards = [...screen.querySelectorAll('.mini-card[data-detail]')];
    let visible = 0;

    cards.forEach((card) => {
      const record = recordsById.get(String(card.dataset.detail || ''));
      let show;
      if (record) {
        show = visitKey(record) === today && (tabId === 'approved'
          ? isCompanyApprovedInProgress(record)
          : record.status === 'rejected');
      } else {
        const visit = visitKeyFromMeta(card.querySelector('.meta')?.textContent);
        show = visit === today;
      }
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
      empty.textContent = tabId === 'approved'
        ? '오늘 승인 진행 중인 출입 신청이 없습니다.'
        : '오늘 반려된 출입 신청이 없습니다.';
      screen.appendChild(empty);
    }
  }

  async function refreshRecords(force = false) {
    if (loading) return;
    if (!force && Date.now() - lastRefreshAt < 4500) return;
    loading = true;
    try {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      const response = await fetch('/api/requests', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      if (!response.ok) return;
      const requests = await response.json();
      if (!Array.isArray(requests)) return;
      cachedRecords = requests;
      recordsById = new Map(requests.map((request) => [String(request.id || ''), request]));
      lastRefreshAt = Date.now();
    } catch { /* 기존 화면 유지 */ }
    finally { loading = false; }
  }

  async function apply(forceRefresh = false) {
    const tabs = document.querySelector('#app .tabs');
    if (!tabs) return;
    await refreshRecords(forceRefresh);
    applyCounts();
    decorateWorkflowCards();
    filterCurrentList();
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = (forceRefresh = false) => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void apply(forceRefresh);
    });
  };

  new MutationObserver(() => schedule(false)).observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('focus', () => schedule(true));
  setInterval(() => schedule(true), 5000);
  schedule(true);
})();
