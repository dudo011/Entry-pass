(() => {
  const FLOW_ICON_IMAGES = {
    '🚛': '/images/type-transport-flatbed.svg',
    '🏗️': '/images/type-construction-crane-truck.svg',
  };

  function buildSteps(total, completed) {
    const steps = document.createElement('div');
    steps.className = 'steps application-flow-steps';
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement('div');
      dot.className = `dot ${i < completed ? 'done' : ''}`;
      steps.append(dot);
    }
    return steps;
  }

  function normalizeVehicleTypeProgress() {
    const grid = document.querySelector('#app .vehicle-type-grid-refined');
    if (!grid) return;

    const appbar = document.querySelector('#app > .appbar');
    if (!appbar || appbar.nextElementSibling?.classList.contains('application-flow-steps')) return;

    const defaultCard = grid.querySelector('.type-card:has(.my-tag)');
    const typeId = defaultCard?.dataset.type || 'transport';
    const total = typeId === 'construction' || typeId === 'pcbs' ? 6 : 5;
    appbar.insertAdjacentElement('afterend', buildSteps(total, 1));
  }

  function normalizeExistingProgress() {
    const steps = document.querySelector('#app > .steps:not(.application-flow-steps)');
    if (!steps || steps.dataset.includesVehicleType === 'true') return;

    const first = document.createElement('div');
    first.className = 'dot done';
    steps.prepend(first);
    steps.dataset.includesVehicleType = 'true';
  }

  function normalizeFlowHeaderIcon() {
    const icon = document.querySelector('#app > .appbar .vehicle-appbar-icon');
    if (!icon || icon.dataset.imageNormalized === 'true') return;

    const src = FLOW_ICON_IMAGES[icon.textContent?.trim() || ''];
    if (!src) return;

    const image = document.createElement('img');
    image.className = 'flow-header-vehicle-image';
    image.src = src;
    image.alt = '';
    icon.replaceChildren(image);
    icon.dataset.imageNormalized = 'true';
  }

  function normalizeRouteScreen() {
    const heading = document.querySelector('#app > .appbar h1')?.textContent?.trim();
    if (heading !== '차량 동선 안내') return;

    const screen = document.querySelector('#app > .steps + .screen');
    if (!screen || screen.dataset.routePlaceholder === 'true') return;

    const cta = screen.querySelector(':scope > .sticky-cta');
    screen.querySelectorAll(':scope > :not(.sticky-cta)').forEach((element) => element.remove());

    const placeholder = document.createElement('div');
    placeholder.className = 'route-placeholder card';
    placeholder.textContent = '수정중';
    screen.insertBefore(placeholder, cta || null);
    screen.dataset.routePlaceholder = 'true';
  }

  function normalizeApplicationForm() {
    const heading = document.querySelector('#app > .appbar h1')?.textContent?.trim();
    if (heading !== '출입 신청') return;

    const screen = document.querySelector('#app > .steps + .screen');
    if (!screen || screen.dataset.formMerged === 'true') return;

    const sectionTitles = [...screen.querySelectorAll(':scope > .section-title')];
    const cards = [...screen.querySelectorAll(':scope > .card')];
    if (!cards.length) return;

    sectionTitles.forEach((title) => title.remove());

    const mergedCard = cards[0];
    mergedCard.classList.add('application-form-card');
    cards.slice(1).forEach((card) => {
      while (card.firstChild) mergedCard.append(card.firstChild);
      card.remove();
    });

    mergedCard.querySelectorAll('.doc-item').forEach((item) => {
      const uploadArea = item.querySelector('.up');
      const formButton = item.querySelector('.form-fill, .form-dl');
      if (uploadArea && formButton && !uploadArea.contains(formButton)) {
        uploadArea.insertBefore(formButton, uploadArea.firstChild);
      }
    });

    screen.dataset.formMerged = 'true';
  }

  function apply() {
    normalizeVehicleTypeProgress();
    normalizeExistingProgress();
    normalizeFlowHeaderIcon();
    normalizeRouteScreen();
    normalizeApplicationForm();
  }

  const app = document.getElementById('app');
  if (!app) return;

  const observer = new MutationObserver(apply);
  observer.observe(app, { childList: true, subtree: true, characterData: true });
  apply();
})();