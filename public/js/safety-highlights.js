(() => {
  const REQUIRED_HIGHLIGHTS = {
    '1': ['안전모', '안전화'],
    '2': ['시동 정지', '파킹브레이크', '고임목'],
    '3': ['작업반경 내 출입 금지'],
    '5': ['안전대', '안전고리'],
    '7': ['작업계획서', 'TBM'],
    '8': ['아웃트리거'],
    '9': ['해지장치'],
  };

  const OTHER_HIGHLIGHTS = {
    '1': ['20km'],
    '2': ['일단정지'],
    '5': ['운전면허증, 화물운송종사자격증 소지'],
  };

  const VEHICLE_ICONS = {
    '물자수송용역 차량': '🚛',
    '공사업체 차량': '🏗️',
    '기자재 납품차량': '🚚',
    '불용품 매각차량': '♻️',
    'PCBs처리용역 차량': '☣️',
  };

  const VEHICLE_TYPE_LABELS = {
    transport: '물자수송용역',
    construction: '공사업체',
    delivery: '기자재 납품',
    scrap: '불용품 매각',
    pcbs: 'PCBs처리용역',
  };

  const VEHICLE_TYPE_IMAGES = {
    transport: '/images/type-transport-flatbed.svg',
    construction: '/images/type-construction-crane-truck.svg',
  };

  function appendHighlightedText(target, text, phrases, breakAfter) {
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

    if (breakAfter) {
      const nodes = [...target.childNodes];
      const fullText = target.textContent || '';
      const breakIndex = fullText.indexOf(breakAfter) + breakAfter.length;
      if (breakIndex > breakAfter.length - 1) {
        let count = 0;
        for (const node of nodes) {
          const length = node.textContent?.length || 0;
          if (count + length >= breakIndex) {
            const localIndex = breakIndex - count;
            if (node.nodeType === Node.TEXT_NODE && localIndex < length) {
              const remainder = node.splitText(localIndex);
              target.insertBefore(document.createElement('br'), remainder);
            } else {
              target.insertBefore(document.createElement('br'), node.nextSibling);
            }
            break;
          }
          count += length;
        }
      }
    }
  }

  function applySafetyHighlights() {
    document.querySelectorAll('.rule-list li').forEach((item) => {
      if (item.dataset.highlighted === 'true') return;

      const number = item.querySelector('.n')?.textContent?.trim();
      const textElement = item.querySelector('.n + span');
      const card = item.closest('.card');
      const isOther = !!card?.querySelector('.rules-head-inline.other');
      const phrases = (isOther ? OTHER_HIGHLIGHTS : REQUIRED_HIGHLIGHTS)[number];
      if (!textElement || !phrases) return;

      const text = textElement.textContent || '';
      textElement.replaceChildren();
      appendHighlightedText(
        textElement,
        text,
        phrases,
        !isOther && number === '9' ? '고정장치 확인,' : null,
      );
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

  function normalizeVehicleTypeScreen() {
    const grid = document.querySelector('#app .type-grid');
    if (!grid || grid.dataset.vehicleGridNormalized === 'true') return;

    const appbar = document.querySelector('#app > .appbar');
    if (appbar?.querySelector('h1')?.textContent?.trim() === '차량 유형 선택') {
      appbar.querySelector('.sub')?.remove();
      appbar.classList.add('vehicle-type-appbar');
    }

    grid.classList.add('vehicle-type-grid-refined');

    grid.querySelectorAll('.type-card[data-type]').forEach((card) => {
      const typeId = card.dataset.type;
      const iconBox = card.querySelector('.ico');
      const name = card.querySelector('.tn');

      card.classList.add('vehicle-type-card-refined');
      card.style.removeProperty('--tc');

      if (name && VEHICLE_TYPE_LABELS[typeId]) name.textContent = VEHICLE_TYPE_LABELS[typeId];

      if (iconBox && VEHICLE_TYPE_IMAGES[typeId]) {
        const image = document.createElement('img');
        image.className = 'vehicle-type-image';
        image.src = VEHICLE_TYPE_IMAGES[typeId];
        image.alt = VEHICLE_TYPE_LABELS[typeId] || '';
        iconBox.replaceChildren(image);
      }
    });

    grid.dataset.vehicleGridNormalized = 'true';
  }

  function normalizeSafetyNotice() {
    const screen = document.querySelector('#app > .steps + .screen');
    const notice = screen?.querySelector(':scope > .rules-head');
    const card = screen?.querySelector(':scope > .card');
    const list = card?.querySelector('.rule-list');
    if (!notice || !card || !list || card.dataset.noticeMoved === 'true') return;

    const isRequired = notice.classList.contains('req');
    notice.textContent = isRequired ? '위반시 “안전지도서” 발행' : '위반시 “안전계도서” 발행';
    notice.classList.add('rules-head-inline');
    card.insertBefore(notice, list);
    card.dataset.noticeMoved = 'true';
  }

  function normalizeAgreementText() {
    const agreeText = document.querySelector('#agreeChk + span');
    if (!agreeText || agreeText.dataset.normalized === 'true') return;

    agreeText.replaceChildren(
      document.createTextNode('위 '),
      makeEmphasis('안전수칙'),
      document.createTextNode('을 모두 '),
      makeEmphasis('확인'),
      document.createTextNode('하였으며,'),
      document.createElement('br'),
      document.createTextNode('이를 준수할 것에 '),
      makeEmphasis('동의'),
      document.createTextNode('합니다.'),
    );
    agreeText.dataset.normalized = 'true';
  }

  function makeEmphasis(text) {
    const strong = document.createElement('strong');
    strong.className = 'agreement-highlight';
    strong.textContent = text;
    return strong;
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
    normalizeVehicleTypeScreen();
    normalizeSafetyNotice();
    normalizeAgreementText();
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