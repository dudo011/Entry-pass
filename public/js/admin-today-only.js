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
  let completedMode = false;

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

  function isTodayCompleted(record) {
    return !!record?.companyFlow
      && workflow(record) === 'completed'
      && visitKey(record) === todayKey();
  }

  function setTabLabel(tab, label) {
    if (!tab) return;
    const textNode = [...tab.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    // 값이 같으면 다시 쓰지 않는다(멱등) — 자기 변경으로 옵저버 재발화 루프 방지.
    if (textNode && textNode.textContent !== `${label} `) textNode.textContent = `${label} `;
  }

  function prepareTabs() {
    const tabs = document.querySelector('#app .tabs');
    if (!tabs) return null;

    const activeBeforePrepare = tabs.querySelector('.tab.active');

    let completedTab = tabs.querySelector('.tab[data-workflow-tab="completed"]');
    if (!completedTab) {
      completedTab = tabs.querySelector('.tab[data-tab="rejected"]');
      if (completedTab) {
        completedTab.dataset.workflowTab = 'completed';
        /* 기존 코어의 승인 목록 렌더링을 재사용해 상세 클릭 기능을 그대로 유지한다. */
        completedTab.dataset.tab = 'approved';
      }
    }
    setTabLabel(completedTab, '완료');

    const approvedTabs = [...tabs.querySelectorAll('.tab[data-tab="approved"]')];
    const approvedTab = approvedTabs.find((tab) => tab.dataset.workflowTab !== 'completed') || null;

    /* 코어가 통계/대기/승인을 활성화해 다시 렌더링했다면 완료 모드를 즉시 해제한다. */
    if (activeBeforePrepare && activeBeforePrepare !== completedTab
      && activeBeforePrepare.dataset.workflowTab !== 'completed') {
      completedMode = false;
    }

    // active 클래스는 상태가 바뀔 때만 토글한다(멱등) — 매번 remove+add 하면
    // 코어의 활성 탭 관리와 60fps 클래스 토글 전쟁이 되어 화면이 멈춘다.
    if (completedMode && completedTab) {
      tabs.querySelectorAll('.tab').forEach((tab) => {
        const shouldActive = tab === completedTab;
        if (tab.classList.contains('active') !== shouldActive) tab.classList.toggle('active', shouldActive);
      });
    } else if (completedTab && completedTab.classList.contains('active')) {
      completedTab.classList.remove('active');
    }

    return { tabs, approvedTab, completedTab };
  }

  function updateCounter(tab, count) {
    const counter = tab?.querySelector('.cnt');
    // 값이 같으면 다시 쓰지 않는다(자기 변경으로 MutationObserver를 재발화시키는 루프 방지).
    if (counter && counter.textContent !== String(count)) counter.textContent = String(count);
  }

  function updateTabCount(tabId, count) {
    const tab = document.querySelector(`#app .tabs .tab[data-tab="${tabId}"]:not([data-workflow-tab="completed"])`);
    updateCounter(tab, count);
  }

  function applyCounts(tabInfo) {
    if (!cachedRecords.length && !lastRefreshAt) return;
    const today = todayKey();
    updateTabCount('pending', cachedRecords.filter((request) => request.status === 'pending').length);
    updateCounter(tabInfo?.approvedTab, cachedRecords.filter((request) =>
      visitKey(request) === today && isCompanyApprovedInProgress(request)).length);
    updateCounter(tabInfo?.completedTab, cachedRecords.filter(isTodayCompleted).length);
  }

  function decorateWorkflowCards() {
    document.querySelectorAll('#app .mini-card[data-detail]').forEach((card) => {
      const record = recordsById.get(String(card.dataset.detail || ''));
      if (!record?.companyFlow) return;

      const value = workflow(record);
      const pill = card.querySelector('.status-pill');
      if (!pill || !WORKFLOW_LABEL[value]) return;

      if (pill.textContent !== WORKFLOW_LABEL[value]) pill.textContent = WORKFLOW_LABEL[value];
      if (!pill.classList.contains(value)) {
        pill.classList.remove('pending', 'approved', 'rejected', 'safety_pending', 'photo_pending', 'completed');
        pill.classList.add(value);
      }
    });
  }

  function filterCurrentList() {
    const active = document.querySelector('#app .tabs .tab.active');
    if (!active || active.dataset.tab !== 'approved') return;

    const screen = document.querySelector('#app > .screen');
    if (!screen) return;

    const today = todayKey();
    const cards = [...screen.querySelectorAll('.mini-card[data-detail]')];
    let visible = 0;

    cards.forEach((card) => {
      const record = recordsById.get(String(card.dataset.detail || ''));
      let show = false;
      if (record) {
        show = completedMode
          ? isTodayCompleted(record)
          : visitKey(record) === today && isCompanyApprovedInProgress(record);
      } else if (!completedMode) {
        const visit = visitKeyFromMeta(card.querySelector('.meta')?.textContent);
        show = visit === today;
      }
      // 값이 바뀔 때만 쓴다(멱등) — 자기 변경으로 옵저버를 재발화시키는 루프 방지.
      if (card.hidden !== !show) card.hidden = !show;
      const disp = show ? '' : 'none';
      if (card.style.display !== disp) card.style.display = disp;
      if (show) visible += 1;
    });

    const injected = screen.querySelector('.today-only-empty');
    const originalEmpty = screen.querySelector('.empty:not(.today-only-empty)');
    const emptyText = completedMode
      ? '오늘 최종완료된 출입 신청이 없습니다.'
      : '오늘 승인 진행 중인 출입 신청이 없습니다.';

    if (originalEmpty) {
      if (injected) injected.remove();
      if (originalEmpty.textContent !== emptyText) originalEmpty.textContent = emptyText;
      const disp = visible ? 'none' : '';
      if (originalEmpty.style.display !== disp) originalEmpty.style.display = disp;
    } else if (!visible) {
      if (!injected) {
        const empty = document.createElement('div');
        empty.className = 'empty today-only-empty';
        empty.textContent = emptyText;
        screen.appendChild(empty);
      } else if (injected.textContent !== emptyText) {
        injected.textContent = emptyText;
      }
    } else if (injected) {
      injected.remove();
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
    const tabInfo = prepareTabs();
    if (!tabInfo) return;
    await refreshRecords(forceRefresh);
    applyCounts(tabInfo);
    decorateWorkflowCards();
    filterCurrentList();
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  let lastApplyAt = 0;
  const MIN_APPLY_GAP = 500; // 재적용 최소 간격(ms). 잔여 변경이 있어도 60fps 폭주로 화면이 멈추지 않게 하는 안전장치.
  const schedule = (forceRefresh = false) => {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      lastApplyAt = Date.now();
      void apply(forceRefresh);
    };
    const wait = Math.max(0, MIN_APPLY_GAP - (Date.now() - lastApplyAt));
    // 마지막 적용 후 충분히 지났으면 다음 프레임에, 아니면 남은 간격만큼 지연.
    if (wait === 0) requestAnimationFrame(run);
    else setTimeout(run, wait);
  };

  /* 완료 탭 외의 어떤 탭을 눌러도 완료 모드는 즉시 해제한다. */
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('#app .tabs .tab');
    if (!tab) return;
    completedMode = tab.dataset.workflowTab === 'completed';
  }, true);

  new MutationObserver(() => schedule(false)).observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('focus', () => schedule(true));
  setInterval(() => schedule(true), 5000);
  schedule(true);
})();
