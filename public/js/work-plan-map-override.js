(() => {
  const MAP_URL = '/route-images/construction.jpg?v=20260806-002';
  const PAGE_WIDTH = 1000;
  const PAGE_HEIGHT = 1414;
  const MAP_RECT = { x: 325, y: 620, width: 650, height: 760 };
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const IMAGE_TIMEOUT_MS = 8000;
  const PAGE_TIMEOUT_MS = 6000;
  const BLOB_TIMEOUT_MS = 10000;
  const PDF_TIMEOUT_MS = 12000;

  let saving = false;
  let savedByOverride = false;

  const style = document.createElement('style');
  style.textContent = `
    .wpe-w > img:not(.wpe-map-overlay){z-index:0}
    .wpe-w > .wpe-map-overlay{
      position:absolute!important;
      left:${(MAP_RECT.x / PAGE_WIDTH) * 100}%!important;
      top:${(MAP_RECT.y / PAGE_HEIGHT) * 100}%!important;
      width:${(MAP_RECT.width / PAGE_WIDTH) * 100}%!important;
      height:${(MAP_RECT.height / PAGE_HEIGHT) * 100}%!important;
      inset:auto!important;
      box-sizing:border-box;
      object-fit:contain!important;
      object-position:center!important;
      background:#fff!important;
      border:1.5px solid #111827;
      z-index:1;
      pointer-events:none
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
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
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
    const text = root.querySelector('.wpe-p span')?.textContent || '';
    const page = Number.parseInt(text, 10);
    return Number.isFinite(page) ? page : 1;
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
      const canvas = wrap.querySelector('canvas');
      wrap.insertBefore(overlay, canvas || null);
    }
    overlay.hidden = currentPage(root) !== 2;
  }

  function refreshEditor() {
    document.querySelectorAll('.wpe').forEach(ensureMapOverlay);
    if (savedByOverride) {
      document.querySelectorAll('[data-wpe]').forEach((button) => {
        button.textContent = '수정';
      });
    }
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function waitForBackground(root, targetPage) {
    const started = Date.now();
    while (Date.now() - started < PAGE_TIMEOUT_MS) {
      const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
      if (currentPage(root) === targetPage && background?.complete && background.naturalWidth > 0) {
        await nextFrame();
        return;
      }
      await sleep(50);
    }
    throw new Error(`${targetPage}쪽 화면 준비 시간이 초과되었습니다. 다시 시도해 주세요.`);
  }

  async function goToPage(root, targetPage) {
    for (let guard = 0; guard < 4; guard += 1) {
      const page = currentPage(root);
      if (page === targetPage) {
        await waitForBackground(root, targetPage);
        ensureMapOverlay(root);
        return;
      }

      const direction = targetPage < page ? -1 : 1;
      const selector = direction < 0 ? '[data-p="-1"]' : '[data-p="1"]';
      const button = root.querySelector(selector);
      if (!button || button.disabled) throw new Error('작업계획서 페이지를 이동할 수 없습니다.');

      const expectedPage = page + direction;
      button.click();
      await waitForBackground(root, expectedPage);
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

  function bytes(text) {
    return new TextEncoder().encode(text);
  }

  function concat(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  async function createPdf(pages) {
    const objects = [];
    const pageRefs = [];
    let objectNumber = 3;

    for (const page of pages) {
      const pageObject = objectNumber++;
      const imageObject = objectNumber++;
      const contentObject = objectNumber++;
      const pageHeight = 595.28 * page.height / page.width;
      pageRefs.push(`${pageObject} 0 R`);

      objects[pageObject] = bytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 ${pageHeight.toFixed(2)}] ` +
        `/Resources << /XObject << /I ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
      );

      const jpeg = new Uint8Array(await page.blob.arrayBuffer());
      objects[imageObject] = concat([
        bytes(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
        ),
        jpeg,
        bytes('\nendstream'),
      ]);

      const drawing = `q\n595.28 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/I Do\nQ`;
      objects[contentObject] = bytes(
        `<< /Length ${bytes(drawing).length} >>\nstream\n${drawing}\nendstream`
      );
    }

    objects[1] = bytes('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = bytes(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`);

    const output = [bytes('%PDF-1.4\n%PDF\n')];
    const offsets = [0];
    let length = output[0].length;

    for (let index = 1; index < objects.length; index += 1) {
      const start = bytes(`${index} 0 obj\n`);
      const end = bytes('\nendobj\n');
      offsets[index] = length;
      output.push(start, objects[index], end);
      length += start.length + objects[index].length + end.length;
    }

    let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) {
      xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`;
    output.push(bytes(xref));
    return new Blob(output, { type: 'application/pdf' });
  }

  function canvasToJpeg(canvas) {
    return withTimeout(new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('작업계획서 페이지 이미지 생성에 실패했습니다.'));
      }, 'image/jpeg', 0.82);
    }), BLOB_TIMEOUT_MS, '작업계획서 이미지 저장 시간이 초과되었습니다. 다시 시도해 주세요.');
  }

  async function capturePage(root, pageNumber, mapImage) {
    await goToPage(root, pageNumber);
    const background = root.querySelector('.wpe-w > img:not(.wpe-map-overlay)');
    const drawing = root.querySelector('.wpe-w > canvas');
    if (!background || !drawing || !background.naturalWidth) {
      throw new Error('작업계획서 화면을 확인할 수 없습니다.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('작업계획서 저장용 화면을 만들 수 없습니다.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    context.drawImage(background, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    if (pageNumber === 2) drawContained(context, mapImage, MAP_RECT);
    context.drawImage(drawing, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);

    const blob = await canvasToJpeg(canvas);
    return { blob, width: PAGE_WIDTH, height: PAGE_HEIGHT };
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

  async function saveWithConstructionMap(root, button) {
    if (saving) return;
    saving = true;
    button.disabled = true;

    try {
      button.textContent = '동선 준비 중…';
      const mapImage = await loadImage(MAP_URL);
      const pages = [];
      for (let page = 1; page <= 3; page += 1) {
        button.textContent = `${page}/3 저장 중…`;
        pages.push(await capturePage(root, page, mapImage));
      }

      button.textContent = '파일 만드는 중…';
      const pdf = await withTimeout(
        createPdf(pages),
        PDF_TIMEOUT_MS,
        '작업계획서 파일 생성 시간이 초과되었습니다. 다시 시도해 주세요.'
      );
      if (pdf.size > MAX_FILE_BYTES) throw new Error('파일이 5MB를 초과했습니다.');

      button.textContent = '첨부 중…';
      attachWorkPlanFile(pdf);

      savedByOverride = true;
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
    saveWithConstructionMap(root, button);
  }, true);

  const observer = new MutationObserver(() => {
    refreshEditor();
    if (document.querySelector('.driver-result-refined-screen,.result .passno')) {
      savedByOverride = false;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  refreshEditor();
})();