(() => {
  const ROUTE_GUIDE = '정문 통과 후 직진, 전선 야적장 정차';
  const ROUTE_IMAGE = '/routes/transport-route.jpg?v=20260801-64';

  const style = document.createElement('style');
  style.textContent = `
    #app .transport-route-screen{
      padding-top:14px!important
    }
    #app .transport-route-guide{
      margin:0 0 12px;
      padding:13px 16px;
      border-radius:12px;
      background:#eff6ff;
      border:1px solid #bfdbfe;
      color:#0f172a;
      text-align:center;
      font-size:20px;
      line-height:1.4;
      font-weight:750
    }
    #app .transport-route-map-card{
      margin:0 0 12px;
      padding:8px;
      overflow:hidden
    }
    #app .transport-route-map{
      display:block;
      width:100%;
      height:auto;
      border-radius:10px
    }
    @media(max-width:390px){
      #app .transport-route-guide{
        font-size:18px;
        padding:11px 12px
      }
    }
  `;
  document.head.appendChild(style);

  function isTransportRouteScreen(app) {
    const heading = app.querySelector(':scope > .appbar h1')?.textContent?.trim() || '';
    if (heading !== '차량 동선 안내') return false;

    const transportIcon = app.querySelector(
      ':scope > .appbar .flow-header-vehicle-image[src*="type-transport-flatbed"]'
    );
    return !!transportIcon;
  }

  function refineTransportRoute() {
    const app = document.getElementById('app');
    if (!app || !isTransportRouteScreen(app)) return;

    const screen = app.querySelector(':scope > .steps + .screen, :scope > .screen');
    if (!screen) return;
    if (screen.dataset.transportRouteRefined === 'true') return;

    const cta = screen.querySelector('.sticky-cta');
    if (!cta) return;

    screen.dataset.transportRouteRefined = 'true';
    screen.classList.add('transport-route-screen');
    screen.innerHTML = `
      <div class="transport-route-guide">${ROUTE_GUIDE}</div>
      <div class="card transport-route-map-card">
        <img class="transport-route-map" src="${ROUTE_IMAGE}" alt="물자수송용역 차량 동선 안내도">
      </div>
      ${cta.outerHTML}`;
  }

  const app = document.getElementById('app');
  if (!app) return;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      refineTransportRoute();
    });
  };

  new MutationObserver(schedule).observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  schedule();
})();
