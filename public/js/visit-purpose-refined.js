(() => {
  const LABELS = {
    construction: ['공사업체'],
    transport: ['물자수송용역'],
    delivery: ['기자재 납품'],
    scrap: ['불용품 매각'],
    pcbs: ['PCBs처리용역'],
  };
  // 5개 배치(2,2,1) — 6번째 칸은 빈 박스
  const ORDER = ['construction', 'transport', 'delivery', 'scrap', 'pcbs'];
  const POSITION = {
    construction: [1, 1],
    transport: [1, 2],
    delivery: [2, 1],
    scrap: [2, 2],
    pcbs: [3, 1],
  };

  const style = document.createElement('style');
  style.textContent = `
    #app .screen:has(> .visit-purpose-grid){
      height:calc(100dvh - 184px)!important;
      min-height:0!important;
      padding:32px 16px 16px!important;
      overflow:hidden!important
    }
    #app .visit-purpose-grid{
      width:100%!important;height:100%!important;margin:0!important;
      display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
      grid-template-rows:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)!important;
      grid-auto-flow:row!important;grid-auto-columns:unset!important;grid-auto-rows:unset!important;
      column-gap:10px!important;row-gap:40px!important;align-content:stretch!important
    }
    #app .visit-purpose-grid .type-card{
      grid-column:auto!important;grid-row:auto!important;grid-area:auto!important;
      width:100%!important;max-width:none!important;min-width:0!important;
      min-height:0!important;height:100%!important;max-height:none!important;
      margin:0!important;padding:10px 8px!important;border-radius:20px!important;
      display:flex!important;flex-direction:column!important;align-items:center!important;
      justify-content:center!important;gap:8px!important
    }
    #app .visit-purpose-grid .type-card[data-type="construction"]{grid-row:1!important;grid-column:1!important}
    #app .visit-purpose-grid .type-card[data-type="transport"]{grid-row:1!important;grid-column:2!important}
    #app .visit-purpose-grid .type-card[data-type="delivery"]{grid-row:2!important;grid-column:1!important}
    #app .visit-purpose-grid .type-card[data-type="scrap"]{grid-row:2!important;grid-column:2!important}
    #app .visit-purpose-grid .type-card[data-type="pcbs"]{grid-row:3!important;grid-column:1!important}
    #app .visit-purpose-grid .visit-purpose-empty{
      grid-row:3!important;grid-column:2!important;min-height:0;
      border-radius:20px;background:#fff;border:1px solid #eef1f5;box-shadow:0 6px 18px rgba(15,23,42,.06)
    }
    #app .visit-purpose-grid .ico{
      flex:0 0 auto!important;width:100%!important;height:min(9.5vh,74px)!important;min-height:48px!important;
      margin:0!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;
      font-size:min(7.5vh,50px)!important;line-height:1!important
    }
    #app .visit-purpose-grid .vehicle-type-image{
      display:block!important;width:90%!important;height:100%!important;object-fit:contain!important
    }
    #app .visit-purpose-grid .tn-wrap{
      flex:0 0 auto!important;width:100%!important;min-height:0!important;margin:0!important;padding:0!important;
      display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important
    }
    #app .visit-purpose-grid .tn{
      margin:0!important;white-space:normal!important;line-height:1.2!important;font-size:21px!important;
      font-weight:800!important;word-break:keep-all!important;text-align:center!important
    }
    #app .visit-purpose-grid .tn .purpose-sub{
      display:block;margin-top:3px;font-size:1em;line-height:1.2;white-space:normal
    }
    #app .visit-purpose-grid .my-tag{top:8px!important;right:8px!important;font-size:12px!important;padding:5px 8px!important}
    @media(max-height:760px){
      #app .screen:has(> .visit-purpose-grid){height:calc(100dvh - 170px)!important;padding:24px 14px 12px!important}
      #app .visit-purpose-grid{column-gap:8px!important;row-gap:32px!important}
      #app .visit-purpose-grid .type-card{padding:7px 6px!important;gap:5px!important;border-radius:17px!important}
      #app .visit-purpose-grid .ico{height:min(8vh,58px)!important;min-height:42px!important}
      #app .visit-purpose-grid .tn{font-size:19px!important}
    }
    @media(max-width:390px){
      #app .screen:has(> .visit-purpose-grid){padding-inline:12px!important}
      #app .visit-purpose-grid{column-gap:8px!important;row-gap:34px!important}
      #app .visit-purpose-grid .tn{font-size:19px!important}
      #app .visit-purpose-grid .tn .purpose-sub{font-size:1em}
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

    // 카드 라벨 교체·재정렬은 그리드마다 1회만.
    // 매 apply 마다 replaceChildren/append 하면 스스로 MutationObserver 를 재트리거해 무한 루프가 된다.
    if (grid.dataset.visitPurposeApplied === 'true') return;

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
    });

    ORDER.forEach((id) => {
      const card = cards.get(id);
      if (card) grid.append(card);
    });

    // 6번째 칸(3행 2열)은 빈 박스로 채워 2x3 균형 유지
    if (!grid.querySelector('.visit-purpose-empty')) {
      const empty = document.createElement('div');
      empty.className = 'visit-purpose-empty';
      empty.setAttribute('aria-hidden', 'true');
      grid.append(empty);
    }
    grid.dataset.visitPurposeApplied = 'true';
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