(() => {
  const MAP_URL = '/route-images/construction.jpg?v=20260808-001';
  const PAGE_WIDTH = 1000;
  const PAGE_HEIGHT = 1414;
  const OUTPUT_WIDTH = 850;
  const OUTPUT_HEIGHT = Math.round(PAGE_HEIGHT * OUTPUT_WIDTH / PAGE_WIDTH);
  const OUTPUT_SCALE = OUTPUT_WIDTH / PAGE_WIDTH;
  const MAP_RECT = { x: 325, y: 620, width: 650, height: 760 };
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const IMAGE_TIMEOUT_MS = 6000;
  const PAGE_TIMEOUT_MS = 5000;

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
    if (savedByFast) {
      document.querySelectorAll('[data-wpe]').forEach((button) => { button.textContent = '수정'; });
    }
  }

  async function waitForBackground(root, targetPage) {
    const started = Date.now();
    while (Date.now() - started < PAGE_TIMEOUT_MS) {
      const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
      if (currentPage(root) === targetPage && background?.complete && background.naturalWidth > 0) {
        await nextPaint();
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

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function capturePageJpeg(root, pageNumber, mapImage) {
    await goToPage(root, pageNumber);
    const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
    const drawing = root.querySelector('.wpe-w > canvas');
    if (!background || !drawing || !background.naturalWidth) {
      throw new Error('작업계획서 화면을 확인할 수 없습니다.');
    }

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
    if (pageNumber === 2) drawContained(context, mapImage, MAP_RECT);
    context.drawImage(drawing, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    context.restore();

    // 갤럭시 브라우저에서 큰 canvas.toBlob()이 멈추는 사례가 있어,
    // TBM과 비슷한 크기의 페이지별 canvas를 동기식 JPEG로 즉시 변환한다.
    await nextPaint();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    canvas.width = 1;
    canvas.height = 1;
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error(`${pageNumber}쪽 이미지 생성에 실패했습니다.`);
    return {
      bytes: base64ToBytes(dataUrl.slice(comma + 1)),
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
    };
  }

  function textBytes(text) {
    return new TextEncoder().encode(text);
  }

  function buildPdf(pages) {
    const objects = [];
    const pageRefs = [];
    let objectNumber = 3;

    for (const page of pages) {
      const pageObject = objectNumber++;
      const imageObject = objectNumber++;
      const contentObject = objectNumber++;
      const pageHeight = 595.28 * page.height / page.width;
      pageRefs.push(`${pageObject} 0 R`);

      objects[pageObject] = textBytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 ${pageHeight.toFixed(2)}] ` +
        `/Resources << /XObject << /I ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
      );
      objects[imageObject] = [
        textBytes(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
        ),
        page.bytes,
        textBytes('\nendstream'),
      ];
      const drawing = `q\n595.28 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/I Do\nQ`;
      objects[contentObject] = textBytes(
        `<< /Length ${textBytes(drawing).length} >>\nstream\n${drawing}\nendstream`
      );
    }

    objects[1] = textBytes('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = textBytes(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`);

    const parts = [textBytes('%PDF-1.4\n%PDF\n')];
    const offsets = [0];
    let length = parts[0].length;
    const pushPart = (part) => {
      if (Array.isArray(part)) part.forEach(pushPart);
      else { parts.push(part); length += part.length; }
    };

    for (let index = 1; index < objects.length; index += 1) {
      offsets[index] = length;
      pushPart(textBytes(`${index} 0 obj\n`));
      pushPart(objects[index]);
      pushPart(textBytes('\nendobj\n'));
    }

    let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) {
      xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`;
    parts.push(textBytes(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  function attachWorkPlanFile(pdf) {
    const input = document.querySelector('input[data-doc="workPlan"]');
    if (!input) throw new Error('작업계획서 첨부 항목을 찾을 수 없습니다.');
    if (typeof DataTransfer !== 'function') {
      throw new Error('이 기기에서 작성 파일 연결을 지원하지 않습니다. 브라우저를 다시 연 뒤 시도해 주세요.');
    }
    const file = new File([pdf], '작업계획서.pdf', { type: 'application/pdf' });
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
      const mapImage = await loadImage(MAP_URL);
      const pages = [];
      for (let page = 1; page <= 3; page += 1) {
        button.textContent = `${page}/3 저장 중…`;
        await nextPaint();
        pages.push(await capturePageJpeg(root, page, mapImage));
      }

      button.textContent = '파일 만드는 중…';
      await nextPaint();
      const pdf = buildPdf(pages);
      if (!pdf.size) throw new Error('작업계획서 파일 생성에 실패했습니다.');
      if (pdf.size > MAX_FILE_BYTES) throw new Error('작업계획서 파일이 5MB를 초과했습니다.');

      button.textContent = '첨부 중…';
      await nextPaint();
      attachWorkPlanFile(pdf);
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