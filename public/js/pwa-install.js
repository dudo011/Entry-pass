/* PWA 설치 도우미
 * 1) 서비스워커 등록
 * 2) 카톡 등 인앱 브라우저면 → "브라우저로 열기" 안내(인앱에선 설치 불가)
 * 3) 실제 브라우저면 → 설치 배너 표시(가능하면 원터치 설치, 아니면 방법 안내)
 * 앱 코드(app.js)와 독립적으로 동작하도록 자체 스타일 사용.
 */
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) return; // 이미 설치되어 앱으로 실행 중

  var isInApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|; wv\)/i.test(ua);
  var isKakao = /KAKAOTALK/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua);
  var isSamsung = /SamsungBrowser/i.test(ua);

  // --- 서비스워커 등록 (인앱 제외) ---
  if ('serviceWorker' in navigator && !isInApp) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  function dismissed(key, days) {
    try {
      var t = parseInt(localStorage.getItem(key) || '0', 10);
      return t && (Date.now() - t) < days * 864e5;
    } catch (e) { return false; }
  }
  function remember(key) { try { localStorage.setItem(key, String(Date.now())); } catch (e) {} }

  var ICON = '/icons/icon-192.png';

  function banner(opts) {
    var wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));' +
      'z-index:2147483000;max-width:496px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;' +
      'border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.18);padding:14px 14px;' +
      'display:flex;align-items:center;gap:12px;font-family:inherit;' +
      'animation:epslide .28s ease-out';
    var st = document.createElement('style');
    st.textContent = '@keyframes epslide{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}';
    wrap.appendChild(st);

    var img = document.createElement('img');
    img.src = ICON; img.alt = '';
    img.style.cssText = 'width:46px;height:46px;border-radius:12px;flex:none';
    wrap.appendChild(img);

    var tx = document.createElement('div');
    tx.style.cssText = 'flex:1;min-width:0';
    tx.innerHTML = '<div style="font-size:16px;font-weight:800;color:#0f172a;line-height:1.35">' + opts.title + '</div>' +
      '<div style="font-size:13.5px;color:#64748b;margin-top:2px;line-height:1.45;word-break:keep-all">' + opts.desc + '</div>';
    wrap.appendChild(tx);

    var col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex:none';
    var main = document.createElement('button');
    main.type = 'button'; main.textContent = opts.mainLabel;
    main.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 14px;' +
      'font-size:14.5px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap';
    main.onclick = opts.onMain;
    col.appendChild(main);
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = '닫기';
    close.style.cssText = 'background:transparent;color:#94a3b8;border:0;padding:4px;font-size:13px;cursor:pointer;font-family:inherit';
    close.onclick = function () { if (opts.onClose) opts.onClose(); wrap.remove(); };
    col.appendChild(close);
    wrap.appendChild(col);

    document.body.appendChild(wrap);
    return wrap;
  }

  // --- 1) 인앱 브라우저: 설치 불가 → 외부 브라우저로 안내 ---
  if (isInApp) {
    if (dismissed('ep_inapp_dismiss', 3)) return;
    window.addEventListener('load', function () {
      banner({
        title: '설치는 브라우저에서 돼요',
        desc: isKakao ? '아래 버튼으로 브라우저에서 열면 홈 화면에 추가할 수 있어요.'
                      : '오른쪽 위 ⋯ 메뉴 → “다른 브라우저로 열기”를 선택하세요.',
        mainLabel: '브라우저로 열기',
        onMain: function () {
          var url = location.href;
          if (isKakao) { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url); }
          else { location.href = url; }
        },
        onClose: function () { remember('ep_inapp_dismiss'); }
      });
    });
    return;
  }

  // --- 2) 실제 브라우저: 원터치 설치(beforeinstallprompt) ---
  var deferred = null, shown = false;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (shown || dismissed('ep_install_dismiss', 7)) return;
    shown = true;
    banner({
      title: '홈 화면에 앱 설치',
      desc: '설치하면 주소창 없이 앱처럼 빠르게 쓸 수 있어요.',
      mainLabel: '설치',
      onMain: function (ev) {
        var b = ev.target.closest('div[role=dialog]');
        if (deferred) {
          deferred.prompt();
          deferred.userChoice.finally(function () { if (b) b.remove(); deferred = null; });
        } else if (b) { b.remove(); }
      },
      onClose: function () { remember('ep_install_dismiss'); }
    });
  });
  window.addEventListener('appinstalled', function () {
    remember('ep_install_dismiss');
  });

  // --- 3) beforeinstallprompt 미지원(삼성인터넷/ iOS) 폴백: 방법 안내 ---
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (shown || deferred || dismissed('ep_guide_dismiss', 7)) return;
      var desc;
      if (isIOS) desc = '공유 버튼 → “홈 화면에 추가”를 누르세요.';
      else if (isSamsung) desc = '메뉴 → “현재 페이지 추가” → “홈 화면”을 누르세요.';
      else desc = '브라우저 메뉴(⋮) → “홈 화면에 추가”를 누르세요.';
      shown = true;
      banner({
        title: '홈 화면에 앱 추가',
        desc: desc,
        mainLabel: '확인',
        onMain: function (ev) { var b = ev.target.closest('div[role=dialog]'); if (b) b.remove(); remember('ep_guide_dismiss'); },
        onClose: function () { remember('ep_guide_dismiss'); }
      });
    }, 3500);
  });
})();
