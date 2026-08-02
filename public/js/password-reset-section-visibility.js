(() => {
  const HIDDEN_SELECTOR = '.password-request-section';

  function updateSection(section) {
    const list = section.querySelector('[data-password-requests]');
    const heading = section.querySelector('h3');
    const itemCount = list?.querySelectorAll('.password-request-item').length || 0;
    const headingMatch = heading?.textContent?.match(/(\d+)\s*건/);
    const reportedCount = headingMatch ? Number(headingMatch[1]) : null;
    const message = list?.textContent?.trim() || '';
    const loading = message.includes('불러오는 중');
    const empty = reportedCount === 0
      || message.includes('대기 중인 비밀번호 발급 요청이 없습니다');
    const visible = itemCount > 0 || (reportedCount !== null && reportedCount > 0)
      || (!loading && !empty && message.length > 0);

    section.hidden = !visible;
    section.setAttribute('aria-hidden', visible ? 'false' : 'true');
    section.dataset.requestCount = String(reportedCount ?? itemCount);
  }

  function refresh() {
    document.querySelectorAll(HIDDEN_SELECTOR).forEach(updateSection);
  }

  const style = document.createElement('style');
  style.textContent = '.password-request-section[hidden]{display:none!important}';
  document.head.appendChild(style);

  new MutationObserver(refresh).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  refresh();
})();
