/* MutationObserver 안전 가드 (최우선 로드)
 *
 * 배경: 이 앱은 40개 이상의 보정 스크립트가 각자 MutationObserver로 #app/body를 감시하고,
 * 상당수가 콜백 안에서 곧바로 DOM을 변경한다. 관찰자 콜백은 마이크로태스크로 실행되므로,
 * 직접-변경 관찰자 둘 이상이 서로를 재발화시키면 마이크로태스크 큐가 비워지지 않아 브라우저가
 * 렌더/입력으로 양보하지 못하고 화면이 하드 프리즈된다.
 *
 * 목표 두 가지를 동시에 만족한다:
 *  1) 하드 프리즈 방지 — 한 프레임 안에서 콜백이 과도하게 재발화하면(상호 루프) 이후 실행을
 *     rAF로 미뤄 반드시 양보한다.
 *  2) 화면 전환 깜빡임 방지 — 정상 상황에서는 콜백을 (마이크로태스크 안에서) 그대로 즉시
 *     실행한다. 그러면 화면을 새로 그린 직후 같은 처리 흐름에서 보정이 끝나 "페인트 직전"에
 *     반영되므로, 보정 전 화면이 한 프레임 보였다 사라지는 깜빡임이 없다.
 *
 * 핵심: 프레임당 동기 실행 횟수에 예산(BUDGET)을 두고, 초과분만 rAF로 미룬다. 예산은 매 프레임
 * (rAF)마다 리셋된다. 정상 렌더는 관찰자 수십 개가 한두 번 도는 정도(예산 이내)라 전부 동기
 * 실행되고, 상호 루프는 수백~수천 번이라 예산을 초과해 rAF로 양보된다.
 */
(() => {
  const Native = window.MutationObserver;
  if (!Native || Native.__rafGuarded) return;

  const raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb) => setTimeout(() => cb(Date.now()), 16);

  const BUDGET = 240;       // 한 프레임 내 동기 콜백 허용 횟수(초과 시 rAF로 양보)
  let used = 0;
  let resetScheduled = false;
  const scheduleReset = () => {
    if (resetScheduled) return;
    resetScheduled = true;
    raf(() => { resetScheduled = false; used = 0; });
  };

  function GuardedMutationObserver(callback) {
    let pending = [];
    let deferred = false;
    const run = (obs) => {
      const batch = pending;
      pending = [];
      try {
        callback(batch, obs);
      } catch (e) {
        try { console.error('[mo-raf-guard]', e); } catch (_) { /* noop */ }
      }
    };
    const observer = new Native((records) => {
      if (records && records.length) pending.push(...records);
      scheduleReset();
      if (used < BUDGET) {
        // 정상: 이번 마이크로태스크에서 즉시 실행 → 페인트 직전 반영, 깜빡임 없음.
        used += 1;
        run(observer);
      } else if (!deferred) {
        // 예산 초과(상호 루프 의심) → 다음 프레임으로 미뤄 양보. 하드 프리즈 방지.
        deferred = true;
        raf(() => { deferred = false; run(observer); });
      }
    });
    return observer; // 생성자가 객체를 반환하면 new 결과가 이 객체가 된다.
  }

  GuardedMutationObserver.prototype = Native.prototype;
  GuardedMutationObserver.__rafGuarded = true;
  window.MutationObserver = GuardedMutationObserver;
  try { window.WebKitMutationObserver = GuardedMutationObserver; } catch (e) { /* noop */ }
})();
