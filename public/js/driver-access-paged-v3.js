(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const token = hash.get('driverAccess') || query.get('driverAccess');
  if (!token) return;

  const PHOTO_TARGET_BYTES = 1.2 * 1024 * 1024;
  const PHOTO_MAX_EDGE = 1280;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

  const state = {
    data: null,
    safetyPages: [],
    safetyAgree: false,
    stage: '',
    safetyIndex: 0,
    photos: [],
    cameraStream: null,
    cameraLayer: null,
    busy: false,
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>\"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[char]));

  const style = document.createElement('style');
  style.textContent = `
    #app .driver-photo-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin:0 0 12px!important}
    #app .driver-photo-actions .btn{width:100%!important;min-width:0!important;margin:0!important;background:var(--primary,#2563eb)!important;border-color:var(--primary,#2563eb)!important;color:#fff!important}
    #app .driver-photo-list{margin-top:14px;border-top:1px solid #e2e8f0}
    #app .driver-photo-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid #e2e8f0}
    #app .driver-photo-item strong{display:block;font-size:15px}.driver-photo-item small{display:block;margin-top:3px;color:var(--text-muted,#64748b);font-size:13px}
    #app .driver-photo-remove{border:0;border-radius:10px;background:#fee2e2;color:#b91c1c;min-height:38px;padding:0 11px;font-weight:800}
    #app .driver-photo-status{min-height:24px;font-size:15px;font-weight:700;color:var(--text-muted,#64748b);line-height:1.45}
    #app .driver-complete-info{margin-top:16px;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px}
    #app .driver-complete-row{display:grid;grid-template-columns:112px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid #eef2f7;font-size:15px;line-height:1.4}
    #app .driver-complete-row:last-child{border-bottom:0}.driver-complete-row span{color:#64748b;font-weight:700}.driver-complete-row strong{color:#0f172a;font-weight:800;word-break:break-word}
    .driver-camera-layer{position:fixed;inset:0;z-index:150000;background:#0f172a;display:flex;flex-direction:column;color:#fff}
    .driver-camera-head{min-height:68px;padding:max(14px,env(safe-area-inset-top)) 16px 14px;box-sizing:border-box;display:flex;align-items:center;gap:10px;background:#0f172a}
    .driver-camera-head strong{flex:1;font-size:22px;line-height:1.2}.driver-camera-head button{width:42px;height:42px;border:0;border-radius:11px;background:rgba(255,255,255,.14);color:#fff;font-size:22px;font-weight:800}
    .driver-camera-view{flex:1;min-height:0;display:grid;place-items:center;background:#020617;overflow:hidden}.driver-camera-view video{width:100%;height:100%;object-fit:contain;background:#000}
    .driver-camera-actions{padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#0f172a}.driver-camera-actions button{width:100%;min-height:56px;border:0;border-radius:14px;background:#2563eb;color:#fff;font-size:18px;font-weight:900}
  `;
  document.head.appendChild(style);

  function toast(message) {
    document.querySelectorAll('.driver-access-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'driver-access-toast';
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed', left: '50%', bottom: 'calc(26px + env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)', zIndex: '160000', maxWidth: 'calc(100vw - 32px)',
      padding: '12px 16px', borderRadius: '12px', background: '#0f172a', color: '#fff',
      fontWeight: '800', textAlign: 'center', lineHeight: '1.45',
    });
    document.body.append(node);
    setTimeout(() => node.remove(), 3000);
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, {
      method: options.method || 'GET', headers,
      body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await response.json(); } catch { /* noop */ }
    if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
    return data;
  }

  function appbar(subtitle) {
    return `<div class="appbar" data-vehicle-type="${esc(state.data.vehicleTypeId || '')}"><div><h1>${esc(state.data.vehicleTypeName || '')}</h1><div class="sub">${esc(subtitle)}</div></div></div>`;
  }

  function stepBar(current) {
    const total = state.safetyPages.length + 2;
    let dots = '';
    for (let i = 0; i < total; i += 1) dots += `<div class="dot ${i <= current ? 'done' : ''}"></div>`;
    return `<div class="steps" data-includes-vehicle-type="true">${dots}</div>`;
  }

  function buildSafetyPages(data) {
    const required = data.requiredSafetyRules || [];
    const pages = [];
    const requiredPages = Math.max(1, Math.ceil(required.length / 6));
    for (let i = 0; i < requiredPages; i += 1) {
      pages.push({ kind: 'required', rules: required.slice(i * 6, i * 6 + 6), offset: i * 6, reqPage: i + 1, reqTotal: requiredPages });
    }
    pages.push({ kind: 'other', rules: data.otherSafetyRules || [] });
    return pages;
  }

  function historyState(stage, extra = {}) {
    return { driverAccessPaged: true, stage, ...extra };
  }

  function stopCamera() {
    if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    state.cameraLayer?.remove();
    state.cameraLayer = null;
  }

  function go(stage, extra = {}, push = true) {
    stopCamera();
    state.stage = stage;
    if (typeof extra.safetyIndex === 'number') state.safetyIndex = extra.safetyIndex;
    if (push) history.pushState(historyState(stage, extra), '');
    renderStage();
  }

  function renderSafety() {
    const page = state.safetyPages[state.safetyIndex];
    if (!page) return;
    const isRequired = page.kind === 'required';
    const rules = page.rules.map((rule, index) => {
      const number = (isRequired ? page.offset : 0) + index + 1;
      return `<li><span class="n ${isRequired ? '' : 'other'}">${number}</span><span>${esc(rule)}</span></li>`;
    }).join('');
    const nextIndex = state.safetyIndex + 1;
    const lastSafety = state.safetyIndex === state.safetyPages.length - 1;
    const nextKind = lastSafety ? '' : state.safetyPages[nextIndex]?.kind;
    const nextLabel = lastSafety ? '다음 · 차량동선 안내' : (nextKind === 'other' ? '다음 · 기타 안전수칙' : '다음 · 필수 안전수칙');
    const subtitle = isRequired ? (page.reqTotal > 1 ? `필수 안전수칙 (${page.reqPage}/${page.reqTotal})` : '필수 안전수칙') : '기타 안전수칙';
    const headText = isRequired ? '필수안전수칙 : 위반시 안전지도서' : '기타안전수칙 : 위반시 안전계도서';
    const showAgree = !isRequired;

    app.className = '';
    app.innerHTML = appbar(subtitle) + stepBar(state.safetyIndex) + `<div class="screen">
      <div class="rules-head ${isRequired ? 'req' : 'other'}">${headText}</div>
      <div class="card"><ul class="rule-list">${rules}</ul></div>
      ${showAgree ? `<label class="agree"><input type="checkbox" id="agreeChk" ${state.safetyAgree ? 'checked' : ''}><span>위 필수·기타 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.</span></label>` : ''}
      <div class="sticky-cta"><button class="btn btn-primary" id="driverSafetyNext" ${showAgree && !state.safetyAgree ? 'disabled' : ''}>${nextLabel}</button></div>
    </div>`;

    const agree = document.getElementById('agreeChk');
    const next = document.getElementById('driverSafetyNext');
    if (agree) agree.onchange = () => { state.safetyAgree = agree.checked; if (next) next.disabled = !agree.checked; };
    if (next) next.onclick = () => {
      if (showAgree && !state.safetyAgree) return;
      if (!lastSafety) go('safety', { safetyIndex: nextIndex }); else go('route');
    };
    window.scrollTo(0, 0);
  }

  function renderRoute() {
    const route = state.data.route || {};
    const steps = (route.steps || []).map((step) => `<li>${esc(step)}</li>`).join('');
    app.className = '';
    app.innerHTML = appbar('차량 동선 안내') + stepBar(state.safetyPages.length) + `<div class="screen">
      <div class="section-title">센터 내 이동 경로</div>
      <div class="card"><div class="route-summary">${esc(route.summary || '')}</div><ul class="route-list">${steps}</ul></div>
      <div class="sticky-cta"><button class="btn btn-primary" id="driverRouteNext">다음 · 현장사진 업로드</button></div>
    </div>`;

    const next = document.getElementById('driverRouteNext');
    if (next) next.onclick = async () => {
      next.disabled = true;
      const original = next.textContent;
      next.textContent = '확인 처리 중…';
      try {
        if (state.data.workflowStatus === 'safety_pending') {
          await api(`/api/driver-access/${encodeURIComponent(token)}/confirm-safety`, { method: 'POST', body: {} });
          state.data = await api(`/api/driver-access/${encodeURIComponent(token)}`);
        }
        go('photo');
      } catch (error) {
        next.disabled = false;
        next.textContent = original;
        toast(error.message || '안전수칙 확인 처리에 실패했습니다.');
      }
    };
    window.scrollTo(0, 0);
  }

  function loadPhotoImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이 사진 형식을 읽을 수 없습니다. JPG 또는 PNG 사진을 선택해 주세요.')); };
      image.src = url;
    });
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 최적화하지 못했습니다.')), 'image/jpeg', quality);
    });
  }

  async function prepareGalleryPhoto(file, index) {
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error(`${index + 1}번째 파일은 사진이 아닙니다.`);
    if (['image/jpeg', 'image/png'].includes(file.type) && file.size <= PHOTO_TARGET_BYTES) return file;

    const { image, url } = await loadPhotoImage(file);
    try {
      const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
      const scale = Math.min(1, PHOTO_MAX_EDGE / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('이 브라우저에서는 사진 최적화를 지원하지 않습니다.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let blob = await canvasToJpeg(canvas, 0.68);
      if (blob.size > PHOTO_TARGET_BYTES) blob = await canvasToJpeg(canvas, 0.54);
      canvas.width = 1; canvas.height = 1;
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error('사진 용량을 5MB 이하로 줄이지 못했습니다.');
      return new File([blob], `현장사진-${Date.now()}-${index + 1}.jpg`, { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function cameraPhoto(video) {
    return new Promise(async (resolve, reject) => {
      try {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        if (!width || !height) throw new Error('카메라 화면이 아직 준비되지 않았습니다.');
        const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('사진 촬영을 지원하지 않는 브라우저입니다.');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        let blob = await canvasToJpeg(canvas, 0.68);
        if (blob.size > PHOTO_TARGET_BYTES) blob = await canvasToJpeg(canvas, 0.54);
        canvas.width = 1; canvas.height = 1;
        resolve(new File([blob], `현장사진-촬영-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      } catch (error) { reject(error); }
    });
  }

  async function openCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast('현재 브라우저는 직접 카메라 촬영을 지원하지 않습니다. 다른 브라우저로 열어 주세요.');
      return;
    }
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const layer = document.createElement('section');
      layer.className = 'driver-camera-layer';
      layer.innerHTML = `<div class="driver-camera-head"><strong>현장사진 촬영</strong><button type="button" aria-label="촬영 취소">✕</button></div><div class="driver-camera-view"><video autoplay playsinline muted></video></div><div class="driver-camera-actions"><button type="button">사진 추가</button></div>`;
      document.body.appendChild(layer);
      state.cameraLayer = layer;
      const video = layer.querySelector('video');
      video.srcObject = state.cameraStream;
      await video.play();
      layer.querySelector('.driver-camera-head button').onclick = stopCamera;
      const capture = layer.querySelector('.driver-camera-actions button');
      capture.onclick = async () => {
        capture.disabled = true;
        capture.textContent = '사진 처리 중…';
        try {
          const file = await cameraPhoto(video);
          state.photos.push({ file, source: '카메라 촬영' });
          stopCamera();
          renderPhoto();
          toast(`현장사진이 추가되었습니다. 현재 ${state.photos.length}장입니다.`);
        } catch (error) {
          capture.disabled = false;
          capture.textContent = '사진 추가';
          toast(error.message || '사진 촬영에 실패했습니다.');
        }
      };
    } catch (error) {
      stopCamera();
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') toast('카메라 권한을 허용해 주세요.');
      else toast('현재 브라우저에서 카메라를 열 수 없습니다. 다른 브라우저로 열어 주세요.');
    }
  }

  function uploadWithProgress(form, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/driver-access/${encodeURIComponent(token)}/photo`);
      xhr.responseType = 'json';
      xhr.timeout = 30000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.max(1, Math.min(99, Math.round(event.loaded / event.total * 100))));
      };
      xhr.onload = () => {
        const data = xhr.response || {};
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error || '현장사진 업로드에 실패했습니다.'));
      };
      xhr.onerror = () => reject(new Error('네트워크 연결을 확인해 주세요.'));
      xhr.ontimeout = () => reject(new Error('사진 업로드 시간이 너무 오래 걸립니다. 다시 시도해 주세요.'));
      xhr.send(form);
    });
  }

  async function addGalleryFiles(files) {
    const input = [...files];
    if (!input.length || state.busy) return;
    state.busy = true;
    const status = document.getElementById('driverPhotoStatusV3');
    const choose = document.getElementById('driverPhotoChooseV3');
    const camera = document.getElementById('driverPhotoCameraV3');
    if (choose) choose.disabled = true;
    if (camera) camera.disabled = true;
    try {
      for (let i = 0; i < input.length; i += 1) {
        if (status) status.textContent = `사진 준비 중 ${i + 1}/${input.length} · 큰 사진은 자동으로 용량을 줄입니다.`;
        const prepared = await prepareGalleryPhoto(input[i], i);
        state.photos.push({ file: prepared, source: input[i].name || '사진 선택' });
      }
      renderPhoto();
      toast(`${input.length}장의 사진이 추가되었습니다.`);
    } catch (error) {
      if (status?.isConnected) status.textContent = error.message || '사진을 준비하지 못했습니다.';
      toast(error.message || '사진을 준비하지 못했습니다.');
    } finally {
      state.busy = false;
      if (choose?.isConnected) choose.disabled = false;
      if (camera?.isConnected) camera.disabled = false;
    }
  }

  async function submitPhotos(button) {
    if (!state.photos.length || state.busy) return;
    state.busy = true;
    const original = button.textContent;
    button.disabled = true;
    const choose = document.getElementById('driverPhotoChooseV3');
    const camera = document.getElementById('driverPhotoCameraV3');
    if (choose) choose.disabled = true;
    if (camera) camera.disabled = true;
    try {
      const form = new FormData();
      state.photos.forEach((item) => form.append('photo', item.file, item.file.name));
      const data = await uploadWithProgress(form, (percent) => { button.textContent = `업로드 중 ${percent}%`; });
      button.textContent = '완료 처리 중…';
      state.data = data;
      state.stage = 'completed';
      state.photos = [];
      history.replaceState(historyState('completed'), '');
      renderCompleted();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      if (choose?.isConnected) choose.disabled = false;
      if (camera?.isConnected) camera.disabled = false;
      toast(error.message || '현장사진 업로드에 실패했습니다.');
    } finally {
      state.busy = false;
    }
  }

  function renderPhoto() {
    app.className = '';
    const items = state.photos.map((item, index) => `<div class="driver-photo-item"><div><strong>현장사진 ${index + 1}</strong><small>${esc(item.source)} · ${Math.max(1, Math.round(item.file.size / 1024))}KB</small></div><button type="button" class="driver-photo-remove" data-photo-remove="${index}">삭제</button></div>`).join('');
    app.innerHTML = appbar('현장사진 업로드') + stepBar(state.safetyPages.length + 1) + `<div class="screen">
      <div class="section-title">현장사진 업로드</div>
      <div class="card">
        <p style="margin:2px 0 14px;font-size:17px;line-height:1.55;color:var(--text-muted)">차량과 운전자를 확인할 수 있도록 현장사진을 1장 이상 등록해 주세요. 필요한 만큼 여러 장 추가할 수 있습니다.</p>
        <div class="driver-photo-actions"><button type="button" class="btn btn-primary" id="driverPhotoChooseV3">사진 선택</button><button type="button" class="btn btn-primary" id="driverPhotoCameraV3">카메라로 촬영</button></div>
        <input type="file" id="driverPhotoInputV3" accept="image/*" multiple hidden>
        <div class="driver-photo-status" id="driverPhotoStatusV3">${state.photos.length ? `현재 ${state.photos.length}장의 사진이 준비되었습니다.` : '사진을 선택하거나 카메라로 촬영해 주세요.'}</div>
        ${state.photos.length ? `<div class="driver-photo-list">${items}</div>` : ''}
      </div>
      <div class="sticky-cta"><button class="btn btn-primary" id="driverPhotoSubmitV3" ${state.photos.length ? '' : 'disabled'}>현장사진 제출 및 완료</button></div>
    </div>`;

    const input = document.getElementById('driverPhotoInputV3');
    document.getElementById('driverPhotoChooseV3').onclick = () => { input.value = ''; input.click(); };
    input.onchange = () => addGalleryFiles(input.files || []);
    document.getElementById('driverPhotoCameraV3').onclick = openCamera;
    document.querySelectorAll('[data-photo-remove]').forEach((button) => {
      button.onclick = () => { state.photos.splice(Number(button.dataset.photoRemove), 1); renderPhoto(); };
    });
    document.getElementById('driverPhotoSubmitV3').onclick = (event) => submitPhotos(event.currentTarget);
    window.scrollTo(0, 0);
  }

  function formatVisitDate(value) {
    const text = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || '-';
    const date = new Date(`${text}T00:00:00`);
    const week = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. (${week})`;
  }

  function renderCompleted() {
    stopCamera();
    app.className = '';
    app.innerHTML = appbar('출입 절차 완료') + `<div class="screen"><div class="result">
      <div class="big-ico">✅</div><h2>최종 완료되었습니다.</h2><p>안전수칙 확인과 현장사진 등록이 완료되었습니다.</p>
      <div class="passno">${esc(state.data.vehicleNumber || '-')}</div>
      <div class="driver-complete-info">
        <div class="driver-complete-row"><span>출입일자</span><strong>${esc(formatVisitDate(state.data.visitAt))}</strong></div>
        <div class="driver-complete-row"><span>계약업체명</span><strong>${esc(state.data.company || '-')}</strong></div>
        <div class="driver-complete-row"><span>운전기사명</span><strong>${esc(state.data.driverName || '-')}</strong></div>
        <div class="driver-complete-row"><span>운전기사 연락처</span><strong>${esc(state.data.driverPhone || '-')}</strong></div>
      </div>
    </div></div>`;
    window.scrollTo(0, 0);
  }

  function renderUnavailable(message) {
    stopCamera();
    app.className = '';
    app.innerHTML = `<div class="appbar"><div><h1>자재센터 출입 안내</h1></div></div><div class="screen"><div class="card"><h2 class="title" style="font-size:20px">링크를 사용할 수 없습니다.</h2><p class="lead" style="margin-bottom:0">${esc(message)}</p></div></div>`;
  }

  function renderStage() {
    if (!state.data) return;
    if (state.stage === 'safety') return renderSafety();
    if (state.stage === 'route') return renderRoute();
    if (state.stage === 'photo') return renderPhoto();
    if (state.stage === 'completed') return renderCompleted();
  }

  window.addEventListener('popstate', (event) => {
    stopCamera();
    if (!event.state?.driverAccessPaged || !state.data) return;
    state.stage = event.state.stage || state.stage;
    if (typeof event.state.safetyIndex === 'number') state.safetyIndex = event.state.safetyIndex;
    renderStage();
  });
  window.addEventListener('pagehide', stopCamera);

  (async () => {
    try {
      state.data = await api(`/api/driver-access/${encodeURIComponent(token)}`);
      state.safetyPages = buildSafetyPages(state.data);
      if (state.data.workflowStatus === 'completed') state.stage = 'completed';
      else if (state.data.workflowStatus === 'photo_pending') state.stage = 'photo';
      else state.stage = 'safety';
      history.replaceState(historyState(state.stage, { safetyIndex: 0 }), '');
      renderStage();
    } catch (error) {
      renderUnavailable(error.message || '기사 안내 링크를 불러오지 못했습니다.');
    }
  })();
})();
