(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_company_token';
  const TEMP_VEHICLE = '__temporary__';
  const flow = {
    active: false,
    context: null,
    vehicles: [],
    types: [],
    type: null,
    safetyPages: [],
    safetyIndex: 0,
    safetyAgree: {},
    files: {},
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>\"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));

  const formatPhone = (value) => {
    const d = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  function toast(message) {
    document.querySelectorAll('.company-request-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'company-request-toast';
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
    const token = localStorage.getItem(TOKEN_KEY) || '';
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(path, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch { /* noop */ }
    if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
    return data;
  }

  function oldAppbar(subtitle) {
    const type = flow.type;
    return `<div class="appbar" data-vehicle-type="${esc(type.id)}">
      <div><h1>${esc(type.name)}</h1><div class="sub">${esc(subtitle)}</div></div>
    </div>`;
  }

  function stepBar(current, total) {
    let dots = '';
    for (let i = 0; i < total; i += 1) dots += `<div class="dot ${i <= current ? 'done' : ''}"></div>`;
    return `<div class="steps" data-includes-vehicle-type="true">${dots}</div>`;
  }

  function buildSafetyPages(type) {
    const perPage = 6;
    const required = type.requiredSafetyRules || [];
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
    pages.push({ kind: 'other', rules: type.otherSafetyRules || [] });
    return pages;
  }

  const totalSteps = () => flow.safetyPages.length + 2;

  function historyState(stage, extra = {}) {
    return { companyFlow: 'request', companyRequestV2: stage, ...extra };
  }

  function pushStage(stage, extra = {}) {
    history.pushState(historyState(stage, extra), '');
    renderStage(stage, extra);
  }

  function renderSafety(index) {
    flow.active = true;
    flow.safetyIndex = index;
    const page = flow.safetyPages[index];
    if (!page) return;
    const isRequired = page.kind === 'required';
    const rules = page.rules.map((rule, i) => {
      const n = (isRequired ? page.offset : 0) + i + 1;
      return `<li><span class="n ${isRequired ? '' : 'other'}">${n}</span><span>${esc(rule)}</span></li>`;
    }).join('');
    const checked = !!flow.safetyAgree[index];
    const lastSafety = index === flow.safetyPages.length - 1;
    const nextKind = lastSafety ? null : flow.safetyPages[index + 1].kind;
    const nextLabel = lastSafety ? '다음 · 차량동선 안내'
      : (nextKind === 'other' ? '다음 · 기타 안전수칙' : '다음 · 필수 안전수칙');
    const sub = isRequired
      ? (page.reqTotal > 1 ? `필수 안전수칙 (${page.reqPage}/${page.reqTotal})` : '필수 안전수칙')
      : '기타 안전수칙';
    const headText = isRequired ? '필수안전수칙 : 위반시 안전지도서' : '기타안전수칙 : 위반시 안전계도서';
    const showAgree = !isRequired;

    app.innerHTML = oldAppbar(sub) + stepBar(index, totalSteps()) + `
      <div class="screen">
        <div class="rules-head ${isRequired ? 'req' : 'other'}">${headText}</div>
        <div class="card"><ul class="rule-list">${rules}</ul></div>
        ${showAgree ? `<label class="agree">
          <input type="checkbox" id="agreeChk" ${checked ? 'checked' : ''}>
          <span>위 필수·기타 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.</span>
        </label>` : ''}
        <div class="sticky-cta">
          <button class="btn btn-primary" id="rulesNext" ${showAgree && !checked ? 'disabled' : ''}>${nextLabel}</button>
        </div>
      </div>`;

    const check = document.getElementById('agreeChk');
    const next = document.getElementById('rulesNext');
    if (check) check.onchange = () => {
      flow.safetyAgree[index] = check.checked;
      if (next) next.disabled = !check.checked;
    };
    if (next) next.onclick = () => {
      if (showAgree && !flow.safetyAgree[index]) return;
      if (index < flow.safetyPages.length - 1) pushStage('safety', { safetyIndex: index + 1 });
      else pushStage('route');
    };
    window.scrollTo(0, 0);
  }

  function renderRoute() {
    flow.active = true;
    const type = flow.type;
    const steps = (type.route?.steps || []).map((step) => `<li>${esc(step)}</li>`).join('');
    app.innerHTML = oldAppbar('차량 동선 안내') + stepBar(flow.safetyPages.length, totalSteps()) + `
      <div class="screen">
        <div class="section-title">🗺️ 센터 내 이동 경로</div>
        <div class="card">
          <div class="route-summary">${esc(type.route?.summary || '')}</div>
          <ul class="route-list">${steps}</ul>
        </div>
        <div class="sticky-cta"><button class="btn btn-primary" id="companyRouteNext">다음 · 출입 신청</button></div>
      </div>`;
    document.getElementById('companyRouteNext')?.addEventListener('click', () => pushStage('request'));
    window.scrollTo(0, 0);
  }

  function requiredDocs() {
    return (flow.type?.requiredDocuments || []).filter((doc) => doc.key !== 'sitePhoto');
  }

  function documentRows() {
    return requiredDocs().map((doc) => {
      const file = flow.files[doc.key];
      const formButton = doc.formImage
        ? `<button type="button" class="form-fill" data-company-form="${esc(doc.key)}">양식</button>`
        : (doc.formUrl ? `<a class="form-dl" href="${esc(doc.formUrl)}" target="_blank" rel="noopener">양식 ↓</a>` : '');
      return `<div class="doc-item">
        <span class="dl-wrap"><span class="dl">${esc(doc.label)}</span>${formButton}${doc.note ? `<span class="dl-note">${esc(doc.note)}</span>` : ''}</span>
        <span class="up"><label class="file-btn ${file ? 'has' : ''}">
          ${file ? '첨부 완료' : '파일 선택'}
          <input type="file" data-doc="${esc(doc.key)}" accept="image/*,application/pdf"></label></span>
      </div>`;
    }).join('');
  }

  function vehicleOptions() {
    const options = flow.vehicles.map((vehicle) =>
      `<option value="${esc(vehicle.id)}">${esc(vehicle.vehicleNumber)} · ${esc(vehicle.driverName)}</option>`).join('');
    return `<option value="">차량 선택</option>${options}<option value="${TEMP_VEHICLE}">용차</option>`;
  }

  function renderRequest() {
    flow.active = true;
    const docs = requiredDocs();
    const hasDocs = docs.length > 0;
    app.innerHTML = oldAppbar(hasDocs ? '신청 정보 및 서류' : '출입 신청 정보') +
      stepBar(flow.safetyPages.length + 1, totalSteps()) + `
      <div class="screen">
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <label class="field-h"><span class="lb">출입일자</span><input type="date" id="companyReqDate" min="${today()}" value="${today()}"></label>
          <label class="field-h"><span class="lb">등록 차량</span><select id="companyReqVehicle">${vehicleOptions()}</select></label>
          <label class="field-h" id="companyTempVehicleRow"><span class="lb">차량번호</span><input type="text" id="companyReqTempVehicle" placeholder="차량을 선택하세요" readonly></label>
          <label class="field-h"><span class="lb">운전자명</span><input type="text" id="companyReqDriver"></label>
          <label class="field-h"><span class="lb">연락처</span><input type="tel" id="companyReqPhone" placeholder="010-0000-0000"></label>
        </div>
        ${hasDocs ? `<div class="section-title">📎 제출 서류</div><div class="card">${documentRows()}</div>` : ''}
        <div class="sticky-cta"><button class="btn btn-primary" id="companyReqSubmit">출입 신청 제출</button></div>
      </div>`;

    bindRequestScreen();
    window.scrollTo(0, 0);
  }

  function updateFileLabel(input, file) {
    const label = input?.closest('.file-btn');
    if (!label) return;
    const count = Array.isArray(file) ? file.length : (file ? 1 : 0);
    label.classList.toggle('has', count > 0);
    const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = count > 0 ? '첨부 완료' : '파일 선택';
  }

  // File 하나 또는 File 배열(작업계획서 3쪽 등)을 신청 상태에 직접 저장한다.
  function storeGeneratedFile(key, value) {
    if (!key) return false;
    const files = Array.isArray(value)
      ? value.filter((item) => item instanceof File)
      : (value instanceof File ? [value] : []);
    if (!files.length) return false;
    flow.files[key] = files.length === 1 ? files[0] : files;
    const input = document.querySelector(`input[data-doc="${CSS.escape(key)}"]`);
    updateFileLabel(input, flow.files[key]);
    return true;
  }

  // 작업계획서/TBM/위험성 체크리스트 등 앱에서 생성한 파일은
  // 모바일 브라우저의 input.files/DataTransfer를 거치지 않고 신청 상태에 직접 저장한다.
  window.__companyRequestAttachGeneratedFile = (key, file) => {
    if (!flow.active || !document.getElementById('companyReqSubmit')) return false;
    return storeGeneratedFile(key, file);
  };

  function setInputFile(key, file) {
    storeGeneratedFile(key, file);
  }

  function bindRequestScreen() {
    const vehicleSelect = document.getElementById('companyReqVehicle');
    const vehicleRow = document.getElementById('companyTempVehicleRow');
    const vehicleNumberInput = document.getElementById('companyReqTempVehicle');
    const driverInput = document.getElementById('companyReqDriver');
    const phoneInput = document.getElementById('companyReqPhone');

    const syncVehicle = () => {
      const value = vehicleSelect?.value || '';
      const temporary = value === TEMP_VEHICLE;
      if (vehicleRow) vehicleRow.hidden = false;
      if (vehicleNumberInput) {
        vehicleNumberInput.readOnly = !temporary;
        vehicleNumberInput.placeholder = temporary ? '용차 차량번호' : '차량을 선택하세요';
      }

      if (temporary) {
        if (vehicleNumberInput) vehicleNumberInput.value = '';
        if (driverInput) driverInput.value = '';
        if (phoneInput) phoneInput.value = '';
        return;
      }

      const vehicle = flow.vehicles.find((item) => item.id === value);
      if (vehicleNumberInput) vehicleNumberInput.value = vehicle?.vehicleNumber || '';
      if (driverInput) driverInput.value = vehicle?.driverName || '';
      if (phoneInput) phoneInput.value = vehicle?.driverPhone || '';
    };
    if (vehicleSelect) vehicleSelect.onchange = syncVehicle;
    if (phoneInput) phoneInput.oninput = () => { phoneInput.value = formatPhone(phoneInput.value); };
    syncVehicle();

    document.querySelectorAll('input[data-doc]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files?.[0] || null;
        const key = input.dataset.doc;
        if (file) flow.files[key] = file; else delete flow.files[key];
        updateFileLabel(input, file);
      });
    });

    document.querySelectorAll('[data-company-form]').forEach((button) => {
      button.addEventListener('click', () => {
        const doc = requiredDocs().find((item) => item.key === button.dataset.companyForm);
        if (doc?.formImage) openExistingFormAnnotator(doc);
      });
    });

    document.getElementById('companyReqSubmit')?.addEventListener('click', submitRequest);
  }

  async function submitRequest() {
    const button = document.getElementById('companyReqSubmit');
    const visitAt = document.getElementById('companyReqDate')?.value || '';
    const selected = document.getElementById('companyReqVehicle')?.value || '';
    const temporary = selected === TEMP_VEHICLE;
    const vehicleNumber = (document.getElementById('companyReqTempVehicle')?.value || '').trim();
    const driverName = (document.getElementById('companyReqDriver')?.value || '').trim();
    const driverPhone = (document.getElementById('companyReqPhone')?.value || '').trim();

    if (!visitAt) return toast('출입일자를 선택해 주세요.');
    if (!selected) return toast('등록 차량 또는 용차를 선택해 주세요.');
    if (temporary && !vehicleNumber) return toast('용차 차량번호를 입력해 주세요.');
    if (!driverName || !driverPhone) return toast('운전자명과 연락처를 입력해 주세요.');

    for (const doc of requiredDocs().filter((item) => item.required)) {
      const value = flow.files[doc.key];
      if (!value || (Array.isArray(value) && !value.length)) return toast(`${doc.label} 서류를 첨부해 주세요.`);
    }

    const form = new FormData();
    form.append('vehicleTypeId', flow.type.id);
    form.append('visitAt', visitAt);
    form.append('temporaryVehicle', temporary ? 'true' : 'false');
    form.append('companyVehicleId', temporary ? '' : selected);
    form.append('vehicleNumber', vehicleNumber);
    form.append('driverName', driverName);
    form.append('driverPhone', driverPhone);

    for (const doc of requiredDocs()) {
      const value = flow.files[doc.key];
      if (!value) continue;
      const files = Array.isArray(value) ? value : [value];
      for (const file of files) {
        form.append('documentKeys', doc.key);
        form.append('documents', file, file.name);
      }
    }

    const original = button?.textContent || '출입 신청 제출';
    if (button) { button.disabled = true; button.textContent = '제출 중…'; }
    try {
      await api('/api/company/requests', { method: 'POST', body: form });
      toast('출입 신청이 접수되었습니다.');
      history.replaceState({ companyFlow: 'home' }, '');
      setTimeout(() => location.reload(), 450);
    } catch (error) {
      toast(error.message || '출입 신청에 실패했습니다.');
      if (button?.isConnected) { button.disabled = false; button.textContent = original; }
    }
  }

  function openExistingFormAnnotator(doc) {
    document.querySelector('.annot')?.remove();
    const el = document.createElement('div');
    el.className = 'annot';
    el.innerHTML = `
      <div class="annot-bar">
        <button class="annot-x" type="button" aria-label="닫기">✕</button>
        <div class="annot-title">${esc(doc.label)} 작성</div>
        <button class="annot-save" type="button">저장</button>
      </div>
      <div class="annot-stage">
        <div class="annot-wrap"><img class="annot-bg" alt="양식"><canvas class="annot-cv"></canvas></div>
      </div>
      <div class="annot-tools">
        <button class="atool pen active" data-tool="pen" type="button">✏️ 펜</button>
        <span class="swatches">
          <button class="sw active" data-color="#1d4ed8" style="--c:#1d4ed8" type="button" aria-label="파랑"></button>
          <button class="sw" data-color="#dc2626" style="--c:#dc2626" type="button" aria-label="빨강"></button>
          <button class="sw" data-color="#111827" style="--c:#111827" type="button" aria-label="검정"></button>
        </span>
        <button class="atool" data-act="undo" type="button">↩︎ 되돌리기</button>
        <button class="atool" data-act="clear" type="button">전체 지우기</button>
      </div>
      <div class="annot-hint">한 손가락: 펜 &nbsp;·&nbsp; 두 손가락: 확대·이동</div>`;
    document.body.appendChild(el);

    const stage = el.querySelector('.annot-stage');
    const wrap = el.querySelector('.annot-wrap');
    const bg = el.querySelector('.annot-bg');
    const canvas = el.querySelector('.annot-cv');
    const ctx = canvas.getContext('2d');
    let scale = 1, tx = 0, ty = 0;
    const minScale = 0.25, maxScale = 8;
    let penActive = true, color = '#1d4ed8';
    const strokes = [];
    let current = null, mode = null, panStart = null, pinch = null;
    const pointers = new Map();

    const close = () => el.remove();
    const transform = () => { wrap.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    const drawStroke = (stroke) => {
      if (!stroke?.points?.length) return;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
      ctx.stroke();
    };
    const redraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(drawStroke);
    };
    const toCanvas = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      return { x: (clientX - rect.left - tx) / scale, y: (clientY - rect.top - ty) / scale };
    };

    bg.onload = () => {
      const width = bg.naturalWidth, height = bg.naturalHeight;
      canvas.width = width; canvas.height = height;
      wrap.style.width = `${width}px`; wrap.style.height = `${height}px`;
      const rect = stage.getBoundingClientRect();
      if (doc.focus) {
        scale = Math.max(minScale, Math.min(maxScale, rect.width / (doc.focus.w * width)));
        tx = -doc.focus.x * width * scale;
        ty = -doc.focus.y * height * scale + 8;
      } else {
        scale = Math.min(rect.width / width, 1.2);
        tx = Math.max(0, (rect.width - width * scale) / 2);
        ty = 10;
      }
      transform();
    };
    bg.src = doc.formImage;

    const onDown = (event) => {
      event.preventDefault();
      try { stage.setPointerCapture(event.pointerId); } catch { /* noop */ }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        current = null; mode = 'pinch';
        const points = [...pointers.values()];
        const dx = points[0].x - points[1].x, dy = points[0].y - points[1].y;
        const midX = (points[0].x + points[1].x) / 2, midY = (points[0].y + points[1].y) / 2;
        const c = toCanvas(midX, midY);
        pinch = { dist: Math.hypot(dx, dy) || 1, s0: scale, cx: c.x, cy: c.y };
      } else if (penActive) {
        mode = 'draw';
        current = { color, width: 4, points: [toCanvas(event.clientX, event.clientY)] };
      } else {
        mode = 'pan';
        panStart = { x: event.clientX, y: event.clientY, tx, ty };
      }
    };
    const onMove = (event) => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (mode === 'pinch' && pointers.size >= 2) {
        const points = [...pointers.values()];
        const dx = points[0].x - points[1].x, dy = points[0].y - points[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const midX = (points[0].x + points[1].x) / 2, midY = (points[0].y + points[1].y) / 2;
        const rect = stage.getBoundingClientRect();
        const nextScale = Math.max(minScale, Math.min(maxScale, pinch.s0 * (dist / pinch.dist)));
        tx = (midX - rect.left) - pinch.cx * nextScale;
        ty = (midY - rect.top) - pinch.cy * nextScale;
        scale = nextScale;
        transform();
      } else if (mode === 'draw' && current) {
        const point = toCanvas(event.clientX, event.clientY);
        const prev = current.points[current.points.length - 1];
        current.points.push(point);
        ctx.strokeStyle = current.color; ctx.lineWidth = current.width;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(point.x, point.y); ctx.stroke();
      } else if (mode === 'pan' && panStart) {
        tx = panStart.tx + (event.clientX - panStart.x);
        ty = panStart.ty + (event.clientY - panStart.y);
        transform();
      }
    };
    const onUp = (event) => {
      pointers.delete(event.pointerId);
      try { stage.releasePointerCapture(event.pointerId); } catch { /* noop */ }
      if (mode === 'draw' && current) { strokes.push(current); current = null; }
      if (pointers.size === 1) {
        const only = [...pointers.values()][0];
        mode = 'pan'; panStart = { x: only.x, y: only.y, tx, ty };
      } else if (pointers.size === 0) {
        mode = null; panStart = null; pinch = null;
      }
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);

    const penButton = el.querySelector('[data-tool="pen"]');
    if (penButton) penButton.onclick = (event) => {
      penActive = !penActive;
      event.currentTarget.classList.toggle('active', penActive);
      event.currentTarget.textContent = penActive ? '✏️ 펜' : '✋ 이동';
    };
    el.querySelectorAll('.sw').forEach((button) => button.onclick = () => {
      color = button.dataset.color;
      el.querySelectorAll('.sw').forEach((item) => item.classList.toggle('active', item === button));
      penActive = true;
      if (penButton) { penButton.classList.add('active'); penButton.textContent = '✏️ 펜'; }
    });
    el.querySelector('[data-act="undo"]').onclick = () => { strokes.pop(); redraw(); };
    el.querySelector('[data-act="clear"]').onclick = () => {
      if (strokes.length && !confirm('작성한 내용을 모두 지울까요?')) return;
      strokes.length = 0; redraw();
    };
    el.querySelector('.annot-x').onclick = () => {
      if (strokes.length && !confirm('저장하지 않고 닫을까요? 작성한 내용이 사라집니다.')) return;
      close();
    };
    el.querySelector('.annot-save').onclick = async () => {
      const button = el.querySelector('.annot-save');
      button.disabled = true; button.textContent = '저장 중…';
      try {
        const off = document.createElement('canvas');
        const maxSide = 1200;
        const ratio = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
        off.width = Math.round(canvas.width * ratio);
        off.height = Math.round(canvas.height * ratio);
        const out = off.getContext('2d');
        out.fillStyle = '#fff'; out.fillRect(0, 0, off.width, off.height);
        out.drawImage(bg, 0, 0, off.width, off.height);
        out.drawImage(canvas, 0, 0, off.width, off.height);
        const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/jpeg', 0.62));
        if (!blob) throw new Error('양식 파일을 만들 수 없습니다.');
        const file = new File([blob], `${doc.label}.jpg`, { type: 'image/jpeg' });
        setInputFile(doc.key, file);
        close();
        toast(`${doc.label} 첨부 완료`);
      } catch (error) {
        button.disabled = false; button.textContent = '저장';
        alert(error.message || '저장에 실패했습니다.');
      }
    };
  }

  function renderStage(stage, extra = {}) {
    if (!flow.type) return;
    if (stage === 'safety') return renderSafety(Number(extra.safetyIndex ?? flow.safetyIndex ?? 0));
    if (stage === 'route') return renderRoute();
    if (stage === 'request') return renderRequest();
  }

  async function loadContext() {
    const [context, vehicles, types] = await Promise.all([
      api('/api/company/contract-context'),
      api('/api/company/vehicles'),
      api('/api/vehicle-types', { headers: {} }),
    ]);
    const type = (types || []).find((item) => item.id === context.contractTypeId);
    if (!type) throw new Error('회원가입 시 선택한 계약유형을 확인할 수 없습니다.');
    flow.context = context;
    flow.vehicles = vehicles || [];
    flow.types = types || [];
    flow.type = type;
    flow.safetyPages = buildSafetyPages(type);
    flow.safetyIndex = 0;
    flow.safetyAgree = {};
    flow.files = {};
  }

  async function startRequestFlow(event) {
    const button = event.target.closest?.('[data-cf-view="request"]');
    if (!button || !button.closest('.cf-menu') || !app.classList.contains('company-flow-active')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    try {
      await loadContext();
      flow.active = true;
      pushStage('safety', { safetyIndex: 0 });
    } catch (error) {
      toast(error.message || '출입 신청 화면을 불러오지 못했습니다.');
    }
  }

  document.addEventListener('click', startRequestFlow, true);

  window.addEventListener('popstate', (event) => {
    const stage = event.state?.companyRequestV2;
    if (!stage) {
      flow.active = false;
      return;
    }
    if (!flow.type) return;
    flow.active = true;
    renderStage(stage, { safetyIndex: event.state?.safetyIndex });
  });
})();