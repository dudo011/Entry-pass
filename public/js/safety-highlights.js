(() => {
  const HIGHLIGHTS = {
    '1': ['안전모', '안전화'],
    '2': ['시동 정지', '파킹브레이크', '고임목'],
    '3': ['작업반경 내 출입 금지'],
    '5': ['안전대', '안전고리'],
  };

  const VEHICLE_ICONS = {
    '물자수송용역 차량': '🚛',
    '공사업체 차량': '🏗️',
    '기자재 납품차량': '🚚',
    '불용품 매각차량': '♻️',
    'PCBs처리용역 차량': '☣️',
  };

  function appendHighlightedText(target, text, phrases) {
    let cursor = 0;
    const matches = [];

    phrases.forEach((phrase) => {
      const index = text.indexOf(phrase);
      if (index >= 0) matches.push({ index, phrase });
    });

    matches.sort((a, b) => a.index - b.index);

    matches.forEach(({ index, phrase }) => {
      if (index < cursor) return;
      if (index > cursor) target.append(document.createTextNode(text.slice(cursor, index)));

      const strong = document.createElement('strong');
      strong.className = 'rule-highlight';
      strong.textContent = phrase;
      target.append(strong);
      cursor = index + phrase.length;
    });

    if (cursor < text.length) target.append(document.createTextNode(text.slice(cursor)));
  }

  function applySafetyHighlights() {
    document.querySelectorAll('.rule-list li').forEach((item) => {
      if (item.dataset.highlighted === 'true') return;

      const number = item.querySelector('.n')?.textContent?.trim();
      const textElement = item.querySelector('.n + span');
      const phrases = HIGHLIGHTS[number];
      if (!textElement || !phrases) return;

      const text = textElement.textContent || '';
      textElement.replaceChildren();
      appendHighlightedText(textElement, text, phrases);
      item.dataset.highlighted = 'true';
    });
  }

  function applyRequiredSafetyHeader() {
    const requiredHead = document.querySelector('.steps + .screen > .rules-head.req');
    const appbar = document.querySelector('#app > .appbar');
    if (!requiredHead || !appbar || appbar.dataset.safetyCompact === 'true') return;

    const vehicleName = appbar.querySelector('h1')?.textContent?.trim() || '';
    const icon = VEHICLE_ICONS[vehicleName] || '🚚';

    const title = document.createElement('div');
    title.className = 'safety-appbar-title';

    const iconElement = document.createElement('span');
    iconElement.className = 'safety-appbar-icon';
    iconElement.setAttribute('aria-hidden', 'true');
    iconElement.textContent = icon;

    const textElement = document.createElement('h1');
    textElement.textContent = '필수 안전수칙';

    title.append(iconElement, textElement);
    appbar.replaceChildren(title);
    appbar.classList.add('safety-compact-appbar');
    appbar.dataset.safetyCompact = 'true';
  }

  function applySafetyEnhancements() {
    applySafetyHighlights();
    applyRequiredSafetyHeader();
  }

  const app = document.getElementById('app');
  if (!app) return;

  const observer = new MutationObserver(applySafetyEnhancements);
  observer.observe(app, { childList: true, subtree: true });
  applySafetyEnhancements();
})();