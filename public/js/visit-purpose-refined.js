(() => {
  const LABELS = {
    construction: ['공사업체', '(자재 환입 및 수령)'],
    pickup: ['공사업체', '(자재 수령)'],
    transport: ['물자수송용역'],
    delivery: ['기자재 납품'],
    scrap: ['불용품 매각'],
    pcbs: ['PCBs처리용역'],
  };
  const ORDER = ['construction', 'pickup', 'transport', 'delivery', 'scrap', 'pcbs'];
  const CONSTRUCTION_IMAGE = '/images/type-construction-crane-truck.svg';

  const style = document.createElement('style');
  style.textContent = `
    #app .visit-purpose-grid .tn{white-space:normal!important;line-height:1.25!important}
    #app .visit-purpose-grid .tn .purpose-sub{display:block;margin-top:4px;font-size:.78em;line-height:1.25}
  `;
  document.head.appendChild(style);

  function apply() {
    const grid = document.querySelector('#app .type-grid');
    if (!grid) return;

    const appbar = document.querySelector('#app > .appbar');
    const heading = appbar?.querySelector('h1');
    if (heading && ['차량 유형 선택', '계약 유형'].includes(heading.textContent?.trim())) {
      heading.textContent = '방문 목적';
      appbar.querySelector('.sub')?.remove();
    }

    grid.classList.add('visit-purpose-grid');

    const cards = new Map();
    grid.querySelectorAll('.type-card[data-type]').forEach((card) => {
      const id = card.dataset.type;
      cards.set(id, card);
      const name = card.querySelector('.tn');
      const parts = LABELS[id];
      if (name && parts) {
        name.replaceChildren(document.createTextNode(parts[0]));
        if (parts[1]) {
          const sub = document.createElement('span');
          sub.className = 'purpose-sub';
          sub.textContent = parts[1];
          name.append(sub);
        }
      }

      if (id === 'pickup') {
        const iconBox = card.querySelector('.ico');
        if (iconBox && iconBox.dataset.pickupImageApplied !== 'true') {
          const image = document.createElement('img');
          image.className = 'vehicle-type-image';
          image.src = CONSTRUCTION_IMAGE;
          image.alt = '공사업체 자재 수령';
          iconBox.replaceChildren(image);
          iconBox.dataset.pickupImageApplied = 'true';
        }
      }
    });

    ORDER.forEach((id) => {
      const card = cards.get(id);
      if (card) grid.append(card);
    });
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
  schedule();
})();