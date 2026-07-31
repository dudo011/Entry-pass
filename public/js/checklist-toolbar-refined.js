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
    document.querySelectorAll('.annot').forEach((overlay) => {
      overlay.querySelector('.swatches')?.remove();
      overlay.querySelector('[data-tool="pen"]')?.remove();

      const hint = overlay.querySelector('.annot-hint');
      if (hint && hint.textContent !== '한 손가락 : 펜,    두 손가락 : 이동') {
        hint.textContent = '한 손가락 : 펜,    두 손가락 : 이동';
      }
    });
  }

  new MutationObserver(refineChecklistToolbar).observe(document.body, {
    childList: true,
    subtree: true,
  });
  refineChecklistToolbar();
})();
