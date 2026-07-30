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

  function normalizeAppbar() {
    const appbar = document.querySelector('#app > .appbar');
    if (!appbar || appbar.dataset.uiNormalized === 'true') return;

    appbar.querySelector('.back')?.remove();

    const originalTitle = appbar.querySelector('h1')?.textContent?.trim() || '';
    const originalSub = appbar.querySelector('.sub')?.textContent?.trim() || '';
    const vehicleIcon = VEHICLE_ICONS[originalTitle];

    if (vehicleIcon && originalSub) {
      const logoutButton = appbar.querySelector('[data-logout]');
      const title = document.createElement('div');
      title.className = 'vehicle-appbar-title';

      const icon = document.createElement('span');
      icon.className = 'vehicle-appbar-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = vehicleIcon;

      const heading = document.createElement('h1');
      heading.textContent = originalSub;
      title.append(icon, heading);

      appbar.replaceChildren(title);
      if (logoutButton) appbar.append(logoutButton);
      appbar.classList.add('vehicle-flow-appbar');
    }

    appbar.dataset.uiNormalized = 'true';
  }

  function normalizeSafetyNotice() {
    const screen = document.querySelector('#app > .steps + .screen');
    const notice = screen?.querySelector(':scope > .rules-head');
    const card = screen?.querySelector(':scope > .card');
    const list = card?.querySelector('.rule-list');
    if (!notice || !card || !list || card.dataset.noticeMoved === 'true') return;

    const isRequired = notice.classList.contains('req');
    notice.textContent = isRequired ? '위반시 안전지도서 발행' : '위반시 안전계도서 발행';
    notice.classList.add('rules-head-inline');
    card.insertBefore(notice, list);
    card.dataset.noticeMoved = 'true';
  }

  function suppressPasswordManagerWarning() {
    document.querySelectorAll('#a_password, #a_password2').forEach((input) => {
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('data-lpignore', 'true');
      input.setAttribute('data-1p-ignore', 'true');
    });
  }

  function normalizeProfileFields() {
    ['p_name', 'p_phone', 'p_vtype'].forEach((id) => {
      const field = document.getElementById(id)?.closest('label.field');
      if (field) field.classList.add('field-h', 'profile-field-h');
    });
  }

  function applyUiEnhancements() {
    normalizeAppbar();
    normalizeSafetyNotice();
    applySafetyHighlights();
    suppressPasswordManagerWarning();
    normalizeProfileFields();
  }

  const app = document.getElementById('app');
  if (!app) return;

  const observer = new MutationObserver(applyUiEnhancements);
  observer.observe(app, { childList: true, subtree: true });
  applyUiEnhancements();
})();