(() => {
  const style = document.createElement('style');
  style.textContent = `
    #app.landing-refined{min-height:100dvh;display:flex;flex-direction:column}
    #app.landing-refined .hero{padding-bottom:8px}
    #app.landing-refined .hero p{
      max-width:360px;margin:18px auto 0;padding:0!important;border:0!important;
      border-radius:0!important;background:transparent!important;color:var(--text,#0f172a)!important;
      font-size:18px!important;font-weight:700!important;line-height:1.55!important
    }
    #app.landing-refined .hero p .pre-approval{color:var(--primary,#1d4ed8);font-weight:800}
    #app.landing-refined .role-grid{
      grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;padding:20px 16px 10px!important
    }
    #app.landing-refined .role-btn{
      min-height:228px!important;padding:20px 10px!important;display:flex!important;flex-direction:column!important;
      justify-content:flex-start!important;align-items:center!important;gap:12px!important;text-align:center!important
    }
    #app.landing-refined .role-btn .emoji{
      width:94px!important;height:94px!important;display:grid!important;place-items:center!important;
      border-radius:20px!important;background:#eff6ff!important;font-size:52px!important
    }
    #app.landing-refined .role-btn > span:nth-child(2){display:block!important;width:100%}
    #app.landing-refined .role-btn .rt{font-size:23px!important;line-height:1.3!important}
    #app.landing-refined .role-btn .rd{display:block!important;margin-top:8px;font-size:15px!important;line-height:1.4!important}
    #app.landing-refined .role-btn .arrow{display:none!important}
    .landing-privacy-footer{
      margin-top:auto;padding:4px 16px calc(12px + env(safe-area-inset-bottom));text-align:center;
      color:var(--text-muted,#64748b);font-size:12px;line-height:1.45
    }
    .landing-privacy-links{margin-top:3px;display:flex;justify-content:center;gap:12px}
    .landing-privacy-link{
      padding:0;border:0;background:transparent;color:var(--primary,#2563eb);font:inherit;font-weight:700;
      text-decoration:underline;text-underline-offset:2px;cursor:pointer
    }
    .policy-overlay{
      position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;
      padding-top:24px;background:rgba(15,23,42,.56)
    }
    .policy-sheet{
      width:min(100%,600px);max-height:82dvh;overflow:auto;padding:20px 18px calc(20px + env(safe-area-inset-bottom));
      border-radius:24px 24px 0 0;background:#fff;color:var(--text,#0f172a);box-sizing:border-box
    }
    .policy-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .policy-head h2{margin:0;font-size:21px;line-height:1.3}
    .policy-close{width:40px;height:40px;border:0;border-radius:12px;background:#f1f5f9;font-size:20px;cursor:pointer}
    .policy-body{font-size:15px;line-height:1.65}
    .policy-body h3{margin:16px 0 5px;font-size:16px}
    .policy-body p{margin:0 0 9px}
    @media(max-width:390px){
      #app.landing-refined .role-grid{gap:9px!important;padding:14px 12px 7px!important}
      #app.landing-refined .role-btn{min-height:208px!important;padding:16px 8px!important}
      #app.landing-refined .role-btn .emoji{width:84px!important;height:84px!important;font-size:47px!important}
      #app.landing-refined .role-btn .rt{font-size:21px!important}
      #app.landing-refined .role-btn .rd{font-size:14px!important}
      .landing-privacy-footer{padding-top:2px;padding-bottom:calc(8px + env(safe-area-inset-bottom));font-size:11px}
    }
  `;
  document.head.appendChild(style);

  const policyContent = {
    privacy: {
      title: '개인정보 처리방침',
      body: `
        <p>자재센터 출입 신청 서비스는 출입관리와 안전관리를 위해 필요한 최소한의 개인정보를 처리합니다.</p>
        <h3>처리 항목</h3>
        <p>이름, 휴대폰번호, 차량번호, 소속업체, 계약유형, 방문일시와 출입신청 기록</p>
        <h3>처리 목적</h3>
        <p>출입자 확인, 출입 승인, 현장 안전관리, 긴급 연락 및 출입기록 관리</p>
        <h3>보유 기간</h3>
        <p>관련 법령과 회사 내부 기준에서 정한 기간 동안 보관한 후 지체 없이 파기합니다.</p>
        <h3>이용자 권리</h3>
        <p>이용자는 개인정보 열람, 정정 및 삭제를 요청할 수 있습니다. 업무상 보존이 필요한 정보는 관련 기준에 따라 제한될 수 있습니다.</p>
      `
    },
    terms: {
      title: '이용약관',
      body: `
        <p>본 서비스는 자재센터 출입 신청과 안전수칙 안내를 위한 업무용 서비스입니다.</p>
        <h3>이용자 의무</h3>
        <p>이용자는 본인의 정확한 정보로 신청해야 하며, 타인의 정보나 차량정보를 무단으로 사용해서는 안 됩니다.</p>
        <h3>출입 승인</h3>
        <p>신청 완료가 출입 승인을 의미하지 않으며, 관리자의 확인과 승인 후 출입할 수 있습니다.</p>
        <h3>서비스 이용 제한</h3>
        <p>허위 신청, 안전수칙 위반 또는 시스템 오남용이 확인되면 이용이나 출입이 제한될 수 있습니다.</p>
      `
    }
  };

  function openPolicy(type) {
    const content = policyContent[type];
    if (!content) return;
    const overlay = document.createElement('div');
    overlay.className = 'policy-overlay';
    overlay.innerHTML = `
      <section class="policy-sheet" role="dialog" aria-modal="true" aria-label="${content.title}">
        <div class="policy-head"><h2>${content.title}</h2><button class="policy-close" type="button" aria-label="닫기">✕</button></div>
        <div class="policy-body">${content.body}</div>
      </section>
    `;
    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('.policy-close').onclick = close;
    document.body.appendChild(overlay);
  }

  function apply() {
    const app = document.getElementById('app');
    if (!app) return;

    const hero = document.querySelector('#app > .hero');
    const grid = document.querySelector('#app > .role-grid');
    if (hero && grid) {
      app.classList.add('landing-refined');

      const message = hero.querySelector('p');
      if (message && message.dataset.landingRefined !== 'true') {
        message.innerHTML = '출입 전 안전수칙을 확인하고<br><span class="pre-approval">사전 승인</span>을 받으세요.';
        message.dataset.landingRefined = 'true';
      }

      const driver = grid.querySelector('[data-role="driver"]');
      const driverTitle = driver?.querySelector('.rt');
      if (driverTitle && driverTitle.textContent !== '계약업체') driverTitle.textContent = '계약업체';
      grid.querySelectorAll('.arrow').forEach((arrow) => arrow.remove());

      if (!app.querySelector('.landing-privacy-footer')) {
        const footer = document.createElement('footer');
        footer.className = 'landing-privacy-footer';
        footer.innerHTML = `
          <div>입력한 정보는 출입관리 및 안전관리 목적으로 이용됩니다.</div>
          <div class="landing-privacy-links">
            <button type="button" class="landing-privacy-link" data-policy="privacy">개인정보 처리방침</button>
            <button type="button" class="landing-privacy-link" data-policy="terms">이용약관</button>
          </div>
        `;
        footer.querySelectorAll('[data-policy]').forEach((button) => {
          button.onclick = () => openPolicy(button.dataset.policy);
        });
        app.appendChild(footer);
      }
    } else {
      app.classList.remove('landing-refined');
      app.querySelector('.landing-privacy-footer')?.remove();
    }

    const loginId = document.getElementById('a_loginId');
    const password = document.getElementById('a_password');
    const password2 = document.getElementById('a_password2');
    const appbarTitle = document.querySelector('#app > .appbar h1');
    const currentTitle = appbarTitle?.textContent?.trim();
    if (loginId && password && !password2 && ['운전기사', '차량 기사', '차량기사'].includes(currentTitle)
        && appbarTitle.textContent !== '계약업체') {
      appbarTitle.textContent = '계약업체';
    }
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
