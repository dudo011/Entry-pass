(() => {
  const style = document.createElement('style');
  style.textContent = `
    #app.landing-refined .hero{padding-bottom:8px}
    #app.landing-refined .hero p{
      max-width:360px;margin:18px auto 0;padding:0!important;border:0!important;
      border-radius:0!important;background:transparent!important;color:var(--text,#0f172a)!important;
      font-size:18px!important;font-weight:700!important;line-height:1.55!important
    }
    #app.landing-refined .hero p .pre-approval{color:var(--primary,#1d4ed8);font-weight:800}
    #app.landing-refined .role-grid{
      grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;padding:20px 16px!important
    }
    #app.landing-refined .role-btn{
      min-height:220px!important;padding:20px 10px!important;display:flex!important;flex-direction:column!important;
      justify-content:flex-start!important;align-items:center!important;gap:12px!important;text-align:center!important
    }
    #app.landing-refined .role-btn .emoji{
      width:78px!important;height:78px!important;display:grid!important;place-items:center!important;
      border-radius:18px!important;background:#eff6ff!important;font-size:42px!important
    }
    #app.landing-refined .role-btn > span:nth-child(2){display:block!important;width:100%}
    #app.landing-refined .role-btn .rt{font-size:20px!important;line-height:1.3!important}
    #app.landing-refined .role-btn .rd{display:block!important;margin-top:8px;font-size:15px!important;line-height:1.4!important}
    #app.landing-refined .role-btn .arrow{display:none!important}
    @media(max-width:390px){
      #app.landing-refined .role-grid{gap:9px!important;padding-inline:12px!important}
      #app.landing-refined .role-btn{min-height:205px!important;padding-inline:8px!important}
      #app.landing-refined .role-btn .rt{font-size:18px!important}
      #app.landing-refined .role-btn .rd{font-size:14px!important}
    }
  `;
  document.head.appendChild(style);

  function apply() {
    const hero = document.querySelector('#app > .hero');
    const grid = document.querySelector('#app > .role-grid');
    if (!hero || !grid) {
      document.getElementById('app')?.classList.remove('landing-refined');
      return;
    }

    const app = document.getElementById('app');
    app.classList.add('landing-refined');

    const message = hero.querySelector('p');
    if (message && message.dataset.landingRefined !== 'true') {
      message.innerHTML = '출입 전 안전수칙을 확인하고<br><span class="pre-approval">사전 승인</span>을 받으세요.';
      message.dataset.landingRefined = 'true';
    }

    const driver = grid.querySelector('[data-role="driver"]');
    const driverTitle = driver?.querySelector('.rt');
    if (driverTitle) driverTitle.textContent = '차량기사';

    grid.querySelectorAll('.arrow').forEach((arrow) => arrow.remove());
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
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
