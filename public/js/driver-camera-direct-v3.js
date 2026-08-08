(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const token = hash.get('driverAccess') || query.get('driverAccess');
  if (!token) return;

  let stream = null;
  let cameraLayer = null;
  let uploading = false;

  const style = document.createElement('style');
  style.textContent = `
    #app .driver-photo-choice-grid{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:10px!important;
      width:100%!important;
      margin:0 0 10px!important;
    }
    #app .driver-photo-choice-grid > .btn{
      width:100%!important;
      min-width:0!important;
      margin:0!important;
      background:var(--primary,#2563eb)!important;
      border-color:var(--primary,#2563eb)!important;
      color:#fff!important;
    }
    .driver-direct-camera{
      position:fixed;inset:0;z-index:150000;background:#0f172a;
      display:flex;flex-direction:column;color:#fff
    }
    .driver-direct-camera-head{
      min-height:68px;padding:max(14px,env(safe-area-inset-top)) 16px 14px;
      box-sizing:border-box;display:flex;align-items:center;gap:10px;background:#0f172a
    }
    .driver-direct-camera-head strong{flex:1;font-size:22px;line-height:1.2}
    .driver-direct-camera-head button{
      width:42px;height:42px;border:0;border-radius:11px;background:rgba(255,255,255,.14);
      color:#fff;font-size:22px;font-weight:800
    }
    .driver-direct-camera-view{
      flex:1;min-height:0;display:grid;place-items:center;background:#020617;overflow:hidden
    }
    .driver-direct-camera-view video{width:100%;height:100%;object-fit:contain;background:#000}
    .driver-direct-camera-actions{
      padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#0f172a
    }
    .driver-direct-camera-actions button{
      width:100%;min-height:56px;border:0;border-radius:14px;background:#2563eb;
      color:#fff;font-size:18px;font-weight:900
    }
  `;
  document.head.appendChild(style);

  function toast(message) {
    document.querySelectorAll('.driver-camera-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'driver-camera-toast';
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed', left: '50%', bottom: 'calc(26px + env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)', zIndex: '160000', maxWidth: 'calc(100vw - 32px)',
      padding: '12px 16px', borderRadius: '12px', background: '#0f172a', color: '#fff',
      fontWeight: '800', textAlign: 'center', lineHeight: '1.45',
    });
    document.body.append(node);
    setTimeout(() => node.remove(), 3400);
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    cameraLayer?.remove();
    cameraLayer = null;
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('촬영한 사진을 저장하지 못했습니다.')), 'image/jpeg', quality);
    });
  }

  async function makePhoto(video) {
    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) throw new Error('카메라 화면이 아직 준비되지 않았습니다.');

    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('사진 촬영을 지원하지 않는 브라우저입니다.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    let blob = await canvasBlob(canvas, 0.84);
    if (blob.size > 4.5 * 1024 * 1024) blob = await canvasBlob(canvas, 0.70);
    if (blob.size > 4.5 * 1024 * 1024) blob = await canvasBlob(canvas, 0.58);
    canvas.width = 1;
    canvas.height = 1;
    return new File([blob], `현장사진-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  async function uploadCapturedPhoto(file, button) {
    if (uploading) return;
    uploading = true;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '업로드 중…';
    try {
      const form = new FormData();
      form.append('photo', file, file.name);
      const response = await fetch(`/api/driver-access/${encodeURIComponent(token)}/photo`, {
        method: 'POST',
        body: form,
      });
      let data = null;
      try { data = await response.json(); } catch { /* noop */ }
      if (!response.ok) throw new Error(data?.error || '현장사진 업로드에 실패했습니다.');
      stopCamera();
      location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      toast(error.message || '촬영한 사진 업로드에 실패했습니다.');
    } finally {
      uploading = false;
    }
  }

  async function openDirectCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast('현재 브라우저는 직접 카메라 촬영을 지원하지 않습니다. 카카오톡의 “다른 브라우저로 열기”에서 다시 시도해 주세요.');
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      const layer = document.createElement('section');
      layer.className = 'driver-direct-camera';
      layer.innerHTML = `
        <div class="driver-direct-camera-head">
          <strong>현장사진 촬영</strong>
          <button type="button" aria-label="촬영 취소">✕</button>
        </div>
        <div class="driver-direct-camera-view"><video autoplay playsinline muted></video></div>
        <div class="driver-direct-camera-actions"><button type="button">촬영 및 바로 업로드</button></div>`;
      document.body.appendChild(layer);
      cameraLayer = layer;

      const video = layer.querySelector('video');
      video.srcObject = stream;
      await video.play();
      layer.querySelector('.driver-direct-camera-head button').onclick = stopCamera;
      const captureButton = layer.querySelector('.driver-direct-camera-actions button');
      captureButton.onclick = async () => {
        try {
          captureButton.disabled = true;
          captureButton.textContent = '사진 처리 중…';
          const file = await makePhoto(video);
          await uploadCapturedPhoto(file, captureButton);
        } catch (error) {
          captureButton.disabled = false;
          captureButton.textContent = '촬영 및 바로 업로드';
          toast(error.message || '사진 촬영에 실패했습니다.');
        }
      };
    } catch (error) {
      stopCamera();
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        toast('카메라 권한이 허용되지 않았습니다. 브라우저의 카메라 권한을 허용해 주세요.');
      } else if (error?.name === 'NotFoundError') {
        toast('사용 가능한 카메라를 찾지 못했습니다.');
      } else {
        toast('현재 카카오톡 브라우저에서 직접 카메라를 열 수 없습니다. “다른 브라우저로 열기”에서 다시 시도해 주세요.');
      }
    }
  }

  function enhancePhotoPage() {
    const choose = document.getElementById('driverChoosePhoto');
    const oldCamera = document.getElementById('driverCameraPhoto');
    if (!choose || !oldCamera) return;

    const row = choose.closest('.btn-row');
    if (!row) return;
    row.classList.add('driver-photo-choice-grid');
    choose.className = 'btn btn-primary';

    if (oldCamera.dataset.directCamera === '1') return;
    const camera = oldCamera.cloneNode(true);
    camera.className = 'btn btn-primary';
    camera.dataset.directCamera = '1';
    oldCamera.replaceWith(camera);
    camera.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectCamera();
    };
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhancePhotoPage();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();

  window.addEventListener('pagehide', stopCamera);
})();
