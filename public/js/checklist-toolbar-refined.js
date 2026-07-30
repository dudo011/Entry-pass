(() => {
  const style = document.createElement('style');
  style.textContent = `
    #app .annot-tools .swatches{display:none!important}
    #app .annot-hint{
      font-size:18px!important;
      line-height:1.45!important;
      font-weight:700!important;
      padding:10px 12px!important;
      padding-bottom:max(12px,env(safe-area-inset-bottom))!important
    }
    @media(max-width:390px){
      #app .annot-hint{font-size:17px!important}
    }
  `;
  document.head.appendChild(style);

  function refineChecklistToolbar() {
    document.querySelectorAll('#app .annot-tools .swatches').forEach((swatches) => swatches.remove());
  }

  const app = document.getElementById('app');
  if (!app) return;
  new MutationObserver(refineChecklistToolbar).observe(app, { childList: true, subtree: true });
  refineChecklistToolbar();
})();
