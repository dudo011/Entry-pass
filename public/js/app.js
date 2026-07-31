/* 자재센터 출입 사전승인 앱 - 프런트엔드 (빌드 불필요 SPA) */
(() => {
  const app = document.getElementById('app');
  const TOKEN_KEY = 'ep_token';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 연락처 자동 하이픈: 010-1234-5678 형식
  const formatPhone = (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  };
  // 대한민국 공휴일(대체공휴일 포함). 음력 명절(설날·추석·부처님오신날)은 매년 달라지므로
  // 연 1회 갱신이 필요합니다. 미포함 연도는 주말만 제외합니다.
  const HOLIDAYS = new Set([
    // 2026
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
    '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28', '2026-10-03', '2026-10-05',
    '2026-10-09', '2026-12-25',
    // 2027
    '2027-01-01', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
    '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16',
    '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04',
    '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
  ]);
  const dateKey = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  // 다음 영업일(주말·공휴일 제외) 오전 9시
  function nextBusinessDay() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS.has(dateKey(d))) d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const toLocalDatetime = (d) =>
    `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // 방문 예정 일자 표시/선택용 (시간 없이 날짜 + 요일)
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const parseDateKey = (s) => {
    const [y, m, dd] = String(s || '').slice(0, 10).split('-').map(Number);
    return (y && m && dd) ? new Date(y, m - 1, dd) : null;
  };
  const fmtVisitDate = (s) => {
    const d = s instanceof Date ? s : parseDateKey(s);
    if (!d) return '-';
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${WD[d.getDay()]})`;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // 갤럭시 캘린더 앱 스타일의 월(月) 달력 (날짜만 선택, 시간 없음)
  function openCalendar() {
    const cur = parseDateKey(state.form.visitAt) || nextBusinessDay();
    const sel = new Date(cur);
    const view = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const close = openOverlay(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    function draw() {
      const y = view.getFullYear(), m = view.getMonth();
      const startWd = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const now = new Date();
      let cells = '';
      for (let i = 0; i < startWd; i++) cells += '<div></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(y, m, day);
        const wd = d.getDay();
        const cls = ['cal-cell'];
        if (wd === 0) cls.push('sun'); else if (wd === 6) cls.push('sat');
        if (HOLIDAYS.has(dateKey(d))) cls.push('hol');
        if (sameDay(d, now)) cls.push('today');
        if (sameDay(d, sel)) cls.push('sel');
        const blocked = d < today || HOLIDAYS.has(dateKey(d)); // 지난 날짜·공휴일 선택 불가
        cells += `<button type="button" class="${cls.join(' ')}" data-day="${day}" ${blocked ? 'disabled' : ''}>${day}</button>`;
      }
      backdrop.innerHTML = `<div class="cal-sheet">
        <div class="cal-head">
          <button class="cal-nav" data-mv="-1">‹</button>
          <div class="mtitle">${y}년 ${m + 1}월</div>
          <button class="cal-nav" data-mv="1">›</button>
        </div>
        <div class="cal-grid">
          <div class="cal-wd sun">일</div><div class="cal-wd">월</div><div class="cal-wd">화</div>
          <div class="cal-wd">수</div><div class="cal-wd">목</div><div class="cal-wd">금</div><div class="cal-wd sat">토</div>
          ${cells}
        </div>
        <div class="cal-actions">
          <button class="btn btn-ghost" data-cal="cancel">취소</button>
          <button class="btn btn-primary" data-cal="ok">확인</button>
        </div>
      </div>`;
      backdrop.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
        view.setMonth(view.getMonth() + Number(b.dataset.mv)); draw();
      });
      backdrop.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => {
        sel.setFullYear(y, m, Number(b.dataset.day)); draw();
      });
      backdrop.querySelector('[data-cal="cancel"]').onclick = close;
      backdrop.querySelector('[data-cal="ok"]').onclick = () => {
        state.form.visitAt = dateKey(sel);
        const btn = document.getElementById('visitAt');
        if (btn) btn.textContent = fmtVisitDate(sel);
        close();
      };
    }
    draw();
  }

  // 사진 확대(라이트박스) — 앱을 벗어나지 않고 인앱 오버레이로 표시, 뒤로가기로 닫힘
  function openLightbox(url, label) {
    const el = document.createElement('div');
    el.className = 'lightbox';
    el.innerHTML = `<button class="lb-close" type="button" aria-label="닫기">✕</button>
      <img src="${esc(url)}" alt="${esc(label || '')}">`;
    const close = openOverlay(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.classList.contains('lb-close')) close();
    });
  }

  // 앱 내 양식 작성(주석) — 양식 이미지를 캔버스에 띄우고 펜으로 작성 후
  // 저장하면 곧바로 해당 제출서류에 첨부(구글드라이브 왕복 생략).
  // 한 손가락=펜, 두 손가락=확대/이동. 기본 펜 색상은 파란색.
  function openFormAnnotator(doc) {
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
    const close = openOverlay(el);

    const stage = el.querySelector('.annot-stage');
    const wrap = el.querySelector('.annot-wrap');
    const bg = el.querySelector('.annot-bg');
    const cv = el.querySelector('.annot-cv');
    const ctx = cv.getContext('2d');

    let scale = 1, tx = 0, ty = 0;
    const MINS = 0.25, MAXS = 8;
    let penActive = true, color = '#1d4ed8';
    const BASE_W = 4; // 캔버스 픽셀 기준 펜 굵기
    const strokes = []; let cur = null;
    const pointers = new Map();
    let mode = null, panStart = null, pinch = null;

    const applyTf = () => { wrap.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    const redrawAll = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const s of strokes) strokePath(s);
    };
    function strokePath(s) {
      if (!s.points.length) return;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.01, s.points[0].y + 0.01);
      ctx.stroke();
    }
    // 화면 좌표 → 캔버스(양식 원본 픽셀) 좌표
    function toCanvas(clientX, clientY) {
      const r = stage.getBoundingClientRect();
      return { x: (clientX - r.left - tx) / scale, y: (clientY - r.top - ty) / scale };
    }

    bg.onload = () => {
      const w = bg.naturalWidth, h = bg.naturalHeight;
      cv.width = w; cv.height = h;
      wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
      const r = stage.getBoundingClientRect();
      if (doc.focus) {
        // 초점 영역(예: 핵심 Check Point 박스)을 화면 폭에 맞춰 확대, 상단 정렬
        scale = Math.max(MINS, Math.min(MAXS, r.width / (doc.focus.w * w)));
        tx = -doc.focus.x * w * scale;
        ty = -doc.focus.y * h * scale + 8;
      } else {
        // 초점 지정이 없으면 문서 전체를 폭 맞춤 + 상단 정렬
        scale = Math.min(r.width / w, 1.2);
        tx = (r.width - w * scale) / 2; if (tx < 0) tx = 0;
        ty = 10;
      }
      applyTf();
    };
    bg.src = doc.formImage;

    // ---- 포인터: 한 손가락 펜/이동, 두 손가락 확대·이동 ----
    function onDown(e) {
      try { stage.setPointerCapture(e.pointerId); } catch { /* noop */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // 두 손가락 → 확대/이동 시작 (진행 중이던 펜 획은 그대로 확정)
        cur = null; mode = 'pinch';
        const pts = [...pointers.values()];
        const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
        const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
        const c = toCanvas(midX, midY);
        pinch = { dist: Math.hypot(dx, dy), s0: scale, cx: c.x, cy: c.y };
      } else if (penActive) {
        mode = 'draw';
        cur = { color, width: BASE_W, points: [toCanvas(e.clientX, e.clientY)] };
      } else {
        mode = 'pan';
        panStart = { x: e.clientX, y: e.clientY, tx, ty };
      }
    }
    function onMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && pointers.size >= 2) {
        const pts = [...pointers.values()];
        const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
        let ns = pinch.s0 * (dist / pinch.dist);
        ns = Math.max(MINS, Math.min(MAXS, ns));
        const r = stage.getBoundingClientRect();
        // 두 손가락 중점 아래의 양식 지점을 고정
        tx = (midX - r.left) - pinch.cx * ns;
        ty = (midY - r.top) - pinch.cy * ns;
        scale = ns; applyTf();
      } else if (mode === 'draw' && cur) {
        const p = toCanvas(e.clientX, e.clientY);
        const prev = cur.points[cur.points.length - 1];
        cur.points.push(p);
        ctx.strokeStyle = cur.color; ctx.lineWidth = cur.width;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      } else if (mode === 'pan' && panStart) {
        tx = panStart.tx + (e.clientX - panStart.x);
        ty = panStart.ty + (e.clientY - panStart.y);
        applyTf();
      }
    }
    function onUp(e) {
      pointers.delete(e.pointerId);
      try { stage.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (mode === 'draw' && cur) { strokes.push(cur); cur = null; }
      if (pointers.size === 1) {
        // 확대 후 한 손가락 남으면 이동으로 전환(실수로 그려지지 않도록)
        const only = [...pointers.values()][0];
        mode = 'pan'; panStart = { x: only.x, y: only.y, tx, ty };
      } else if (pointers.size === 0) {
        mode = null; panStart = null; pinch = null;
      }
    }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);

    // ---- 도구 ----
    el.querySelector('[data-tool="pen"]').onclick = (ev) => {
      penActive = !penActive;
      ev.currentTarget.classList.toggle('active', penActive);
      ev.currentTarget.textContent = penActive ? '✏️ 펜' : '✋ 이동';
    };
    el.querySelectorAll('.sw').forEach((b) => b.onclick = () => {
      color = b.dataset.color;
      el.querySelectorAll('.sw').forEach((x) => x.classList.toggle('active', x === b));
      // 색을 고르면 펜을 자동 활성화
      penActive = true;
      const pt = el.querySelector('[data-tool="pen"]');
      pt.classList.add('active'); pt.textContent = '✏️ 펜';
    });
    el.querySelector('[data-act="undo"]').onclick = () => { strokes.pop(); redrawAll(); };
    el.querySelector('[data-act="clear"]').onclick = () => {
      if (strokes.length && !confirm('작성한 내용을 모두 지울까요?')) return;
      strokes.length = 0; redrawAll();
    };
    el.querySelector('.annot-x').onclick = () => {
      if (strokes.length && !confirm('저장하지 않고 닫을까요? 작성한 내용이 사라집니다.')) return;
      close();
    };
    el.querySelector('.annot-save').onclick = async () => {
      const btn = el.querySelector('.annot-save'); btn.disabled = true; btn.textContent = '저장 중…';
      const off = document.createElement('canvas');
      // 서버 저장용량 절감: 긴 변 1200px로 축소 + JPEG 품질 0.62 (체크·서명 판독 가능한 선)
      const maxSide = 1200;
      const s = Math.min(1, maxSide / Math.max(cv.width, cv.height));
      off.width = Math.round(cv.width * s); off.height = Math.round(cv.height * s);
      const octx = off.getContext('2d');
      octx.fillStyle = '#fff'; octx.fillRect(0, 0, off.width, off.height);
      octx.drawImage(bg, 0, 0, off.width, off.height);
      octx.drawImage(cv, 0, 0, off.width, off.height);
      const blob = await new Promise((res) => off.toBlob(res, 'image/jpeg', 0.62));
      const file = new File([blob], `${doc.label}.jpg`, { type: 'image/jpeg' });
      state.files[doc.key] = file;
      close();
      toast(`${doc.label} 첨부 완료`);
      render();
    };
  }

  const state = {
    view: 'landing',
    user: null,
    token: localStorage.getItem(TOKEN_KEY) || null,
    vehicleTypes: [],
    retentionYears: 3,
    // 기사 신청 플로우
    authMode: 'login',      // login | register
    authRole: 'driver',     // driver | staff
    selectedType: null,
    safetyPages: [],        // 선택 유형의 안전수칙 페이지들(필수 여러 장 + 기타)
    safetyIndex: 0,
    safetyAgree: {},        // 페이지별 동의 체크 상태
    agreedRequired: false,
    agreedOther: false,
    form: {},
    files: {},
    lastRequest: null,
    myRequests: [],
    // 직원 콘솔
    staffTab: 'pending',
    staffData: [],
    staffDetail: null,
    statsFilter: { from: '', to: '', typeId: '', vehicle: '', company: '' },
  };

  let poll = null;
  const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };

  // 뒤로가기(하드웨어/브라우저 '<') 지원용 화면 검증
  const AUTH_VIEWS = ['driverHome', 'driverProfile', 'driverTypes', 'driverSafety',
    'driverRoute', 'driverDocs', 'driverResult', 'staffConsole', 'staffDetail'];
  function canRender(view) {
    if (AUTH_VIEWS.includes(view) && !state.user) return false;
    if (['driverSafety', 'driverRoute', 'driverDocs'].includes(view) && !state.selectedType) return false;
    if (view === 'driverSafety' && !(state.safetyPages && state.safetyPages[state.safetyIndex])) return false;
    if (view === 'driverResult' && !state.lastRequest) return false;
    if (view === 'staffDetail' && !state.staffDetail) return false;
    return true;
  }
  const fallbackView = () => state.user ? (state.user.role === 'staff' ? 'staffConsole' : 'driverHome') : 'landing';
  function showView(view) { stopPoll(); state.view = view; render(); window.scrollTo(0, 0); }

  // 오버레이(달력·사진 확대 등): 뒤로가기 시 화면 이동 대신 오버레이만 닫히게
  const overlays = [];
  function openOverlay(node) {
    document.body.appendChild(node);
    overlays.push(() => node.remove());
    history.pushState({ view: state.view, ov: overlays.length }, '');
    return () => history.back(); // 닫기: 뒤로가기로 처리해 히스토리 일관성 유지
  }

  window.addEventListener('popstate', (e) => {
    if (overlays.length) { const rm = overlays.pop(); try { rm(); } catch { /* noop */ } return; }
    let view = (e.state && e.state.view) || 'landing';
    if (e.state && typeof e.state.si === 'number') state.safetyIndex = e.state.si;
    if (!canRender(view)) view = fallbackView();
    showView(view);
  });

  async function api(path, { method = 'GET', body, isForm } = {}) {
    const headers = {};
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, {
      method, headers, body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined),
    });
    let data = null;
    try { data = await res.json(); } catch { /* csv etc */ }
    if (!res.ok) throw new Error((data && data.error) || '요청에 실패했습니다.');
    return data;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  function go(view, opts) {
    const hs = { view };
    if (opts && opts.si !== undefined) { hs.si = opts.si; state.safetyIndex = opts.si; }
    try {
      if (opts && opts.replace) history.replaceState(hs, '');
      else history.pushState(hs, '');
    } catch { /* noop */ }
    showView(view);
  }
  function logout() {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.token = null; state.user = null; state.form = {}; state.files = {};
    localStorage.removeItem(TOKEN_KEY);
    go('landing');
  }

  // ==== 공통 UI ============================================================
  function appbar(title, sub, opts = {}) {
    return `<div class="appbar">
      ${opts.back ? '<button class="back" data-histback>‹</button>' : ''}
      ${opts.home ? '<button class="appbar-home" data-nav="driverHome" aria-label="홈">🏠</button>' : ''}
      <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
      ${opts.logout ? `<button class="link-btn" data-logout>로그아웃</button>` : ''}
    </div>`;
  }
  function stepBar(current, total) {
    let d = '';
    for (let i = 0; i < total; i++) d += `<div class="dot ${i <= current ? 'done' : ''}"></div>`;
    return `<div class="steps">${d}</div>`;
  }
  // 안전수칙 페이지 구성: 필수(6개 초과 시 여러 장) + 기타 1장
  function buildSafetyPages(t) {
    const PER = 6;
    const req = t.requiredSafetyRules || [];
    const nReq = Math.max(1, Math.ceil(req.length / PER));
    const pages = [];
    for (let i = 0; i < nReq; i++) {
      pages.push({ kind: 'required', rules: req.slice(i * PER, i * PER + PER),
        offset: i * PER, reqPage: i + 1, reqTotal: nReq });
    }
    pages.push({ kind: 'other', rules: t.otherSafetyRules || [] });
    return pages;
  }
  // 전체 단계 수 = 안전수칙 페이지들 + 동선 + 서류
  const safetyTotal = () => (state.safetyPages && state.safetyPages.length ? state.safetyPages.length : 1) + 2;
  const statusInfo = (s) => s === 'approved'
    ? { icon: '✅', title: '출입이 승인되었습니다', pill: '승인 완료' }
    : s === 'rejected'
    ? { icon: '⛔', title: '출입이 반려되었습니다', pill: '반려' }
    : { icon: '📨', title: '신청이 접수되었습니다', pill: '승인 대기 중' };

  // ==== 랜딩 ===============================================================
  function landing() {
    return `
      <div class="hero">
        <div class="logo">🏭</div>
        <h1>자재센터 출입 신청</h1>
        <p>출입 전 안전수칙을 확인하고<br>사전 승인을 받으세요.</p>
      </div>
      <div class="role-grid">
        <button class="role-btn" data-role="driver">
          <span class="emoji">🚚</span>
          <span><span class="rt">운전기사</span><br><span class="rd">안전수칙 확인 후 출입 신청</span></span>
          <span class="arrow">›</span>
        </button>
        <button class="role-btn" data-role="staff">
          <span class="emoji">🧑‍💼</span>
          <span><span class="rt">자재센터 직원</span><br><span class="rd">출입 신청 확인 및 승인</span></span>
          <span class="arrow">›</span>
        </button>
      </div>`;
  }

  // ==== 로그인 / 회원가입 ==================================================
  function authView() {
    const isDriver = state.authRole === 'driver';
    const isReg = isDriver && state.authMode === 'register';
    const typeOpts = state.vehicleTypes.map((t) =>
      `<option value="${t.id}">${esc(t.name)}</option>`).join('');

    // 라벨(항목명)과 입력칸을 좌우로 나란히 배치 (모든 항목 필수라 별표 생략)
    const fld = (label, input) =>
      `<label class="field-h"><span class="lb">${label}</span>${input}</label>`;

    const cardInner = isReg ? `
      ${fld('계약(차량) 유형', `<select id="a_vtype">${typeOpts}</select>`)}
      ${fld('차량번호(ID)', '<input type="text" id="a_loginId" autocomplete="username" placeholder="예: 12가3456">')}
      ${fld('비밀번호', '<input type="password" id="a_password" autocomplete="new-password" placeholder="비밀번호">')}
      ${fld('비밀번호 확인', '<input type="password" id="a_password2" autocomplete="new-password" placeholder="다시 입력">')}
      ${fld('이름', '<input type="text" id="a_name" placeholder="홍길동">')}
      ${fld('연락처', '<input type="tel" id="a_phone" placeholder="010-0000-0000">')}
      <p class="hint" style="margin:2px 2px 12px;text-align:left">※ 아이디는 <b>차량번호</b>로 입력하세요. (소속업체는 출입 신청 시 입력)</p>
      <button class="btn btn-primary" id="a_submit">가입하고 시작</button>` : `
      ${fld(isDriver ? '차량번호(ID)' : '아이디', `<input type="text" id="a_loginId" autocomplete="username" placeholder="${isDriver ? '차량번호' : '아이디'}">`)}
      ${fld('비밀번호', '<input type="password" id="a_password" autocomplete="current-password" placeholder="비밀번호">')}
      <button class="btn btn-primary" id="a_submit">로그인</button>`;

    return appbar(isDriver ? '운전기사' : '자재센터 직원', isReg ? '회원가입' : '로그인', { back: 'landing' }) + `
      <div class="screen">
        <div class="card">${cardInner}</div>
        ${isDriver ? `<p class="switch">
          ${isReg ? '이미 계정이 있으신가요?' : '처음 이용하시나요?'}
          <a data-authmode="${isReg ? 'login' : 'register'}">${isReg ? '로그인' : '회원가입'}</a>
        </p>` : `<p class="hint">직원 계정은 관리자에게 문의하세요. (초기: admin / staff)</p>`}
      </div>`;
  }

  async function submitAuth() {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const loginId = v('a_loginId').trim();
    const password = v('a_password');
    if (!loginId || !password) return toast('차량번호(ID)와 비밀번호를 입력하세요.');
    const btn = document.getElementById('a_submit');
    btn.disabled = true;
    try {
      let out;
      if (state.authRole === 'driver' && state.authMode === 'register') {
        const name = v('a_name').trim(), phone = v('a_phone').trim();
        if (!name || !phone) {
          btn.disabled = false; return toast('모든 항목을 입력해 주세요.');
        }
        if (password !== v('a_password2')) {
          btn.disabled = false; return toast('비밀번호가 일치하지 않습니다.');
        }
        // 아이디를 차량번호로 사용
        out = await api('/auth/register', { method: 'POST', body: {
          loginId, password, name, phone, defaultVehicleTypeId: v('a_vtype'),
        }});
      } else {
        out = await api('/auth/login', { method: 'POST', body: { loginId, password } });
      }
      state.token = out.token; state.user = out.user;
      localStorage.setItem(TOKEN_KEY, out.token);
      if (out.user.role !== state.authRole) {
        // 직원 화면에서 기사 계정으로 로그인 등 방지
        if (state.authRole === 'staff' && out.user.role !== 'staff') {
          logout(); return toast('직원 계정이 아닙니다.');
        }
      }
      enterAfterAuth();
    } catch (e) {
      btn.disabled = false; toast(e.message);
    }
  }

  function enterAfterAuth() {
    // 로그인/회원가입 화면을 히스토리에서 대체 → 뒤로가기 시 로그인 화면이 다시 뜨지 않음
    if (state.user.role === 'staff') { state.staffTab = 'pending'; go('staffConsole', { replace: true }); }
    else go('driverHome', { replace: true });
  }

  // ==== 기사 홈 (신규 신청 / 내 이력) ======================================
  function driverHome() {
    const u = state.user;
    // 헤더를 처음부터 최종 형태(차량번호, 서브타이틀 없음)로 렌더 → 로딩 시 헤더 교체 깜빡임 방지
    return appbar(u.defaultVehicleNumber || u.loginId, null, { logout: true }) + `
      <div class="screen">
        <button class="btn btn-primary big-cta" data-nav="driverTypes">＋ 새 출입 신청</button>
        <div class="profile-card card">
          <div class="section-title">내 기본정보 <a class="link-inline" data-nav="driverProfile">수정</a></div>
          <div class="row"><span class="k">차량번호(아이디)</span><span>${esc(u.defaultVehicleNumber || u.loginId) || '-'}</span></div>
          <div class="row"><span class="k">연락처</span><span>${esc(u.phone) || '-'}</span></div>
        </div>
        <div class="section-title">내 신청 내역</div>
        <div id="myList" class="muted">불러오는 중…</div>
      </div>`;
  }
  async function loadMyRequests() {
    try { state.myRequests = await api('/my/requests'); } catch { state.myRequests = []; }
    const box = document.getElementById('myList');
    if (!box) return;
    if (!state.myRequests.length) { box.innerHTML = '<div class="empty">아직 신청 내역이 없습니다.</div>'; return; }
    box.className = '';
    box.innerHTML = state.myRequests.map((r) => {
      const st = statusInfo(r.status);
      // 처음부터 최종 형태(출입날짜)로 렌더 + data-visit-refined 로 표시해
      // driver-home-refined 가 다시 건드리지 않게 함 → '방문목적→출입날짜' 깜빡임 제거
      const vk = String(r.visitAt || '').slice(0, 10);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(vk);
      const isPast = validDate && vk < dateKey(new Date());
      const vlabel = validDate ? `${vk.slice(0, 4)}. ${Number(vk.slice(5, 7))}. ${Number(vk.slice(8, 10))}` : '출입일자 미정';
      return `<button class="mini-card${isPast ? ' visit-expired' : ''}" data-open="${r.id}" data-visit-refined="true">
        <div class="mc-top"><span class="veh">${esc(vlabel)}</span>
          <span class="status-pill ${r.status}">${st.pill}</span></div>
        <div class="meta">${esc(r.passNo)} · ${new Date(r.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      </button>`;
    }).join('');
    box.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => {
      state.lastRequest = state.myRequests.find((r) => r.id === b.dataset.open);
      go('driverResult');
    });
  }

  // 기사 기본정보 수정
  function driverProfile() {
    const u = state.user;
    const typeOpts = state.vehicleTypes.map((t) =>
      `<option value="${t.id}" ${u.defaultVehicleTypeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    return appbar('내 기본정보', null, { back: 'driverHome' }) + `
      <div class="screen"><div class="card">
        <div class="row"><span class="k">차량번호(아이디)</span><span>${esc(u.defaultVehicleNumber || u.loginId)}</span></div>
        <label class="field" style="margin-top:12px"><span class="lb">이름</span><input type="text" id="p_name" value="${esc(u.name)}"></label>
        <label class="field"><span class="lb">연락처</span><input type="tel" id="p_phone" value="${esc(u.phone)}"></label>
        <label class="field"><span class="lb">계약(차량) 유형</span><select id="p_vtype">${typeOpts}</select></label>
        <button class="btn btn-primary" id="p_save">저장</button>
      </div></div>`;
  }

  // ==== 신청 플로우 ========================================================
  function driverTypes() {
    const cards = state.vehicleTypes.map((t) => `
      <button class="type-card" data-type="${t.id}" style="--tc:${t.color}">
        ${state.user && state.user.defaultVehicleTypeId === t.id ? '<span class="my-tag">내 계약</span>' : ''}
        <div class="ico">${t.icon}</div>
        <div class="tn-wrap"><div class="tn">${esc(t.name)}</div></div>
      </button>`).join('');
    return appbar('차량 유형 선택', '해당하는 차량을 선택하세요', { back: 'driverHome' }) +
      `<div class="screen"><div class="type-grid">${cards}</div></div>`;
  }

  function safetyScreen(idx) {
    const t = state.selectedType;
    const page = state.safetyPages[idx];
    const isReq = page.kind === 'required';
    const rules = page.rules.map((r, i) => {
      const n = (isReq ? page.offset : 0) + i + 1;
      return `<li><span class="n ${isReq ? '' : 'other'}">${n}</span><span>${esc(r)}</span></li>`;
    }).join('');
    const checked = !!state.safetyAgree[idx];
    const lastSafety = idx === state.safetyPages.length - 1;
    const nextKind = lastSafety ? null : state.safetyPages[idx + 1].kind;
    const nextLabel = lastSafety ? '다음 · 차량동선 안내'
      : (nextKind === 'other' ? '다음 · 기타 안전수칙' : '다음 · 필수 안전수칙');
    const sub = isReq
      ? (page.reqTotal > 1 ? `필수 안전수칙 (${page.reqPage}/${page.reqTotal})` : '필수 안전수칙')
      : '기타 안전수칙';
    const headText = isReq ? '필수안전수칙 : 위반시 안전지도서' : '기타안전수칙 : 위반시 안전계도서';
    // 동의는 마지막(기타 안전수칙) 페이지에서 필수·기타 전체를 한 번에 받습니다.
    const showAgree = !isReq;
    const agreeText = '위 필수·기타 안전수칙을 모두 확인하였으며 준수할 것에 동의합니다.';
    return appbar(t.name, sub, { back: true }) + stepBar(idx, safetyTotal()) + `
      <div class="screen">
        <div class="rules-head ${isReq ? 'req' : 'other'}">${headText}</div>
        <div class="card"><ul class="rule-list">${rules}</ul></div>
        ${showAgree ? `<label class="agree">
          <input type="checkbox" id="agreeChk" ${checked ? 'checked' : ''}>
          <span>${agreeText}</span>
        </label>` : ''}
        <div class="sticky-cta">
          <button class="btn btn-primary" id="rulesNext" ${showAgree && !checked ? 'disabled' : ''}>${nextLabel}</button>
        </div>
      </div>`;
  }

  function driverRoute() {
    const t = state.selectedType;
    const steps = t.route.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    return appbar(t.name, '차량 동선 안내', { back: true }) + stepBar(state.safetyPages.length, safetyTotal()) + `
      <div class="screen">
        <div class="section-title">🗺️ 센터 내 이동 경로</div>
        <div class="card">
          <div class="route-summary">${esc(t.route.summary)}</div>
          <ul class="route-list">${steps}</ul>
        </div>
        <div class="sticky-cta"><button class="btn btn-primary" data-nav="driverDocs">${t.requiredDocuments.length ? '다음 · 서류 제출' : '다음 · 출입 신청'}</button></div>
      </div>`;
  }

  function driverDocs() {
    const t = state.selectedType;
    const u = state.user;
    const f = state.form;
    const hasDocs = t.requiredDocuments.length > 0;
    // 방문 예정 일자 기본값(다음 영업일)을 최초 진입 시 설정
    if (state.form.visitAt === undefined) state.form.visitAt = dateKey(nextBusinessDay());
    // 저장된 기본정보로 프리필
    const val = (k, dflt) => esc(f[k] !== undefined ? f[k] : dflt);
    const docs = t.requiredDocuments.map((d) => {
      const has = state.files[d.key];
      const formBtn = d.formImage
        ? `<button type="button" class="form-fill" data-form="${d.key}">양식</button>`
        : (d.formUrl ? `<a class="form-dl" href="${esc(d.formUrl)}" target="_blank" rel="noopener">양식 ↓</a>` : '');
      return `<div class="doc-item">
        <span class="dl-wrap"><span class="dl">${esc(d.label)}</span>${formBtn}${d.note ? `<span class="dl-note">${esc(d.note)}</span>` : ''}</span>
        <span class="up"><label class="file-btn ${has ? 'has' : ''}">
          ${has ? '첨부 완료' : '파일 선택'}
          <input type="file" data-doc="${d.key}" accept="image/*,application/pdf"></label></span>
      </div>`;
    }).join('');
    const infoCard = `
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <label class="field-h"><span class="lb">방문일자</span>
            <button type="button" id="visitAt" class="datebtn">${esc(fmtVisitDate(state.form.visitAt))}</button></label>
          <label class="field-h"><span class="lb">계약업체</span>
            <input type="text" id="company" value="${val('company', '')}" placeholder="예: OO전력"></label>
        </div>`;
    const docsCard = hasDocs ? `
        <div class="section-title">📎 제출 서류</div>
        <div class="card">${docs}</div>` : '';
    return appbar(t.name, hasDocs ? '신청 정보 및 서류' : '출입 신청 정보', { back: true }) + stepBar(state.safetyPages.length + 1, safetyTotal()) + `
      <div class="screen">
        ${infoCard}
        ${docsCard}
        <div class="sticky-cta"><button class="btn btn-primary" id="submitReq">출입 신청 제출</button></div>
      </div>`;
  }

  function driverResult() {
    const r = state.lastRequest;
    const st = statusInfo(r.status);
    return appbar('신청 상세', null, { home: true }) + `
      <div class="screen">
        <div class="result">
          <div class="big-ico">${st.icon}</div>
          <h2>${st.title}</h2>
          <p>출입 승인번호</p>
          <div class="passno">${esc(r.passNo)}</div>
          <div><span class="status-pill ${r.status}">${st.pill}</span></div>
          ${r.status === 'rejected' && r.rejectReason
            ? `<p style="margin-top:12px;color:var(--danger)">반려 사유: ${esc(r.rejectReason)}</p>` : ''}
        </div>
        <div class="card">
          <div class="row"><span class="k">차량 유형</span><span>${esc(r.vehicleTypeName)}</span></div>
          <div class="row"><span class="k">기사명</span><span>${esc(r.driverName)}</span></div>
          <div class="row"><span class="k">차량번호</span><span>${esc(r.vehicleNumber)}</span></div>
          <div class="row"><span class="k">신청일시</span><span>${new Date(r.createdAt).toLocaleString('ko-KR')}</span></div>
          ${r.reviewedAt ? `<div class="row"><span class="k">처리</span><span>${esc(r.reviewedBy)} · ${new Date(r.reviewedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>` : ''}
        </div>
        <button class="btn btn-ghost" id="refreshStatus">🔄 승인 상태 새로고침</button>
      </div>`;
  }

  // ==== 직원 콘솔 ==========================================================
  const visKey = (r) => (r.visitAt || '').slice(0, 10);
  // 방문일자 오름차순 → 같은 날짜면 신청시간 오름차순 (빠른 날짜가 위로)
  const byVisitThenCreated = (a, b) => {
    const va = visKey(a), vb = visKey(b);
    if (va !== vb) return va < vb ? -1 : 1;
    return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
  };

  function staffConsole() {
    const u = state.user;
    const isAdmin = u.staffRole === 'admin';
    const todayKey = dateKey(new Date());
    const counts = {
      pending: state.staffData.filter((r) => r.status === 'pending').length,
      approved: state.staffData.filter((r) => r.status === 'approved' && visKey(r) >= todayKey).length,
      rejected: state.staffData.filter((r) => r.status === 'rejected' && visKey(r) >= todayKey).length,
    };
    const tab = (id, label, cnt) => `<button class="tab ${state.staffTab === id ? 'active' : ''}" data-tab="${id}">
      ${label}${cnt !== undefined ? ` <span class="cnt">${cnt}</span>` : ''}</button>`;
    const tabs = tab('pending', '대기', counts.pending) + tab('approved', '승인', counts.approved) +
      tab('rejected', '반려', counts.rejected) + tab('stats', '통계');

    const adminBar = `<div class="admin-bar"><span class="role-badge ${isAdmin ? 'admin' : ''}">${isAdmin ? '관리자' : '승인담당'}</span></div>`;

    let body;
    if (state.staffTab === 'stats') {
      body = statsPanel(isAdmin);
    } else {
      let list = state.staffData.filter((r) => r.status === state.staffTab);
      // 승인·반려는 출입 날짜가 지난 건 제외
      if (state.staffTab === 'approved' || state.staffTab === 'rejected') {
        list = list.filter((r) => visKey(r) >= todayKey);
      }
      list.sort(byVisitThenCreated);
      body = list.length ? list.map(staffListItem).join('')
        : `<div class="empty">${state.staffTab === 'pending' ? '대기 중인 신청이 없습니다.' : '항목이 없습니다.'}</div>`;
    }

    return appbar('출입 신청 관리', `${u.name}님`, { logout: true }) +
      `<div class="tabs">${tabs}</div>${adminBar}
       <div class="screen">${body}</div>`;
  }

  // 대기/승인/반려 리스트: 방문일자 + 차량번호만 표시, 클릭 시 상세
  function staffListItem(r) {
    const st = statusInfo(r.status);
    const t = state.vehicleTypes.find((x) => x.id === r.vehicleTypeId);
    return `<button class="mini-card" data-detail="${r.id}">
      <div class="mc-top"><span class="veh">${esc(r.vehicleNumber)}</span>
        <span class="status-pill ${r.status}">${st.pill}</span></div>
      <div class="meta">방문 ${esc(fmtVisitDate(r.visitAt))} · ${t ? t.icon : '🚚'} ${esc(r.vehicleTypeName)}</div>
    </button>`;
  }

  // 통계/조회: 필터 결과 반환
  function statsResults() {
    const f = state.statsFilter;
    let res = state.staffData.slice();
    if (f.from) res = res.filter((r) => visKey(r) >= f.from);
    if (f.to) res = res.filter((r) => visKey(r) <= f.to);
    if (f.typeId) res = res.filter((r) => r.vehicleTypeId === f.typeId);
    if (f.vehicle) res = res.filter((r) => (r.vehicleNumber || '').includes(f.vehicle));
    if (f.company) res = res.filter((r) => (r.company || '').includes(f.company));
    return res.sort(byVisitThenCreated);
  }

  function statsPanel(isAdmin) {
    const f = state.statsFilter;
    const typeOpts = ['<option value="">전체</option>'].concat(state.vehicleTypes.map((t) =>
      `<option value="${t.id}" ${f.typeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`)).join('');
    const res = statsResults();
    const by = { pending: 0, approved: 0, rejected: 0 };
    res.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
    const listHtml = res.length ? res.map(staffListItem).join('')
      : '<div class="empty">조회 결과가 없습니다.</div>';
    return `
      <div class="card">
        <label class="field"><span class="lb">출입 기간</span>
          <div class="date-range"><input type="date" id="st-from" value="${esc(f.from)}">
            <span>~</span><input type="date" id="st-to" value="${esc(f.to)}"></div></label>
        <label class="field"><span class="lb">출입 목적(유형)</span><select id="st-type">${typeOpts}</select></label>
        <label class="field"><span class="lb">차량번호</span>
          <input type="text" id="st-vehicle" value="${esc(f.vehicle)}" placeholder="일부만 입력해도 됩니다"></label>
        <label class="field"><span class="lb">계약업체</span>
          <input type="text" id="st-company" value="${esc(f.company)}" placeholder="일부만 입력해도 됩니다"></label>
        <div class="btn-row">
          <button class="btn btn-ghost" id="st-reset">초기화</button>
          <button class="btn btn-primary" id="st-search">조회</button>
        </div>
      </div>
      <div class="stat-summary">총 <b>${res.length}</b>건 · 대기 ${by.pending} · 승인 ${by.approved} · 반려 ${by.rejected}
        ${isAdmin ? '<button class="link-btn2" id="st-csv">📥 결과 Excel</button>' : ''}</div>
      ${listHtml}`;
  }

  // 직원용 상세: 신청정보 박스 + 필수서류 박스(사진 바로 표시)
  function staffDetail() {
    const r = state.staffDetail;
    if (!r) return staffConsole();
    const st = statusInfo(r.status);
    const docs = (r.documents || []);
    const docsHtml = docs.length ? `<div class="doc-thumbs">${docs.map((d) => {
      const isImg = (d.contentType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(d.label);
      return `<div class="doc-thumb-item">
        <div class="lbl">${esc(d.label)}</div>
        ${isImg
          ? `<img src="${esc(d.url)}" alt="${esc(d.label)}" loading="lazy" data-lightbox="${esc(d.url)}" data-label="${esc(d.label)}">`
          : `<a class="pdf" href="${esc(d.url)}" target="_blank" rel="noopener">📄 파일 열기</a>`}
      </div>`;
    }).join('')}</div>` : '<div class="muted" style="padding:0 2px">첨부 서류 없음</div>';

    return appbar('출입 신청 상세', st.pill, { back: true }) + `
      <div class="screen">
        <div class="section-title">📝 신청 정보</div>
        <div class="card">
          <div class="row"><span class="k">방문일자</span><span>${esc(fmtVisitDate(r.visitAt))}</span></div>
          <div class="row"><span class="k">차량번호</span><span>${esc(r.vehicleNumber)}</span></div>
          <div class="row"><span class="k">방문목적</span><span>${esc(r.vehicleTypeName)}</span></div>
          <div class="row"><span class="k">계약업체</span><span>${esc(r.company) || '-'}</span></div>
          <div class="row"><span class="k">연락처</span><span>${esc(r.phone)}</span></div>
          ${r.status === 'rejected' && r.rejectReason ? `<div class="row"><span class="k">반려사유</span><span>${esc(r.rejectReason)}</span></div>` : ''}
        </div>
        <div class="section-title">📎 필수 서류</div>
        ${docsHtml}
        ${r.status === 'pending' ? `<div class="sticky-cta"><div class="btn-row">
          <button class="btn btn-danger" data-reject="${r.id}">반려</button>
          <button class="btn btn-success" data-approve="${r.id}">승인</button>
        </div></div>` : ''}
      </div>`;
  }

  // ==== 렌더 + 이벤트 ======================================================
  function render() {
    const views = { landing, authView, driverHome, driverProfile, driverTypes,
      driverSafety: () => safetyScreen(state.safetyIndex),
      driverRoute, driverDocs, driverResult, staffConsole, staffDetail };
    app.innerHTML = (views[state.view] || landing)();
    bind();
    if (state.view === 'driverHome') loadMyRequests();
    // 통계 탭에선 폴링 중단(입력 중 재렌더로 필터가 초기화되지 않도록)
    if (state.view === 'staffConsole' && state.staffTab !== 'stats') ensurePolling();
    else stopPoll();
  }

  function readForm() {
    // 방문 예정 일시(visitAt)는 달력에서 직접 state.form 에 저장하므로 여기서 읽지 않음
    const el = document.getElementById('company');
    if (el) state.form.company = el.value;
  }

  function bind() {
    app.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      if (b.dataset.nav === 'driverDocs') readForm();
      go(b.dataset.nav);
    });
    app.querySelectorAll('[data-logout]').forEach((b) => b.onclick = logout);
    app.querySelectorAll('[data-histback]').forEach((b) => b.onclick = () => history.back());
    // 연락처 입력 시 자동 하이픈
    app.querySelectorAll('input[type=tel]').forEach((inp) => inp.oninput = () => { inp.value = formatPhone(inp.value); });
    // 방문 예정 일시: 탭하면 커스텀 월 달력 모달 열기
    const visitBtn = document.getElementById('visitAt');
    if (visitBtn) visitBtn.onclick = openCalendar;

    // 역할 선택
    app.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => {
      state.authRole = b.dataset.role; state.authMode = 'login';
      if (state.token && state.user && state.user.role === b.dataset.role) enterAfterAuth();
      else go('authView');
    });
    // 로그인/가입 전환
    app.querySelectorAll('[data-authmode]').forEach((a) => a.onclick = () => {
      state.authMode = a.dataset.authmode; render();
    });
    const aSubmit = document.getElementById('a_submit');
    if (aSubmit) aSubmit.onclick = submitAuth;

    // 프로필 저장
    const pSave = document.getElementById('p_save');
    if (pSave) pSave.onclick = async () => {
      const v = (id) => (document.getElementById(id) || {}).value || '';
      try {
        const out = await api('/auth/profile', { method: 'PUT', body: {
          name: v('p_name'), phone: v('p_phone'), defaultVehicleTypeId: v('p_vtype'),
        }});
        state.user = out.user; toast('저장되었습니다.'); go('driverHome');
      } catch (e) { toast(e.message); }
    };

    // 유형 선택
    app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
      state.selectedType = state.vehicleTypes.find((t) => t.id === b.dataset.type);
      state.safetyPages = buildSafetyPages(state.selectedType);
      state.safetyAgree = {}; state.agreedRequired = true; state.agreedOther = false;
      state.files = {}; state.form = {};
      go('driverSafety', { si: 0 });
    });

    // 안전수칙 체크 + 다음 (여러 장의 필수/기타 페이지 공통)
    const chk = document.getElementById('agreeChk');
    if (chk) chk.onchange = () => {
      const idx = state.safetyIndex;
      const page = state.safetyPages[idx];
      state.safetyAgree[idx] = chk.checked;
      // 마지막(기타) 페이지의 단일 동의로 필수·기타 전체 동의 처리 + 진행 게이트
      if (page && page.kind === 'other') {
        state.agreedOther = chk.checked;
        state.agreedRequired = chk.checked;
        const nx = document.getElementById('rulesNext');
        if (nx) nx.disabled = !chk.checked;
      }
    };
    const rulesNext = document.getElementById('rulesNext');
    if (rulesNext) rulesNext.onclick = () => {
      const idx = state.safetyIndex;
      if (idx < state.safetyPages.length - 1) go('driverSafety', { si: idx + 1 });
      else go('driverRoute');
    };

    // 양식 작성(앱 내 주석) 열기
    app.querySelectorAll('[data-form]').forEach((b) => b.onclick = () => {
      readForm();
      const d = state.selectedType.requiredDocuments.find((x) => x.key === b.dataset.form);
      if (d) openFormAnnotator(d);
    });

    // 파일 선택 (이미지는 업로드 전 자동 압축)
    app.querySelectorAll('input[type=file][data-doc]').forEach((inp) => inp.onchange = async () => {
      const key = inp.dataset.doc;
      if (inp.files[0]) {
        readForm();
        state.files[key] = await compressImage(inp.files[0]);
      } else { delete state.files[key]; }
      render();
    });

    const submit = document.getElementById('submitReq');
    if (submit) submit.onclick = submitRequest;
    const refresh = document.getElementById('refreshStatus');
    if (refresh) refresh.onclick = refreshStatus;

    // 직원 콘솔
    app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.staffTab = b.dataset.tab; render(); });
    app.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => {
      state.staffDetail = state.staffData.find((r) => r.id === b.dataset.detail);
      go('staffDetail');
    });
    app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => reviewReq(b.dataset.approve, 'approve'));
    app.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => reviewReq(b.dataset.reject, 'reject'));
    app.querySelectorAll('img[data-lightbox]').forEach((im) => im.onclick = () => openLightbox(im.dataset.lightbox, im.dataset.label));

    // 통계/조회
    const stSearch = document.getElementById('st-search');
    if (stSearch) stSearch.onclick = () => {
      const v = (id) => (document.getElementById(id) || {}).value || '';
      state.statsFilter = { from: v('st-from'), to: v('st-to'), typeId: v('st-type'),
        vehicle: v('st-vehicle').trim(), company: v('st-company').trim() };
      render();
    };
    const stReset = document.getElementById('st-reset');
    if (stReset) stReset.onclick = () => {
      state.statsFilter = { from: '', to: '', typeId: '', vehicle: '', company: '' }; render();
    };
    const stCsv = document.getElementById('st-csv');
    if (stCsv) stCsv.onclick = downloadStatsXlsx;
  }

  // ---- 순수 JS xlsx 생성기 (라이브러리 없이, store-zip + inlineStr) ----
  const _crcTable = (() => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const _crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = _crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function _zipStore(files) {
    const u16 = (n) => [n & 255, (n >> 8) & 255]; const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
    const D = 20513, T = 0; const chunks = [], central = []; let off = 0;
    for (const f of files) {
      const nm = new TextEncoder().encode(f.name); const crc = _crc32(f.data); const sz = f.data.length;
      const lh = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(T), ...u16(D), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)];
      const local = new Uint8Array(lh.length + nm.length + sz); local.set(lh, 0); local.set(nm, lh.length); local.set(f.data, lh.length + nm.length);
      chunks.push(local);
      const ch = [0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(T), ...u16(D), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)];
      const cd = new Uint8Array(ch.length + nm.length); cd.set(ch, 0); cd.set(nm, ch.length); central.push(cd); off += local.length;
    }
    const cs = central.reduce((a, c) => a + c.length, 0);
    const eocd = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), ...u16(0)]);
    const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0) + cs + eocd.length); let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    for (const c of central) { out.set(c, p); p += c.length; }
    out.set(eocd, p); return out;
  }
  const _xe = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const _col = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function buildXlsx(sheetName, aoa) {
    const enc = new TextEncoder();
    let rows = '';
    aoa.forEach((row, ri) => {
      let cells = '';
      row.forEach((v, ci) => { cells += `<c r="${_col(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${_xe(v)}</t></is></c>`; });
      rows += `<row r="${ri + 1}">${cells}</row>`;
    });
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
    return _zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
      { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${_xe(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
      { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
    ]);
  }

  function downloadStatsXlsx() {
    const res = statsResults();
    const stK = { pending: '대기', approved: '승인', rejected: '반려' };
    const header = ['방문일자', '요일', '차량번호', '출입목적', '계약업체', '연락처', '상태', '신청일시'];
    const aoa = [header].concat(res.map((r) => {
      const d = parseDateKey(r.visitAt);
      return [d ? dateKey(d) : '', d ? WD[d.getDay()] : '', r.vehicleNumber, r.vehicleTypeName,
        r.company, r.phone, stK[r.status] || r.status, new Date(r.createdAt).toLocaleString('ko-KR')];
    }));
    const data = buildXlsx('조회결과', aoa);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'entry-stats.xlsx'; a.click();
    toast('결과를 Excel로 내보냈습니다.');
  }

  async function downloadCsv() {
    const res = await fetch('/api/requests/export.csv', { headers: { Authorization: 'Bearer ' + state.token } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'entry-records.csv'; a.click();
  }

  // 이미지는 긴 변 1600px·JPEG 품질 0.72 로 축소해 용량을 줄입니다 (사진 업로드 대비).
  // PDF 등 이미지가 아닌 파일은 그대로 둡니다.
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  async function compressImage(file) {
    if (!file.type || !file.type.startsWith('image/')) return file;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.72));
      if (blob && blob.size < file.size) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    } catch { /* 실패 시 원본 사용 */ }
    return file;
  }

  async function submitRequest() {
    readForm();
    const f = state.form;
    const u = state.user;
    // 기사명·연락처·차량번호는 회원가입 정보(프로필)에서 자동 사용
    const vnum = u.defaultVehicleNumber || u.loginId;
    const missing = state.selectedType.requiredDocuments.filter((d) => d.required && !state.files[d.key]);
    if (missing.length) return toast(`필수 서류 미첨부: ${missing[0].label}`);
    const tooBig = Object.values(state.files).find((file) => file.size > MAX_UPLOAD_BYTES);
    if (tooBig) return toast(`파일이 너무 큽니다(5MB 초과): ${tooBig.name}. 사진으로 찍어 올려주세요.`);
    const btn = document.getElementById('submitReq'); btn.disabled = true; btn.textContent = '제출 중…';
    const fd = new FormData();
    fd.append('vehicleTypeId', state.selectedType.id);
    fd.append('driverName', u.name); fd.append('phone', u.phone);
    fd.append('vehicleNumber', vnum); fd.append('company', f.company || '');
    fd.append('visitAt', f.visitAt || ''); fd.append('purpose', '');
    fd.append('agreedRequired', 'true'); fd.append('agreedOther', String(state.agreedOther));
    Object.values(state.files).forEach((file) => fd.append('documents', file));
    try {
      const data = await api('/requests', { method: 'POST', body: fd, isForm: true });
      state.lastRequest = data; state.form = {}; state.files = {};
      go('driverResult');
    } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = '출입 신청 제출'; }
  }

  async function refreshStatus() {
    if (!state.lastRequest) return;
    try {
      const data = await api('/requests/' + state.lastRequest.id);
      state.lastRequest = data; render();
      toast(data.status === 'pending' ? '아직 승인 대기 중입니다.' : '상태가 갱신되었습니다.');
    } catch (e) { toast(e.message); }
  }

  async function reviewReq(id, action) {
    let body = {};
    if (action === 'reject') body = { reason: prompt('반려 사유를 입력하세요 (선택):') || '' };
    try {
      await api(`/requests/${id}/${action}`, { method: 'POST', body });
      toast(action === 'approve' ? '승인되었습니다.' : '반려되었습니다.');
      await loadStaff();
      // 상세 화면에서 처리했으면 목록으로 복귀
      if (state.view === 'staffDetail') history.back();
    } catch (e) { toast(e.message); }
  }

  async function loadStaff() {
    try { state.staffData = await api('/requests'); } catch (e) { return toast(e.message); }
    if (state.view === 'staffConsole') render();
  }
  // 이미 폴링 중이면 재시작하지 않음(재렌더 → 재시작 무한루프 방지)
  function ensurePolling() {
    if (poll) return;
    loadStaff();
    poll = setInterval(loadStaff, 5000);
  }

  // ==== 부팅 ===============================================================
  async function boot() {
    try {
      const [types, ret] = await Promise.all([
        fetch('/api/vehicle-types').then((r) => r.json()),
        fetch('/api/retention').then((r) => r.json()).catch(() => ({ retentionYears: 3 })),
      ]);
      state.vehicleTypes = types;
      state.retentionYears = ret.retentionYears || 3;
    } catch {
      app.innerHTML = '<div class="empty">서버에 연결할 수 없습니다.</div>'; return;
    }
    if (state.token) {
      try { const me = await api('/auth/me'); state.user = me.user; }
      catch { state.token = null; localStorage.removeItem(TOKEN_KEY); }
    }
    try { history.replaceState({ view: state.view }, ''); } catch { /* noop */ }
    render();
  }
  boot();
})();
