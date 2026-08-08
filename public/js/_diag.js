/* 임시 진단 스크립트 — 관리자 화면 먹통 원인 파악용. 원인 확인 후 제거 예정.
 * 1) 로드 시 버전 스탬프 표시(새 코드가 기기에 실제로 로드됐는지 확인)
 * 2) 잡히지 않은 에러/거부를 화면 하단 배너로 표시
 * 3) 버튼 클릭 직후 화면이 멈추면 그 동작명을 저장 → 다음 실행 때 "무엇을 누르다 멈췄는지" 표시
 */
(() => {
  const VERSION = '20260808-016';

  function bannerEl() {
    let el = document.getElementById('__ep_diag');
    if (!el) {
      el = document.createElement('div');
      el.id = '__ep_diag';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;'
        + 'font:600 12px/1.5 -apple-system,sans-serif;padding:8px 12px;white-space:pre-wrap;'
        + 'max-height:45vh;overflow:auto;box-shadow:0 -2px 10px rgba(0,0,0,.35);color:#fff';
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }
  function show(msg, bg) {
    const el = bannerEl();
    el.style.background = bg;
    el.textContent = msg;
  }

  // (3) 직전 프리즈 흔적이 있으면 알린다.
  try {
    const froze = localStorage.getItem('__ep_froze');
    const last = localStorage.getItem('__ep_last_action');
    if (froze === '1' && last) {
      show('⚠ 직전에 [' + last + '] 을(를) 누른 뒤 화면이 멈췄습니다. (진단 v' + VERSION + ')', '#b45309');
    }
    localStorage.removeItem('__ep_froze');
  } catch (e) { /* noop */ }

  // (2) 잡히지 않은 에러 표시.
  window.addEventListener('error', (e) => {
    const where = String(e.filename || '').split('/').pop();
    show('ERR: ' + (e.message || e.error || '') + '  @' + where + ':' + (e.lineno || ''), '#b91c1c');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    show('REJECT: ' + ((r && r.message) || r || ''), '#b91c1c');
  });

  // 클릭 직후 살아있으면 프리즈 아님으로 표시. 멈추면 플래그가 남아 다음 실행에서 알림.
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('button, .tab, [role="button"], a');
    if (!t) return;
    const label = (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) || '(빈 버튼)';
    try {
      localStorage.setItem('__ep_last_action', label);
      localStorage.setItem('__ep_froze', '1');
    } catch (e) { /* noop */ }
    // 두 프레임 뒤에도 실행되면 메인 스레드가 살아있는 것 → 프리즈 플래그 해제
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { localStorage.removeItem('__ep_froze'); } catch (e) { /* noop */ }
    }));
  }, true);

  // (1) 버전 스탬프(4초간).
  const stamp = () => {
    show('진단 v' + VERSION + ' 로드됨 — 완료/관리자모드를 눌러보세요', '#065f46');
    setTimeout(() => {
      const el = document.getElementById('__ep_diag');
      if (el && /로드됨/.test(el.textContent)) el.remove();
    }, 4000);
  };
  if (document.readyState === 'complete') stamp();
  else window.addEventListener('load', stamp);
})();
