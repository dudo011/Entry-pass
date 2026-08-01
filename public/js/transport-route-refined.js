(() => {
  const ROUTE_GUIDE = '정문 통과 후 직진, 전선 야적장 정차';
  const ROUTE_IMAGE = '/routes/transport-route.svg?v=20260801-66';

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
      border-radius:10px;
      image-rendering:auto
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
    if (!screen || screen.dataset.transportRouteRefined === 'true') return;

    const cta = screen.querySelector('.sticky-cta');
    if (!cta) return;

    const guide = document.createElement('div');
    guide.className = 'transport-route-guide';
    guide.textContent = ROUTE_GUIDE;

    const card = document.createElement('div');
    card.className = 'card transport-route-map-card';

    const image = document.createElement('img');
    image.className = 'transport-route-map';
    image.src = ROUTE_IMAGE;
    image.alt = '물자수송용역 차량 동선 안내도';
    card.append(image);

    screen.querySelectorAll(':scope > :not(.sticky-cta)').forEach((element) => element.remove());
    screen.insertBefore(guide, cta);
    screen.insertBefore(card, cta);
    screen.dataset.transportRouteRefined = 'true';
    screen.classList.add('transport-route-screen');
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
