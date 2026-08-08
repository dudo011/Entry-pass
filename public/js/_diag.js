/* 임시 진단 스크립트 — 관리자 화면 하드 프리즈 원인 파악용. 원인 확인 후 제거 예정.
 * - 버전 스탬프(새 코드 로드 확인)
 * - 잡히지 않은 에러 배너
 * - requestAnimationFrame / MutationObserver 콜백 실행 직전에 "출처 스크립트"를 기록.
 *   콜백 안에서 동기 무한루프로 멈추면 그 출처가 남아, 다음 실행 때 "무엇이 멈췄는지" 표시.
 */
(() => {
  const VERSION = '20260808-017';
  const LS = window.localStorage;
  const get = (k) => { try { return LS.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { LS.setItem(k, v); } catch (e) { /* noop */ } };
  const del = (k) => { try { LS.removeItem(k); } catch (e) { /* noop */ } };

  // 호출 스택에서 /js/파일명 추출.
  function callerScript() {
    const stack = (new Error().stack || '').split('\n');
    for (const line of stack) {
      const m = line.match(/\/js\/([a-z0-9._-]+\.js)/i);
      if (m && m[1] !== '_diag.js') return m[1];
    }
    return 'unknown';
  }

  let bannerLocked = false; // 프리즈/에러 배너가 뜨면 버전스탬프가 덮지 않게.
  function bannerEl() {
    let el = document.getElementById('__ep_diag');
    if (!el) {
      el = document.createElement('div');
      el.id = '__ep_diag';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;'
        + 'font:600 12px/1.5 -apple-system,sans-serif;padding:8px 12px;white-space:pre-wrap;'
        + 'max-height:50vh;overflow:auto;box-shadow:0 -2px 10px rgba(0,0,0,.35);color:#fff';
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }
  function show(msg, bg, lock) {
    const el = bannerEl();
    el.style.background = bg;
    el.textContent = msg;
    if (lock) bannerLocked = true;
  }

  // 직전 프리즈 흔적 표시(우선순위 최상, 계속 유지).
  const froze = get('__ep_froze');
  const lastAction = get('__ep_last_action');
  const lastCrumb = get('__ep_crumb');
  if (froze === '1') {
    show('⚠ 멈춤 감지 — 누른 것: [' + (lastAction || '?') + ']  /  멈춘 위치: [' + (lastCrumb || '?') + ']  (v' + VERSION + ')  이 문구를 알려주세요', '#b45309', true);
  }
  del('__ep_froze');

  window.addEventListener('error', (e) => {
    const where = String(e.filename || '').split('/').pop();
    show('ERR: ' + (e.message || '') + '  @' + where + ':' + (e.lineno || ''), '#b91c1c', true);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    show('REJECT: ' + ((r && r.message) || r || ''), '#b91c1c', true);
  });

  // 클릭 시 동작명 기록 + 프리즈 플래그. 두 프레임 살아있으면 해제.
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('button, .tab, [role="button"], a');
    if (!t) return;
    const label = (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) || '(빈 버튼)';
    set('__ep_last_action', label);
    set('__ep_crumb', 'click:' + label); // 코어 클릭 처리 중 멈추면 이 값이 남는다.
    set('__ep_froze', '1');
    const nativeRaf = rafOrig || window.requestAnimationFrame;
    nativeRaf(() => nativeRaf(() => del('__ep_froze')));
  }, true);

  // requestAnimationFrame 래핑: 콜백 실행 직전 출처 기록.
  const rafOrig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    const src = callerScript();
    return rafOrig((t) => {
      set('__ep_crumb', 'rAF:' + src);
      return cb(t);
    });
  };

  // MutationObserver 래핑: 콜백 실행 직전 출처 기록.
  const MO = window.MutationObserver;
  if (MO) {
    window.MutationObserver = function (cb) {
      const src = callerScript();
      return new MO(function (muts, obs) {
        set('__ep_crumb', 'MO:' + src);
        return cb.call(this, muts, obs);
      });
    };
    window.MutationObserver.prototype = MO.prototype;
  }

  // 버전 스탬프(프리즈/에러 배너가 없을 때만, 4초).
  const stamp = () => {
    if (bannerLocked) return;
    show('진단 v' + VERSION + ' 로드됨 — 완료/관리자모드를 눌러보세요', '#065f46', false);
    setTimeout(() => {
      const el = document.getElementById('__ep_diag');
      if (el && !bannerLocked && /로드됨/.test(el.textContent)) el.remove();
    }, 4000);
  };
  if (document.readyState === 'complete') stamp();
  else window.addEventListener('load', stamp);
})();
