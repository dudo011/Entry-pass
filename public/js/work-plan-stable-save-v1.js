(() => {
  // 작업계획서 3쪽 저장 모듈
  // - 전역 fetch 몽키패치 없음
  // - 생성한 3쪽 JPEG를 신청 모듈에 배열(File[])로 직접 전달 (TBM/위험성 체크리스트와 동일한 저장 경로)
  // - 저장 버튼 문구로 단계별 진행 상황을 실기기에서 확인할 수 있게 표시
  const MAP_URL = '/route-images/construction.jpg?v=20260808-001';
  const PAGE_WIDTH = 1000;
  const PAGE_HEIGHT = 1414;
  const OUTPUT_WIDTH = 850;
  const OUTPUT_HEIGHT = Math.round(PAGE_HEIGHT * OUTPUT_WIDTH / PAGE_WIDTH);
  const OUTPUT_SCALE = OUTPUT_WIDTH / PAGE_WIDTH;
  const MAP_RECT = { x: 325, y: 620, width: 650, height: 760 };
  const IMAGE_TIMEOUT_MS = 6000;
  const PAGE_TIMEOUT_MS = 5000;

  let saving = false;
  let saved = false;

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
  const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

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
    if (saved) document.querySelectorAll('[data-wpe]').forEach((button) => { button.textContent = '수정'; });
  }

  async function waitForBackground(root, targetPage) {
    const started = Date.now();
    while (Date.now() - started < PAGE_TIMEOUT_MS) {
      const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
      if (currentPage(root) === targetPage && background?.complete && background.naturalWidth > 0) {
        ensureMapOverlay(root);
        await nextPaint();
        return;
      }
      await sleep(40);
    }
    throw new Error(`${targetPage}쪽 화면 준비 시간이 초과되었습니다. 다시 시도해 주세요.`);
  }

  async function goToPage(root, targetPage) {
    for (let guard = 0; guard < 5; guard += 1) {
      const page = currentPage(root);
      if (page === targetPage) {
        await waitForBackground(root, targetPage);
        return;
      }
      const direction = targetPage < page ? -1 : 1;
      const button = root.querySelector(direction < 0 ? '[data-p="-1"]' : '[data-p="1"]');
      if (!button || button.disabled) throw new Error('작업계획서 페이지를 이동할 수 없습니다.');
      button.click();
      await waitForBackground(root, page + direction);
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

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function capturePageFile(root, pageNumber, mapImage) {
    await goToPage(root, pageNumber);
    const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
    const drawing = root.querySelector('.wpe-w > canvas');
    if (!background || !drawing || !background.naturalWidth) throw new Error('작업계획서 화면을 확인할 수 없습니다.');

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('작업계획서 저장 화면을 만들 수 없습니다.');

    context.fillStyle = '#fff';
    context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    context.save();
    context.scale(OUTPUT_SCALE, OUTPUT_SCALE);
    context.drawImage(background, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    if (pageNumber === 2 && mapImage) drawContained(context, mapImage, MAP_RECT);
    context.drawImage(drawing, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    context.restore();

    await nextPaint();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    canvas.width = 1;
    canvas.height = 1;
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error(`${pageNumber}쪽 이미지 생성에 실패했습니다.`);
    const bytes = base64ToBytes(dataUrl.slice(comma + 1));
    return new File([bytes], `작업계획서 ${pageNumber}쪽.jpg`, { type: 'image/jpeg' });
  }

  async function save(root, button) {
    if (saving) return;
    saving = true;
    button.disabled = true;
    const setLabel = (text) => { if (button.isConnected) button.textContent = text; };

    try {
      setLabel('지도 불러오는 중…');
      const mapImage = await loadImage(MAP_URL);

      const files = [];
      for (let page = 1; page <= 3; page += 1) {
        setLabel(`${page}/3쪽 저장 중…`);
        files.push(await capturePageFile(root, page, mapImage));
      }

      // 3쪽 JPEG를 신청 모듈에 배열로 직접 전달한다. (fetch 조작·DataTransfer 없음)
      setLabel('신청서에 첨부 중…');
      const bridge = window.__companyRequestAttachGeneratedFile;
      if (typeof bridge !== 'function' || bridge('workPlan', files) !== true) {
        throw new Error('작성한 작업계획서를 신청 데이터에 저장하지 못했습니다. 신청 정보 화면에서 다시 시도해 주세요.');
      }

      saved = true;
      setLabel('완료');
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
    save(root, button);
  }, true);

  const observer = new MutationObserver(() => {
    refreshEditor();
    if (document.querySelector('.driver-result-refined-screen,.result .passno')) {
      saved = false;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  refreshEditor();
})();
