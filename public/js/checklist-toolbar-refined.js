(() => {
  const style = document.createElement('style');
  style.textContent = `
    .annot-tools{
      justify-content:center!important;
      gap:12px!important;
      padding:10px 16px!important;
      overflow:visible!important
    }
    .annot-tools .swatches,
    .annot-tools [data-tool="pen"]{
      display:none!important
    }
    .annot-tools [data-act="undo"],
    .annot-tools [data-act="clear"]{
      flex:1 1 0!important;
      max-width:240px!important;
      min-width:0!important;
      text-align:center!important
    }
    .annot-hint{
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:pre-wrap!important;
      font-size:18px!important;
      line-height:1.45!important;
      font-weight:700!important;
      padding:10px 12px!important;
      padding-bottom:max(12px,env(safe-area-inset-bottom))!important
    }
    @media(max-width:390px){
      .annot-tools{gap:8px!important;padding-inline:12px!important}
      .annot-hint{font-size:17px!important}
    }
  `;
  document.head.appendChild(style);

  function refineChecklistToolbar() {
    const overlays = document.querySelectorAll('.annot');
    if (!overlays.length) return; // 애노테이터가 없으면 아무 것도 하지 않는다(불필요한 변경 방지).
    overlays.forEach((overlay) => {
      overlay.querySelector('.swatches')?.remove();
      overlay.querySelector('[data-tool="pen"]')?.remove();

      const hint = overlay.querySelector('.annot-hint');
      if (hint && hint.textContent !== '한 손가락 : 펜,    두 손가락 : 이동') {
        hint.textContent = '한 손가락 : 펜,    두 손가락 : 이동';
      }
    });
  }

  // 관찰자 콜백에서 직접 DOM을 변경하면(마이크로태스크) 다른 직접-변경 관찰자와
  // 상호 재발화 루프에 걸려 마이크로태스크 큐가 안 비워지고 화면이 하드 프리즈된다.
  // rAF로 스케줄해 반드시 프레임마다 양보한다.
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refineChecklistToolbar();
    });
  };

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  schedule();
})();
