/* MutationObserver 안전 가드 (최우선 로드)
 *
 * 이 앱에는 40개 이상의 보정 스크립트가 각자 MutationObserver로 #app/document.body를
 * 감시한다. 그중 상당수가 "관찰자 콜백 안에서 곧바로 DOM을 변경"한다. 관찰자 콜백은
 * 마이크로태스크로 실행되는데, 콜백이 DOM을 바꾸면 다른 관찰자 콜백이 또 마이크로태스크로
 * 예약된다. 이런 직접-변경 관찰자가 둘 이상 서로를 재발화시키면 마이크로태스크 큐가 절대
 * 비워지지 않아 브라우저가 렌더/입력 처리로 양보하지 못하고 화면이 통째로 하드 프리즈된다.
 * (관리자 완료 탭·관리자모드 진입 시 발생한 먹통의 근본 원인)
 *
 * 해결: 모든 MutationObserver 콜백을 requestAnimationFrame으로 미뤄 "반드시 프레임마다
 * 양보"하게 한다. 프레임당 1회로 합치므로(coalesce) 재발화가 있어도 마이크로태스크 폭주로
 * 이어지지 않는다. 콜백들은 대부분 DOM을 다시 조회해 처리하므로 한 프레임 지연·레코드
 * 합치기는 동작에 영향이 없다.
 */
(() => {
  const Native = window.MutationObserver;
  if (!Native || Native.__rafGuarded) return;

  const raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb) => setTimeout(() => cb(Date.now()), 16);

  function GuardedMutationObserver(callback) {
    let scheduled = false;
    let pending = [];
    const observer = new Native((records) => {
      if (records && records.length) pending.push(...records);
      if (scheduled) return;
      scheduled = true;
      raf(() => {
        scheduled = false;
        const batch = pending;
        pending = [];
        try {
          callback(batch, observer);
        } catch (e) {
          // 한 관찰자의 오류가 다른 관찰자를 막지 않도록 삼킨다.
          try { console.error('[mo-raf-guard]', e); } catch (_) { /* noop */ }
        }
      });
    });
    return observer; // 생성자가 객체를 반환하면 new 결과가 이 객체가 된다.
  }

  GuardedMutationObserver.prototype = Native.prototype;
  GuardedMutationObserver.__rafGuarded = true;
  window.MutationObserver = GuardedMutationObserver;
  // WebKitMutationObserver 별칭도 동일 처리.
  try { window.WebKitMutationObserver = GuardedMutationObserver; } catch (e) { /* noop */ }
})();
