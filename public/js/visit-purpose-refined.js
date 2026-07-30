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
  const POSITION = {
    construction: [1, 1],
    pickup: [1, 2],
    transport: [2, 1],
    delivery: [2, 2],
    scrap: [3, 1],
    pcbs: [3, 2],
  };
  const CONSTRUCTION_IMAGE = '/images/type-construction-crane-truck.svg';

  const style = document.createElement('style');
  style.textContent = `
    #app .screen:has(> .visit-purpose-grid){
      height:calc(100dvh - 184px)!important;
      min-height:0!important;
      padding:10px 16px 12px!important;
      overflow:hidden!important
    }
    #app .visit-purpose-grid{
      width:100%!important;height:100%!important;margin:0!important;
      display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
      grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)!important;
      grid-auto-flow:row!important;grid-auto-columns:unset!important;grid-auto-rows:unset!important;
      gap:10px!important;align-content:stretch!important
    }
    #app .visit-purpose-grid .type-card{
      grid-column:auto!important;grid-row:auto!important;grid-area:auto!important;
      width:100%!important;max-width:none!important;min-width:0!important;
      min-height:0!important;height:100%!important;max-height:none!important;
      margin:0!important;padding:10px 8px!important;border-radius:20px!important;
      display:flex!important;flex-direction:column!important;align-items:center!important;
      justify-content:center!important;gap:7px!important
    }
    #app .visit-purpose-grid .type-card[data-type="construction"]{grid-row:1!important;grid-column:1!important}
    #app .visit-purpose-grid .type-card[data-type="pickup"]{grid-row:1!important;grid-column:2!important}
    #app .visit-purpose-grid .type-card[data-type="transport"]{grid-row:2!important;grid-column:1!important}
    #app .visit-purpose-grid .type-card[data-type="delivery"]{grid-row:2!important;grid-column:2!important}
    #app .visit-purpose-grid .type-card[data-type="scrap"]{grid-row:3!important;grid-column:1!important}
    #app .visit-purpose-grid .type-card[data-type="pcbs"]{grid-row:3!important;grid-column:2!important}
    #app .visit-purpose-grid .ico{
      width:100%!important;height:min(12.5vh,94px)!important;min-height:58px!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      font-size:min(9vh,62px)!important;line-height:1!important
    }
    #app .visit-purpose-grid .vehicle-type-image{
      display:block!important;width:92%!important;height:100%!important;object-fit:contain!important
    }
    #app .visit-purpose-grid .tn-wrap{width:100%!important;min-height:0!important}
    #app .visit-purpose-grid .tn{
      white-space:normal!important;line-height:1.15!important;font-size:18px!important;
      font-weight:800!important;word-break:keep-all!important
    }
    #app .visit-purpose-grid .tn .purpose-sub{
      display:block;margin-top:3px;font-size:.72em;line-height:1.18;white-space:nowrap
    }
    #app .visit-purpose-grid .my-tag{top:8px!important;right:8px!important;font-size:12px!important;padding:5px 8px!important}
    @media(max-height:760px){
      #app .screen:has(> .visit-purpose-grid){height:calc(100dvh - 170px)!important;padding-top:7px!important}
      #app .visit-purpose-grid{gap:7px!important}
      #app .visit-purpose-grid .type-card{padding:7px 6px!important;gap:4px!important;border-radius:17px!important}
      #app .visit-purpose-grid .ico{height:min(10.5vh,72px)!important;min-height:48px!important}
      #app .visit-purpose-grid .tn{font-size:16px!important}
    }
    @media(max-width:390px){
      #app .screen:has(> .visit-purpose-grid){padding-inline:12px!important}
      #app .visit-purpose-grid{gap:8px!important}
      #app .visit-purpose-grid .tn{font-size:16px!important}
      #app .visit-purpose-grid .tn .purpose-sub{font-size:.7em}
    }
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

      const position = POSITION[id];
      if (position) {
        card.style.setProperty('grid-row', String(position[0]), 'important');
        card.style.setProperty('grid-column', String(position[1]), 'important');
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