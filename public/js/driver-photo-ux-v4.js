(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const token = hash.get('driverAccess') || query.get('driverAccess');
  if (!token) return;

  const CAMERA_MAX_EDGE = 800;
  const CAMERA_QUALITY = 0.55;

  let stream = null;
  let layer = null;
  let captureBusy = false;
  let baseCount = 0;
  let sessionFiles = [];

  const style = document.createElement('style');
  style.textContent = `
    #app .result .passno{margin-bottom:18px!important}
    #app .driver-complete-info{
      margin:0!important;
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      text-align:center!important;
    }
    #app .driver-complete-row{
      display:block!important;
      padding:7px 0!important;
      border:0!important;
      color:#0f172a!important;
      font-size:22px!important;
      font-weight:800!important;
      line-height:1.45!important;
      text-align:center!important;
      word-break:break-word!important;
    }
    .driver-fast-camera{
      position:fixed;inset:0;z-index:170000;background:#0f172a;
      display:flex;flex-direction:column;color:#fff
    }
    .driver-fast-camera-head{
      min-height:68px;padding:max(14px,env(safe-area-inset-top)) 16px 14px;
      box-sizing:border-box;display:flex;align-items:center;gap:10px;background:#0f172a
    }
    .driver-fast-camera-head strong{flex:1;font-size:22px;line-height:1.2}
    .driver-fast-camera-close{
      width:42px;height:42px;border:0;border-radius:11px;background:rgba(255,255,255,.14);
      color:#fff;font-size:22px;font-weight:800
    }
    .driver-fast-camera-view{
      position:relative;flex:1;min-height:0;display:grid;place-items:center;background:#020617;overflow:hidden
    }
    .driver-fast-camera-view video{width:100%;height:100%;object-fit:contain;background:#000}
    .driver-fast-camera-count{
      position:absolute;left:50%;bottom:16px;transform:translateX(-50%);
      padding:8px 12px;border-radius:999px;background:rgba(15,23,42,.78);
      color:#fff;font-size:15px;font-weight:800;white-space:nowrap
    }
    .driver-fast-camera-actions{
      padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#0f172a
    }
    .driver-fast-camera-capture{
      width:100%;min-height:56px;border:0;border-radius:14px;background:#2563eb;
      color:#fff;font-size:18px;font-weight:900
    }
  `;
  document.head.appendChild(style);

  function toast(message) {
    document.querySelectorAll('.driver-fast-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'driver-fast-toast';
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed', left: '50%', bottom: 'calc(26px + env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)', zIndex: '180000', maxWidth: 'calc(100vw - 32px)',
      padding: '12px 16px', borderRadius: '12px', background: '#0f172a', color: '#fff',
      fontWeight: '800', textAlign: 'center', lineHeight: '1.45',
    });
    document.body.append(node);
    setTimeout(() => node.remove(), 1800);
  }

  function stopStream() {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function removeCameraLayer() {
    stopStream();
    layer?.remove();
    layer = null;
    captureBusy = false;
  }

  function preparedCount() {
    const text = document.getElementById('driverPhotoStatusV3')?.textContent || '';
    const match = text.match(/현재\s*(\d+)장/);
    return match ? Number(match[1]) : 0;
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('촬영한 사진을 저장하지 못했습니다.'));
      }, 'image/jpeg', CAMERA_QUALITY);
    });
  }

  async function captureFast(video) {
    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) throw new Error('카메라 화면이 아직 준비되지 않았습니다.');

    const scale = Math.min(1, CAMERA_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('사진 촬영을 지원하지 않는 브라우저입니다.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToJpeg(canvas);
    canvas.width = 1;
    canvas.height = 1;
    return new File([blob], `현장사진-촬영-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  function commitSessionPhotos() {
    if (!sessionFiles.length) return;
    const input = document.getElementById('driverPhotoInputV3');
    if (!input) {
      sessionFiles = [];
      toast('현장사진 입력 화면을 찾을 수 없습니다.');
      return;
    }
    if (typeof DataTransfer !== 'function') {
      sessionFiles = [];
      toast('현재 브라우저에서는 연속 촬영을 지원하지 않습니다.');
      return;
    }

    const transfer = new DataTransfer();
    sessionFiles.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    const count = sessionFiles.length;
    sessionFiles = [];
    input.dispatchEvent(new Event('change', { bubbles: true }));
    toast(`${count}장의 촬영 사진을 목록에 추가했습니다.`);
  }

  function finishCameraSession() {
    if (captureBusy) return;
    removeCameraLayer();
    commitSessionPhotos();
  }

  async function openFastCamera() {
    if (layer || captureBusy) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast('현재 브라우저는 직접 카메라 촬영을 지원하지 않습니다. 다른 브라우저로 열어 주세요.');
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 800 },
          height: { ideal: 600 },
        },
      });

      baseCount = preparedCount();
      sessionFiles = [];
      layer = document.createElement('section');
      layer.className = 'driver-fast-camera';
      layer.innerHTML = `
        <div class="driver-fast-camera-head">
          <strong>현장사진 촬영</strong>
          <button type="button" class="driver-fast-camera-close" aria-label="촬영 종료">✕</button>
        </div>
        <div class="driver-fast-camera-view">
          <video autoplay playsinline muted></video>
          <div class="driver-fast-camera-count">현재 ${baseCount}장</div>
        </div>
        <div class="driver-fast-camera-actions">
          <button type="button" class="driver-fast-camera-capture">사진 추가</button>
        </div>`;
      document.body.appendChild(layer);

      const video = layer.querySelector('video');
      const capture = layer.querySelector('.driver-fast-camera-capture');
      const count = layer.querySelector('.driver-fast-camera-count');
      video.srcObject = stream;
      await video.play();

      layer.querySelector('.driver-fast-camera-close').onclick = finishCameraSession;
      capture.onclick = async () => {
        if (captureBusy) return;
        captureBusy = true;
        capture.disabled = true;
        capture.textContent = '사진 처리 중…';
        try {
          const file = await captureFast(video);
          sessionFiles.push(file);
          const total = baseCount + sessionFiles.length;
          count.textContent = `현재 ${total}장`;
          capture.textContent = '사진 추가';
          capture.disabled = false;
          toast(`현장사진 ${total}장이 준비되었습니다.`);
        } catch (error) {
          capture.disabled = false;
          capture.textContent = '사진 추가';
          toast(error.message || '사진 촬영에 실패했습니다.');
        } finally {
          captureBusy = false;
        }
      };
    } catch (error) {
      removeCameraLayer();
      sessionFiles = [];
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') toast('카메라 권한을 허용해 주세요.');
      else toast('현재 브라우저에서 카메라를 열 수 없습니다. 다른 브라우저로 열어 주세요.');
    }
  }

  function esc(value) {
    return String(value || '-').replace(/[&<>\"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[char]));
  }

  function normalizeCompleted() {
    const result = document.querySelector('#app .result');
    const info = result?.querySelector('.driver-complete-info');
    if (!result || !info || info.dataset.simpleComplete === '1') return;

    const description = result.querySelector(':scope > p');
    if (description) description.remove();

    const values = [...info.querySelectorAll('.driver-complete-row strong')].map((node) => node.textContent.trim());
    if (values.length < 4) return;
    const driver = values[2] && values[2] !== '-' && !values[2].endsWith('님') ? `${values[2]}님` : values[2];
    info.innerHTML = [values[0], values[1], driver || '-', values[3]]
      .map((value) => `<div class="driver-complete-row">${esc(value)}</div>`)
      .join('');
    info.dataset.simpleComplete = '1';
  }

  document.addEventListener('click', (event) => {
    const cameraButton = event.target.closest?.('#driverPhotoCameraV3');
    if (!cameraButton) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openFastCamera();
  }, true);

  const observer = new MutationObserver(normalizeCompleted);
  observer.observe(app, { childList: true, subtree: true });
  normalizeCompleted();

  window.addEventListener('pagehide', () => {
    sessionFiles = [];
    removeCameraLayer();
  });
})();
