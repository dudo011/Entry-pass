(() => {
  // 작업계획서 편집기의 2쪽 화면에 공사업체 차량 동선 지도를 오버레이로 표시한다.
  // 저장(3쪽 캡처 → 신청서 첨부)은 work-plan-form-editor.js가 메모리 기반으로 전담한다.
  // (구버전에 있던 전역 fetch 몽키패치 / DataTransfer / DOM 네비게이션 캡처는 모두 제거됨)
  const MAP_URL = '/route-images/construction.jpg?v=20260808-001';
  const PAGE_WIDTH = 1000;
  const PAGE_HEIGHT = 1414;
  const MAP_RECT = { x: 325, y: 620, width: 650, height: 760 };

  const style = document.createElement('style');
  style.textContent = `
    .wpe-w > img:not(.wpe-map-overlay){z-index:0}
    .wpe-w > .wpe-map-overlay{
      position:absolute!important;
      left:${(MAP_RECT.x / PAGE_WIDTH) * 100}%!important;
      top:${(MAP_RECT.y / PAGE_HEIGHT) * 100}%!important;
      width:${(MAP_RECT.width / PAGE_WIDTH) * 100}%!important;
      height:${(MAP_RECT.height / PAGE_HEIGHT) * 100}%!important;
      box-sizing:border-box!important;
      object-fit:contain!important;
      object-position:center!important;
      background:#fff!important;
      border:1.5px solid #111827!important;
      z-index:1!important;
      pointer-events:none!important
    }
    .wpe-w > .wpe-map-overlay[hidden]{display:none!important}
    .wpe-w > canvas{z-index:2}
  `;
  document.head.appendChild(style);

  function currentPage(root) {
    const value = Number.parseInt(root.querySelector('.wpe-p span')?.textContent || '1', 10);
    return Number.isFinite(value) ? value : 1;
  }

  function ensureMapOverlay(root) {
    const wrap = root?.querySelector('.wpe-w');
    if (!wrap) return;
    let overlay = wrap.querySelector('.wpe-map-overlay');
    if (!overlay) {
      overlay = document.createElement('img');
      overlay.className = 'wpe-map-overlay';
      overlay.src = MAP_URL;
      overlay.alt = '공사업체 차량 동선 안내도';
      wrap.insertBefore(overlay, wrap.querySelector('canvas') || null);
    }
    overlay.hidden = currentPage(root) !== 2;
  }

  function refresh() {
    document.querySelectorAll('.wpe').forEach(ensureMapOverlay);
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  refresh();
})();
