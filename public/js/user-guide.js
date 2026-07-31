/* 앱 사용 설명서 (계약업체용)
 * - 메인(랜딩) 하단에 "앱 사용 설명서" 버튼 추가
 * - 누르면 큰 글씨의 간단 설명 오버레이(안전수칙 스타일)
 * app.js 와 독립적으로 동작하도록 자체 스타일/오버레이 사용.
 */
(function () {
  'use strict';

  // ---- 스타일 ----
  var st = document.createElement('style');
  st.textContent = [
    '#ug-open{display:flex;align-items:center;gap:12px;width:calc(100% - 32px);margin:8px auto 0;',
    '  background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;cursor:pointer;',
    '  box-shadow:0 6px 18px rgba(15,23,42,.06);font-family:inherit;text-align:left}',
    '#ug-open .ug-ic{font-size:30px;flex:none}',
    '#ug-open .ug-t{flex:1;min-width:0}',
    '#ug-open .ug-t b{display:block;font-size:19px;font-weight:800;color:#0f172a}',
    '#ug-open .ug-t span{display:block;font-size:15px;color:#64748b;margin-top:2px;word-break:keep-all}',
    '#ug-open .ug-ar{color:#cbd5e1;font-size:26px;flex:none}',
    '.ug-overlay{position:fixed;inset:0;z-index:2147482000;background:#f8fafc;display:flex;flex-direction:column}',
    '.ug-bar{display:flex;align-items:center;gap:10px;padding:14px 16px;padding-top:max(14px,env(safe-area-inset-top));',
    '  background:#0f172a;color:#fff;flex:none}',
    '.ug-bar h2{flex:1;margin:0;font-size:20px;font-weight:800}',
    '.ug-x{background:rgba(255,255,255,.14);border:0;color:#fff;width:40px;height:40px;border-radius:11px;',
    '  font-size:20px;cursor:pointer;flex:none}',
    '.ug-body{flex:1;overflow-y:auto;padding:16px 16px calc(96px + env(safe-area-inset-bottom))}',
    '.ug-head{background:#eff6ff;color:#1d4ed8;border:1px solid #dbe4ff;border-radius:12px;',
    '  padding:12px 14px;font-size:18px;font-weight:800;margin-bottom:14px;line-height:1.4;word-break:keep-all}',
    '.ug-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,.06);',
    '  padding:6px 16px}',
    '.ug-list{list-style:none;margin:0;padding:0}',
    '.ug-list li{display:flex;gap:13px;padding:15px 0;border-bottom:1px solid #e2e8f0;',
    '  font-size:18px;font-weight:600;line-height:1.55;color:#0f172a;word-break:keep-all}',
    '.ug-list li:last-child{border-bottom:0}',
    '.ug-list li .num{flex:none;width:28px;height:28px;border-radius:50%;background:#ef4444;color:#fff;',
    '  font-size:15px;font-weight:800;display:grid;place-items:center;margin-top:2px}',
    '.ug-list li b{color:#1d4ed8;font-weight:800}',
    '.ug-note{margin:14px 2px 0;font-size:16px;color:#475569;line-height:1.55;word-break:keep-all}',
    '.ug-cta{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));',
    '  background:linear-gradient(to top,#f8fafc 72%,transparent)}',
    '.ug-cta button{width:100%;min-height:56px;border:0;border-radius:16px;background:#2563eb;color:#fff;',
    '  font-size:19px;font-weight:800;cursor:pointer;font-family:inherit}'
  ].join('\n');
  document.head.appendChild(st);

  // ---- 설명서 내용 (계약업체용 · 꼭 알아야 할 것만) ----
  var STEPS = [
    '처음 한 번만 — <b>회원가입</b>에서 <b>차량번호로 아이디</b>를 만들고 비밀번호를 정하세요.',
    '로그인한 뒤 <b>[계약업체]</b> 를 누르세요.',
    '<b>안전수칙</b>을 넘겨 보고, <b>마지막 화면에서 “동의”</b> 에 체크하세요.',
    '<b>방문일자</b>를 고르고 <b>계약업체 이름</b>을 입력하세요.',
    '서류가 필요한 차량은 <b>[양식]</b> 을 눌러 앱에서 바로 작성하거나 <b>사진으로 첨부</b>하세요. (현장사진은 출입 후 등록)',
    '<b>[출입 신청 제출]</b> 을 누르면 끝! 담당자가 <b>승인</b>하면 출입할 수 있어요.'
  ];

  function openGuide() {
    var ov = document.createElement('div');
    ov.className = 'ug-overlay';
    var lis = STEPS.map(function (s, i) {
      return '<li><span class="num">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('');
    ov.innerHTML =
      '<div class="ug-bar"><h2>앱 사용 설명서</h2><button class="ug-x" type="button" aria-label="닫기">✕</button></div>' +
      '<div class="ug-body">' +
        '<div class="ug-head">계약업체 출입 신청 — 꼭 알아야 할 6가지</div>' +
        '<div class="ug-card"><ol class="ug-list">' + lis + '</ol></div>' +
        '<p class="ug-note">· 승인 여부는 로그인 후 첫 화면에서 확인할 수 있어요.<br>· 궁금하면 자재센터 담당자에게 문의하세요.</p>' +
      '</div>' +
      '<div class="ug-cta"><button type="button" class="ug-ok">확인했어요</button></div>';
    document.body.appendChild(ov);

    // 하드웨어 뒤로가기로도 닫히도록
    history.pushState({ ugGuide: 1 }, '');
    function onPop() { cleanup(); }
    function cleanup() {
      window.removeEventListener('popstate', onPop);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    window.addEventListener('popstate', onPop);
    function closeByButton() {
      // pushState 로 만든 항목을 되돌려 히스토리 일관성 유지 → popstate 에서 정리됨
      history.back();
    }
    ov.querySelector('.ug-x').onclick = closeByButton;
    ov.querySelector('.ug-ok').onclick = closeByButton;
    ov.addEventListener('click', function (e) { if (e.target === ov) closeByButton(); });
  }

  // ---- 랜딩 하단에 버튼 삽입 ----
  function ensureButton() {
    var app = document.getElementById('app');
    if (!app) return;
    var grid = document.querySelector('#app > .role-grid');
    if (!grid) return;                       // 랜딩 화면이 아닐 때는 아무것도 안 함
    if (document.getElementById('ug-open')) return; // 이미 있음
    var btn = document.createElement('button');
    btn.id = 'ug-open';
    btn.type = 'button';
    btn.innerHTML =
      '<span class="ug-ic">📖</span>' +
      '<span class="ug-t"><b>앱 사용 설명서</b><span>처음이신가요? 사용 방법을 확인하세요</span></span>' +
      '<span class="ug-ar">›</span>';
    btn.onclick = openGuide;
    grid.insertAdjacentElement('afterend', btn);
  }

  var app = document.getElementById('app');
  if (!app) return;
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; ensureButton(); });
  }
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
