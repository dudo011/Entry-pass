(() => {
  const FLOW_TITLES = [
    /^차량 유형 선택$/,
    /^필수 안전수칙(?: \(\d+\/\d+\))?$/,
    /^기타 안전수칙$/,
    /^차량 동선 안내$/,
    /^신청 정보 및 서류$/,
    /^출입 신청 정보$/,
    /^출입 신청$/,
    /^출입신청서 제출$/,
  ];

  function normalizeFlowHeader() {
    const appbar = document.querySelector('#app > .appbar');
    if (!appbar) return;

    const heading = appbar.querySelector('h1');
    if (!heading) return;

    const title = heading.textContent?.trim() || '';

    if (title === '신청 정보 및 서류' || title === '출입 신청 정보' || title === '출입 신청') {
      heading.textContent = '출입신청서 제출';
    }

    const normalizedTitle = heading.textContent?.trim() || '';
    if (FLOW_TITLES.some((pattern) => pattern.test(normalizedTitle))) {
      appbar.classList.add('application-flow-appbar');
    }
  }

  const app = document.getElementById('app');
  if (!app) return;

  const observer = new MutationObserver(normalizeFlowHeader);
  observer.observe(app, { childList: true, subtree: true, characterData: true });
  normalizeFlowHeader();
})();