(() => {
  const TOKEN_KEY = 'ep_token';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const style = document.createElement('style');
  style.textContent = `
    .driver-result-refined-screen{
      min-height:calc(100dvh - 96px);
      display:flex;
      flex-direction:column;
      align-items:center;
      padding:72px 24px 40px!important;
      box-sizing:border-box;
      text-align:center;
    }
    .driver-result-refined-screen .result-main-icon{
      font-size:96px;
      line-height:1;
      margin:0 0 24px;
    }
    .driver-result-refined-screen .result-main-title{
      margin:0 0 54px;
      font-size:34px;
      line-height:1.28;
      font-weight:800;
      letter-spacing:0;
      color:var(--text,#111827);
    }
    .driver-result-refined-screen .result-detail-list{
      width:100%;
      max-width:520px;
      display:flex;
      flex-direction:column;
      align-items:center;
    }
    .driver-result-refined-screen .result-detail{
      width:100%;
      margin:0;
      padding:20px 8px;
      font-size:30px;
      line-height:1.35;
      font-weight:750;
      letter-spacing:0;
      text-align:center;
      color:var(--text,#111827);
      word-break:keep-all;
    }
    .driver-result-refined-screen .result-detail + .result-detail{
      margin-top:8px;
    }
    .driver-result-refined-screen .result-detail.result-type{
      padding-top:24px;
      font-size:20px;
      font-weight:650;
      color:var(--muted,#64748b);
    }
    @media (max-width:390px){
      .driver-result-refined-screen{padding-top:58px!important}
      .driver-result-refined-screen .result-main-icon{font-size:84px;margin-bottom:20px}
      .driver-result-refined-screen .result-main-title{font-size:30px;margin-bottom:42px}
      .driver-result-refined-screen .result-detail{font-size:26px;padding:17px 6px}
      .driver-result-refined-screen .result-detail.result-type{font-size:18px}
    }
  `;
  document.head.appendChild(style);

  async function getMyRequests() {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch('/api/my/requests', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('신청 정보를 불러오지 못했습니다.');
    return response.json();
  }

  function formatVisitDate(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '-';
    const [year, month, day] = key.split('-');
    return `${year}. ${Number(month)}. ${Number(day)}.`;
  }

  function formatVehicleType(value) {
    const type = String(value || '').trim().replace(/\s*차량\s*$/, '').trim();
    return type ? `(${type})` : '(-)';
  }

  async function refineResult() {
    const currentResult = document.querySelector('#app .screen .result');
    const appbarTitle = document.querySelector('#app > .appbar h1')?.textContent?.trim();
    if (!currentResult || appbarTitle !== '신청 상세') return;

    const screen = currentResult.closest('.screen');
    if (!screen || screen.dataset.resultRefined === 'true' || screen.dataset.resultRefining === 'true') return;
    screen.dataset.resultRefining = 'true';

    const passNo = currentResult.querySelector('.passno')?.textContent?.trim() || '';
    const icon = currentResult.querySelector('.big-ico')?.textContent?.trim() || '📨';
    const title = currentResult.querySelector('h2')?.textContent?.trim() || '신청이 접수되었습니다';

    try {
      const requests = await getMyRequests();
      const request = requests.find((item) => String(item.passNo) === passNo) || requests[0];
      if (!request) return;

      screen.className = 'screen driver-result-refined-screen';
      screen.innerHTML = `
        <div class="result-main-icon">${esc(icon)}</div>
        <h2 class="result-main-title">${esc(title)}</h2>
        <div class="result-detail-list">
          <p class="result-detail">${esc(request.vehicleNumber || '-')}</p>
          <p class="result-detail">${esc(formatVisitDate(request.visitAt))}</p>
          <p class="result-detail">${esc(request.company || '-')}</p>
          <p class="result-detail result-type">${esc(formatVehicleType(request.vehicleTypeName))}</p>
        </div>`;
      screen.dataset.resultRefined = 'true';
    } catch {
      screen.dataset.resultRefining = 'false';
    }
  }

  const app = document.getElementById('app');
  if (!app) return;
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refineResult, 0);
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();