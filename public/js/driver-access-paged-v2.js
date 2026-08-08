(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  const token = hash.get('driverAccess') || query.get('driverAccess');
  if (!token) return;

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const PHOTO_TARGET_BYTES = 4.5 * 1024 * 1024;
  const PHOTO_MAX_EDGE = 1920;

  const state = {
    data: null,
    safetyPages: [],
    safetyAgree: false,
    stage: '',
    safetyIndex: 0,
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>\"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[char]));

  function toast(message) {
    document.querySelectorAll('.driver-access-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'driver-access-toast';
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed', left: '50%', bottom: 'calc(26px + env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)', zIndex: '120000', maxWidth: 'calc(100vw - 32px)',
      padding: '12px 16px', borderRadius: '12px', background: '#0f172a', color: '#fff',
      fontWeight: '800', textAlign: 'center',
    });
    document.body.append(node);
    setTimeout(() => node.remove(), 2600);
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await response.json(); } catch { /* noop */ }
    if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
    return data;
  }

  function appbar(subtitle) {
    return `<div class="appbar" data-vehicle-type="${esc(state.data.vehicleTypeId || '')}">
      <div><h1>${esc(state.data.vehicleTypeName || '')}</h1><div class="sub">${esc(subtitle)}</div></div>
    </div>`;
  }

  function stepBar(current) {
    const total = state.safetyPages.length + 2;
    let dots = '';
    for (let i = 0; i < total; i += 1) dots += `<div class="dot ${i <= current ? 'done' : ''}"></div>`;
    return `<div class="steps" data-includes-vehicle-type="true">${dots}</div>`;
  }

  function buildSafetyPages(data) {
    const required = data.requiredSafetyRules || [];
    const perPage = 6;
    const requiredPages = Math.max(1, Math.ceil(required.length / perPage));
    const pages = [];
    for (let i = 0; i < requiredPages; i += 1) {
      pages.push({
        kind: 'required',
        rules: required.slice(i * perPage, i * perPage + perPage),
        offset: i * perPage,
        reqPage: i + 1,
        reqTotal: requiredPages,
      });
    }
    pages.push({ kind: 'other', rules: data.otherSafetyRules || [] });
    return pages;
  }

  function historyState(stage, extra = {}) {
    return { driverAccessPaged: true, stage, ...extra };
  }

  function go(stage, extra = {}, push = true) {
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
    const nextLabel = lastSafety ? '다음 · 차량동선 안내'
      : (nextKind === 'other' ? '다음 · 기타 안전수칙' : '다음 · 필수 안전수칙');
    const subtitle = isRequired
      ? (page.reqTotal > 1 ? `필수 안전수칙 (${page.reqPage}/${page.reqTotal})` : '필수 안전수칙')
      : '기타 안전수칙';
    const headText = isRequired ? '필수안전수칙 : 위반시 안전지도서' : '기타안전수칙 : 위반시 안전계도서';
    const showAgree = !isRequired;

    app.className = '';
    app.innerHTML = appbar(subtitle) + stepBar(state.safetyIndex) + `
      <div class="screen">
        <div class="rules-head ${isRequired ? 'req' : 'other'}">${headText}</div>
        <div class="card"><ul class="rule-list">${rules}</ul></div>
        ${showAgree ? `<label class="agree">
          <input type="checkbox" id="agreeChk" ${state.safetyAgree ? 'checked' : ''}>
          <span>위 필수·기타 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.</span>
        </label>` : ''}
        <div class="sticky-cta"><button class="btn btn-primary" id="driverSafetyNext" ${showAgree && !state.safetyAgree ? 'disabled' : ''}>${nextLabel}</button></div>
      </div>`;

    const agree = document.getElementById('agreeChk');
    const next = document.getElementById('driverSafetyNext');
    if (agree) agree.onchange = () => {
      state.safetyAgree = agree.checked;
      if (next) next.disabled = !agree.checked;
    };
    if (next) next.onclick = () => {
      if (showAgree && !state.safetyAgree) return;
      if (!lastSafety) go('safety', { safetyIndex: nextIndex });
      else go('route');
    };
    window.scrollTo(0, 0);
  }

  function renderRoute() {
    const route = state.data.route || {};
    const steps = (route.steps || []).map((step) => `<li>${esc(step)}</li>`).join('');
    app.className = '';
    app.innerHTML = appbar('차량 동선 안내') + stepBar(state.safetyPages.length) + `
      <div class="screen">
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
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.'));
      };
      image.src = url;
    });
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('사진을 최적화하지 못했습니다. 다시 촬영해 주세요.'));
      }, 'image/jpeg', quality);
    });
  }

  async function preparePhoto(file) {
    if (!file) throw new Error('현장사진을 선택해 주세요.');
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      throw new Error('현장사진은 JPG 또는 PNG 형식만 사용할 수 있습니다.');
    }
    if (file.size <= PHOTO_TARGET_BYTES) return file;

    const { image, url } = await loadPhotoImage(file);
    try {
      const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
      const scale = Math.min(1, PHOTO_MAX_EDGE / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('사진 최적화를 지원하지 않는 브라우저입니다.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let blob = null;
      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        blob = await canvasToJpeg(canvas, quality);
        if (blob.size <= PHOTO_TARGET_BYTES) break;
      }
      canvas.width = 1;
      canvas.height = 1;
      if (!blob || blob.size > MAX_UPLOAD_BYTES) {
        throw new Error('사진 용량을 5MB 이하로 줄이지 못했습니다. 카메라 해상도를 낮춰 다시 촬영해 주세요.');
      }
      return new File([blob], `현장사진-${Date.now()}.jpg`, { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadPhoto(file, button, { automatic = false } = {}) {
    if (!button) return;
    const original = button.textContent;
    button.disabled = true;
    try {
      button.textContent = file.size > PHOTO_TARGET_BYTES ? '사진 최적화 중…' : '업로드 중…';
      const prepared = await preparePhoto(file);
      button.textContent = '업로드 중…';
      const form = new FormData();
      form.append('photo', prepared, prepared.name);
      await api(`/api/driver-access/${encodeURIComponent(token)}/photo`, { method: 'POST', body: form });
      state.data = await api(`/api/driver-access/${encodeURIComponent(token)}`);
      history.replaceState(historyState('completed'), '');
      state.stage = 'completed';
      renderCompleted();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      toast(error.message || (automatic ? '촬영한 사진 자동 업로드에 실패했습니다.' : '현장사진 업로드에 실패했습니다.'));
    }
  }

  function renderPhoto() {
    app.className = '';
    app.innerHTML = appbar('현장사진 업로드') + stepBar(state.safetyPages.length + 1) + `
      <div class="screen">
        <div class="section-title">현장사진 업로드</div>
        <div class="card">
          <p style="margin:2px 0 14px;font-size:17px;line-height:1.55;color:var(--text-muted)">자재센터 출입 후 현장에서 촬영한 차량·운전자 사진을 등록해 주세요.</p>
          <div class="btn-row" style="margin-bottom:10px">
            <button type="button" class="btn btn-ghost" id="driverChoosePhoto">사진 선택</button>
            <button type="button" class="btn btn-primary" id="driverCameraPhoto">카메라로 촬영</button>
          </div>
          <input type="file" id="driverSitePhoto" accept="image/jpeg,image/png" hidden>
          <input type="file" id="driverCameraInput" accept="image/jpeg,image/png" capture="environment" hidden>
          <div id="driverPhotoStatus" style="min-height:24px;font-size:15px;font-weight:700;color:var(--text-muted)">촬영한 사진은 촬영 완료 후 바로 업로드됩니다.</div>
        </div>
        <div class="sticky-cta"><button class="btn btn-primary" id="driverPhotoUpload" disabled>선택한 사진 업로드 및 완료</button></div>
      </div>`;

    const fileInput = document.getElementById('driverSitePhoto');
    const cameraInput = document.getElementById('driverCameraInput');
    const chooseButton = document.getElementById('driverChoosePhoto');
    const cameraButton = document.getElementById('driverCameraPhoto');
    const uploadButton = document.getElementById('driverPhotoUpload');
    const status = document.getElementById('driverPhotoStatus');

    if (chooseButton && fileInput) chooseButton.onclick = () => {
      fileInput.value = '';
      fileInput.click();
    };
    if (fileInput) fileInput.onchange = () => {
      const file = fileInput.files?.[0] || null;
      if (status) status.textContent = file ? `선택됨 · ${file.name}` : '사진을 선택해 주세요.';
      if (uploadButton) uploadButton.disabled = !file;
    };
    if (uploadButton) uploadButton.onclick = async () => {
      const file = fileInput?.files?.[0];
      if (!file) return toast('현장사진을 선택해 주세요.');
      await uploadPhoto(file, uploadButton);
    };

    if (cameraButton && cameraInput) cameraButton.onclick = () => {
      cameraInput.value = '';
      cameraInput.click();
    };
    if (cameraInput) cameraInput.onchange = async () => {
      const file = cameraInput.files?.[0];
      if (!file) return;
      if (status) status.textContent = '촬영한 사진을 자동 업로드하고 있습니다.';
      if (chooseButton) chooseButton.disabled = true;
      if (uploadButton) uploadButton.disabled = true;
      await uploadPhoto(file, cameraButton, { automatic: true });
      if (chooseButton?.isConnected) chooseButton.disabled = false;
    };
    window.scrollTo(0, 0);
  }

  function renderCompleted() {
    app.className = '';
    app.innerHTML = appbar('출입 절차 완료') + `
      <div class="screen"><div class="result">
        <div class="big-ico">✅</div>
        <h2>최종 완료되었습니다.</h2>
        <p>안전수칙 확인과 현장사진 등록이 완료되었습니다.</p>
        <div class="passno">${esc(state.data.passNo || '')}</div>
      </div></div>`;
    window.scrollTo(0, 0);
  }

  function renderUnavailable(message) {
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
    if (!event.state?.driverAccessPaged || !state.data) return;
    state.stage = event.state.stage || state.stage;
    if (typeof event.state.safetyIndex === 'number') state.safetyIndex = event.state.safetyIndex;
    renderStage();
  });

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
