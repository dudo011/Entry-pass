(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const style = document.createElement('style');
  style.textContent = `
    /* 업체 로그인·회원가입: 기존 앱처럼 라벨과 입력칸을 한 줄에 배치 */
    #app.cf-auth-login-layout .cf-card > .cf-field,
    #app.cf-auth-register-layout .cf-card > .cf-field {
      display:grid!important;
      grid-template-columns:96px minmax(0,1fr)!important;
      align-items:center!important;
      gap:10px!important;
      margin:0 0 12px!important;
    }
    #app.cf-auth-login-layout .cf-card > .cf-field > span,
    #app.cf-auth-register-layout .cf-card > .cf-field > span {
      display:block!important;
      margin:0!important;
      font-size:14px!important;
      line-height:1.25!important;
      font-weight:800!important;
      color:#334155!important;
    }

    /* 중복확인 항목도 라벨-입력-버튼이 같은 줄에서 보이도록 유지 */
    #app.cf-auth-register-layout .cf-card > .cf-inline {
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      align-items:center!important;
      gap:7px!important;
      margin:0!important;
    }
    #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field {
      display:grid!important;
      grid-template-columns:96px minmax(0,1fr)!important;
      align-items:center!important;
      gap:10px!important;
      margin:0!important;
      min-width:0!important;
    }
    #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field > span {
      display:block!important;
      margin:0!important;
      font-size:14px!important;
      line-height:1.2!important;
      font-weight:800!important;
      color:#334155!important;
    }
    #app.cf-auth-register-layout .cf-check {
      min-width:72px!important;
      padding:0 8px!important;
      font-size:13px!important;
      white-space:nowrap!important;
    }
    #app.cf-auth-register-layout .cf-msg {
      margin:4px 0 8px 106px!important;
      min-height:18px!important;
    }

    @media(max-width:390px) {
      #app.cf-auth-login-layout .cf-card > .cf-field,
      #app.cf-auth-register-layout .cf-card > .cf-field {
        grid-template-columns:86px minmax(0,1fr)!important;
        gap:8px!important;
      }
      #app.cf-auth-register-layout .cf-card > .cf-inline > .cf-field {
        grid-template-columns:86px minmax(0,1fr)!important;
        gap:8px!important;
      }
      #app.cf-auth-register-layout .cf-check {
        min-width:68px!important;
        padding:0 6px!important;
        font-size:12px!important;
      }
      #app.cf-auth-register-layout .cf-msg {
        margin-left:94px!important;
      }
    }
  `;
  document.head.appendChild(style);

  function apply() {
    /* 화면 헤더의 자체 뒤로가기 버튼은 제거한다.
       company-flow-v1.js의 history.pushState/popstate는 그대로 유지되므로
       휴대폰·브라우저 시스템 뒤로가기로 이전 화면으로 이동한다. */
    app.querySelectorAll('.cf-appbar [data-cf-back]').forEach((button) => button.remove());

    const login = !!document.getElementById('cf_login_id');
    const register = !!document.getElementById('cf_reg_company');
    app.classList.toggle('cf-auth-login-layout', login);
    app.classList.toggle('cf-auth-register-layout', register);
  }

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
