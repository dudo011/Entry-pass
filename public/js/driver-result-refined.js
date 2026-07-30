(() => {
  const TOKEN_KEY = 'ep_token';
  const REQUEST_CACHE_KEY = 'ep_my_requests_session';
  const HOME_CACHE_KEY = 'ep_my_requests_token_cache';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  let currentRequest = null;

  const style = document.createElement('style');
  style.textContent = `
    .driver-result-refined-screen{
      min-height:calc(100dvh - 64px);display:flex;flex-direction:column;align-items:center;
      padding:28px 16px 40px!important;box-sizing:border-box;text-align:center
    }
    .driver-result-refined-screen .result-main-icon{font-size:82px;line-height:1;margin:0 0 18px}
    .driver-result-refined-screen .result-main-title{margin:0 0 30px;font-size:30px;line-height:1.3;font-weight:800;color:var(--text,#111827)}
    .driver-result-card{width:100%;max-width:520px;background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:18px;padding:12px 18px;box-sizing:border-box}
    .driver-result-card .result-detail{margin:0;padding:15px 6px;font-size:27px;line-height:1.3;font-weight:750;color:var(--text,#111827);word-break:keep-all}
    .driver-result-card .result-detail + .result-detail{border-top:1px solid #eef1f5}
    .driver-result-card .result-detail.result-company{padding-bottom:10px}
    .driver-result-card .result-detail.result-purpose{padding-top:10px;font-size:20px;font-weight:650;color:var(--muted,#64748b)}
    .driver-result-time{margin:16px 0 0;font-size:14px;font-weight:600;color:var(--muted,#64748b)}
    .driver-result-edit{margin-left:auto!important;position:static!important;transform:none!important}
    .request-edit-overlay{position:fixed;inset:0;z-index:12000;background:var(--bg,#f5f7fb);overflow:auto}
    .request-edit-overlay .appbar{min-height:64px!important;height:auto!important}
    .request-edit-screen{max-width:560px;margin:0 auto;padding:18px 16px 34px}
    .request-edit-card{background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:18px;padding:16px}
    .request-edit-card .field-h{display:flex;align-items:center;gap:12px;min-height:62px}
    .request-edit-card .lb{flex:0 0 94px;font-size:16px;font-weight:700;text-align:left}
    .request-edit-card input{flex:1;min-width:0;box-sizing:border-box}
    .request-edit-docs{margin-top:8px;padding-top:14px;border-top:1px solid #eef1f5;text-align:left}
    .request-edit-docs .current-docs{font-size:13px;line-height:1.5;color:var(--muted,#64748b);margin:6px 0 12px}
    .request-edit-actions{position:sticky;bottom:0;padding:14px 0 calc(14px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg,#f5f7fb) 22%)}
    .request-change-box{margin:14px 0 18px;padding:14px 16px;border:1px solid #93c5fd;border-radius:14px;background:#eff6ff}
    .request-change-box .change-title{font-size:15px;font-weight:800;color:#1d4ed8;margin-bottom:8px}
    .request-change-box .change-row{font-size:14px;line-height:1.55;color:#334155}
    .request-change-box .change-row b{color:#111827}
    @media(max-width:390px){
      .driver-result-refined-screen{padding-top:22px!important}
      .driver-result-refined-screen .result-main-icon{font-size:72px}
      .driver-result-refined-screen .result-main-title{font-size:27px;margin-bottom:24px}
      .driver-result-card .result-detail{font-size:24px;padding:13px 5px}
      .driver-result-card .result-detail.result-purpose{font-size:18px}
    }
  `;
  document.head.appendChild(style);

  function readCachedRequests() {
    try {
      const requests = JSON.parse(sessionStorage.getItem(REQUEST_CACHE_KEY) || '[]');
      return Array.isArray(requests) ? requests : [];
    } catch { return []; }
  }

  function cacheRequests(requests) {
    if (!Array.isArray(requests)) return;
    try {
      sessionStorage.setItem(REQUEST_CACHE_KEY, JSON.stringify(requests));
      localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
        token: localStorage.getItem(TOKEN_KEY) || '', requests,
      }));
    } catch { /* noop */ }
  }

  function updateCachedRequest(request) {
    const requests = readCachedRequests();
    const updated = [request, ...requests.filter((item) => String(item.id) !== String(request.id))];
    cacheRequests(updated);
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api${path}`, { ...options, headers });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
    return data;
  }

  async function getMyRequests() {
    const requests = await api('/my/requests');
    cacheRequests(requests);
    return requests;
  }

  function formatVisitDate(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '-';
    const [year, month, day] = key.split('-');
    return `${year}. ${Number(month)}. ${Number(day)}.`;
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function resultTime(request) {
    if (request.status === 'approved') return { label: '승인일시', value: request.reviewedAt };
    if (request.status === 'rejected') return { label: '반려일시', value: request.reviewedAt };
    return { label: '신청일시', value: request.createdAt };
  }

  function addEditButton(request) {
    const appbar = document.querySelector('#app > .appbar');
    if (!appbar || appbar.querySelector('.driver-result-edit')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-btn driver-result-edit';
    button.textContent = '수정';
    button.onclick = () => openEdit(request);
    appbar.append(button);
  }

  function renderResult(screen, request, icon, title) {
    currentRequest = request;
    const time = resultTime(request);
    const purpose = request.purpose || request.vehicleTypeName || '-';
    screen.className = 'screen driver-result-refined-screen';
    screen.innerHTML = `
      <div class="result-main-icon">${esc(icon)}</div>
      <h2 class="result-main-title">${esc(title)}</h2>
      <div class="driver-result-card">
        <p class="result-detail">${esc(request.vehicleNumber || '-')}</p>
        <p class="result-detail">${esc(formatVisitDate(request.visitAt))}</p>
        <p class="result-detail result-company">${esc(request.company || '-')}</p>
        <p class="result-detail result-purpose">${esc(purpose)}</p>
      </div>
      <p class="driver-result-time">${esc(time.label)} · ${esc(formatDateTime(time.value))}</p>`;
    screen.dataset.resultRefined = 'true';
    screen.dataset.resultRefining = 'false';
    addEditButton(request);
  }

  function toast(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  function openEdit(request) {
    if (document.querySelector('.request-edit-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'request-edit-overlay';
    const docs = (request.documents || []).map((doc) => esc(doc.label)).join(', ') || '첨부 서류 없음';
    overlay.innerHTML = `
      <div class="appbar"><div><h1>출입신청서 수정</h1></div><button type="button" class="link-btn request-edit-close">닫기</button></div>
      <div class="request-edit-screen">
        <div class="request-edit-card">
          <label class="field-h"><span class="lb">방문일자</span><input id="editVisitAt" type="date" value="${esc(String(request.visitAt || '').slice(0, 10))}"></label>
          <label class="field-h"><span class="lb">소속업체</span><input id="editCompany" type="text" value="${esc(request.company || '')}" placeholder="없을 경우 공란"></label>
          <label class="field-h"><span class="lb">방문목적</span><input id="editPurpose" type="text" value="${esc(request.purpose || request.vehicleTypeName || '')}"></label>
          <div class="request-edit-docs">
            <div class="lb">제출서류</div>
            <div class="current-docs">현재 서류: ${docs}<br>새 파일을 선택하면 기존 제출서류 전체가 교체됩니다.</div>
            <input id="editDocuments" type="file" multiple accept="image/*,application/pdf">
          </div>
        </div>
        <div class="request-edit-actions"><button type="button" class="btn btn-primary" id="editSubmit">출입 신청 수정</button></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.request-edit-close').onclick = () => overlay.remove();
    overlay.querySelector('#editSubmit').onclick = async (event) => {
      const button = event.currentTarget;
      const visitAt = overlay.querySelector('#editVisitAt').value;
      if (!visitAt) return toast('방문일자를 선택해 주세요.');
      const form = new FormData();
      form.append('visitAt', visitAt);
      form.append('company', overlay.querySelector('#editCompany').value.trim());
      form.append('purpose', overlay.querySelector('#editPurpose').value.trim());
      [...overlay.querySelector('#editDocuments').files].forEach((file) => form.append('documents', file));
      button.disabled = true;
      button.textContent = '수정 중…';
      try {
        const updated = await api(`/requests/${request.id}`, { method: 'PUT', body: form });
        updateCachedRequest(updated);
        currentRequest = updated;
        overlay.remove();
        const screen = document.querySelector('#app .driver-result-refined-screen');
        if (screen) renderResult(screen, updated, '📨', '신청이 다시 접수되었습니다');
        toast('수정한 신청내역이 관리자에게 다시 전송되었습니다.');
      } catch (error) {
        button.disabled = false;
        button.textContent = '출입 신청 수정';
        toast(error.message);
      }
    };
  }

  async function refineResult() {
    const currentResultNode = document.querySelector('#app .screen .result');
    const appbarTitle = document.querySelector('#app > .appbar h1')?.textContent?.trim();
    if (!currentResultNode || appbarTitle !== '신청 상세') return;
    const screen = currentResultNode.closest('.screen');
    if (!screen || screen.dataset.resultRefined === 'true' || screen.dataset.resultRefining === 'true') return;
    screen.dataset.resultRefining = 'true';

    const passNo = currentResultNode.querySelector('.passno')?.textContent?.trim() || '';
    const icon = currentResultNode.querySelector('.big-ico')?.textContent?.trim() || '📨';
    const title = currentResultNode.querySelector('h2')?.textContent?.trim() || '신청이 접수되었습니다';
    const cached = readCachedRequests();
    const cachedRequest = cached.find((item) => String(item.passNo) === passNo);
    if (cachedRequest) {
      renderResult(screen, cachedRequest, icon, title);
      getMyRequests().then((requests) => {
        const fresh = requests.find((item) => String(item.id) === String(cachedRequest.id));
        if (fresh && currentRequest?.id === fresh.id) renderResult(screen, fresh, icon, title);
      }).catch(() => {});
      return;
    }
    try {
      const requests = await getMyRequests();
      const request = requests.find((item) => String(item.passNo) === passNo) || requests[0];
      if (request) renderResult(screen, request, icon, title);
      else screen.dataset.resultRefining = 'false';
    } catch { screen.dataset.resultRefining = 'false'; }
  }

  function normalizedDateText(value) {
    return String(value || '').replace(/\s/g, '').replace(/[.()년월일]/g, '');
  }

  async function enhanceStaffChanges() {
    const heading = document.querySelector('#app > .appbar h1')?.textContent?.trim();
    const screen = document.querySelector('#app > .screen');
    if (heading !== '출입 신청 상세' || !screen || screen.dataset.changeEnhanced === 'true') return;
    screen.dataset.changeEnhanced = 'loading';
    try {
      const rows = [...screen.querySelectorAll('.card .row')];
      const values = {};
      rows.forEach((row) => {
        const key = row.querySelector('.k')?.textContent?.trim();
        const value = row.querySelector('span:last-child')?.textContent?.trim();
        if (key) values[key] = value;
      });
      const all = await api('/requests');
      const request = all.find((item) =>
        String(item.vehicleNumber || '') === String(values['차량번호'] || '') &&
        String(item.company || '-') === String(values['계약업체'] || '-') &&
        normalizedDateText(formatVisitDate(item.visitAt)) === normalizedDateText(values['방문일자']));
      const update = [...(request?.history || [])].reverse().find((item) => item.action === 'updated');
      if (update?.changes?.length) {
        const box = document.createElement('div');
        box.className = 'request-change-box';
        box.innerHTML = `<div class="change-title">수정 후 재신청 · ${esc(formatDateTime(update.at))}</div>${update.changes.map((change) =>
          `<div class="change-row"><b>${esc(change.label)}</b>: ${esc(change.before || '없음')} → ${esc(change.after || '없음')}</div>`).join('')}`;
        const firstCard = screen.querySelector('.card');
        firstCard?.insertAdjacentElement('afterend', box);
      }
      screen.dataset.changeEnhanced = 'true';
    } catch { screen.dataset.changeEnhanced = 'false'; }
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      refineResult();
      enhanceStaffChanges();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
