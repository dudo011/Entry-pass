(() => {
  const MAP_URL = '/route-images/construction.jpg?v=20260808-001';
  const PAGE_WIDTH = 1000;
  const PAGE_HEIGHT = 1414;
  const PAGE_GAP = 18;
  const MAP_RECT = { x: 325, y: 620, width: 650, height: 760 };
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const IMAGE_TIMEOUT_MS = 6000;
  const PAGE_TIMEOUT_MS = 5000;
  const ENCODE_TIMEOUT_MS = 12000;

  let saving = false;
  let savedByFast = false;

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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  function loadImage(src) {
    return withTimeout(new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('차량 동선 이미지를 불러오지 못했습니다.'));
      image.src = src;
      if (image.complete && image.naturalWidth > 0) resolve(image);
    }), IMAGE_TIMEOUT_MS, '차량 동선 이미지 로딩 시간이 초과되었습니다. 다시 시도해 주세요.');
  }

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

  function refreshEditor() {
    document.querySelectorAll('.wpe').forEach(ensureMapOverlay);
    if (savedByFast) {
      document.querySelectorAll('[data-wpe]').forEach((button) => { button.textContent = '수정'; });
    }
  }

  async function waitForBackground(root, targetPage) {
    const started = Date.now();
    while (Date.now() - started < PAGE_TIMEOUT_MS) {
      const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
      if (currentPage(root) === targetPage && background?.complete && background.naturalWidth > 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        ensureMapOverlay(root);
        return;
      }
      await sleep(40);
    }
    throw new Error(`${targetPage}쪽 화면 준비 시간이 초과되었습니다. 다시 시도해 주세요.`);
  }

  async function goToPage(root, targetPage) {
    for (let guard = 0; guard < 4; guard += 1) {
      const page = currentPage(root);
      if (page === targetPage) {
        await waitForBackground(root, targetPage);
        return;
      }
      const selector = targetPage < page ? '[data-p="-1"]' : '[data-p="1"]';
      const button = root.querySelector(selector);
      if (!button || button.disabled) throw new Error('작업계획서 페이지를 이동할 수 없습니다.');
      const expected = page + (targetPage < page ? -1 : 1);
      button.click();
      await waitForBackground(root, expected);
    }
    throw new Error('작업계획서 페이지 이동 시간이 초과되었습니다. 다시 시도해 주세요.');
  }

  function drawContained(context, image, rect, padding = 12) {
    const maxWidth = rect.width - padding * 2;
    const maxHeight = rect.height - padding * 2;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = rect.x + (rect.width - width) / 2;
    const y = rect.y + (rect.height - height) / 2;
    context.save();
    context.fillStyle = '#fff';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.drawImage(image, x, y, width, height);
    context.strokeStyle = '#111827';
    context.lineWidth = 1.5;
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }

  async function drawPageInto(root, pageNumber, mapImage, target, offsetY) {
    await goToPage(root, pageNumber);
    const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
    const drawing = root.querySelector('.wpe-w > canvas');
    if (!background || !drawing || !background.naturalWidth) {
      throw new Error('작업계획서 화면을 확인할 수 없습니다.');
    }

    target.fillStyle = '#fff';
    target.fillRect(0, offsetY, PAGE_WIDTH, PAGE_HEIGHT);
    target.drawImage(background, 0, offsetY, PAGE_WIDTH, PAGE_HEIGHT);
    if (pageNumber === 2) {
      target.save();
      target.translate(0, offsetY);
      drawContained(target, mapImage, MAP_RECT);
      target.restore();
    }
    target.drawImage(drawing, 0, offsetY, PAGE_WIDTH, PAGE_HEIGHT);
  }

  function encodeJpeg(canvas) {
    return withTimeout(new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('작업계획서 이미지 생성에 실패했습니다.'));
      }, 'image/jpeg', 0.72);
    }), ENCODE_TIMEOUT_MS, '작업계획서 파일 생성 시간이 초과되었습니다. 다시 시도해 주세요.');
  }

  function attachWorkPlanFile(blob) {
    const input = document.querySelector('input[data-doc="workPlan"]');
    if (!input) throw new Error('작업계획서 첨부 항목을 찾을 수 없습니다.');
    if (typeof DataTransfer !== 'function') {
      throw new Error('이 기기에서 작성 파일 연결을 지원하지 않습니다. 브라우저를 다시 연 뒤 시도해 주세요.');
    }

    const file = new File([blob], '작업계획서.jpg', { type: 'image/jpeg' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    if (!input.files?.length) throw new Error('작성한 작업계획서를 첨부하지 못했습니다. 다시 시도해 주세요.');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function saveFast(root, button) {
    if (saving) return;
    saving = true;
    button.disabled = true;

    try {
      button.textContent = '동선 준비 중…';
      const mapImage = await loadImage(MAP_URL);
      const totalHeight = PAGE_HEIGHT * 3 + PAGE_GAP * 2;
      const combined = document.createElement('canvas');
      combined.width = PAGE_WIDTH;
      combined.height = totalHeight;
      const context = combined.getContext('2d', { alpha: false });
      if (!context) throw new Error('작업계획서 저장 화면을 만들 수 없습니다.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, combined.width, combined.height);

      for (let page = 1; page <= 3; page += 1) {
        button.textContent = `${page}/3 저장 중…`;
        const offsetY = (page - 1) * (PAGE_HEIGHT + PAGE_GAP);
        await drawPageInto(root, page, mapImage, context, offsetY);
      }

      button.textContent = '파일 만드는 중…';
      const blob = await encodeJpeg(combined);
      combined.width = 1;
      combined.height = 1;
      if (blob.size > MAX_FILE_BYTES) {
        throw new Error('작업계획서 파일이 5MB를 초과했습니다. 작성 내용을 줄이거나 다시 시도해 주세요.');
      }

      button.textContent = '첨부 중…';
      attachWorkPlanFile(blob);
      savedByFast = true;
      root.remove();
      requestAnimationFrame(refreshEditor);
    } catch (error) {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = '저장';
      }
      alert(error?.message || '작업계획서 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      saving = false;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.wpe-s');
    if (!button) return;
    const root = button.closest('.wpe');
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveFast(root, button);
  }, true);

  const observer = new MutationObserver(() => {
    refreshEditor();
    if (document.querySelector('.driver-result-refined-screen,.result .passno')) savedByFast = false;
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  refreshEditor();
})();
