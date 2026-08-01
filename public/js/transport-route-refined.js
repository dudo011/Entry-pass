(() => {
  const ROUTE_IMAGE = 'https://raw.githubusercontent.com/dudo011/Entry-pass/main/%EC%B0%A8%EB%9F%89%EB%8F%99%EC%84%A0(%EB%AC%BC%EC%9E%90%EC%88%98%EC%86%A1%EC%9A%A9%EC%97%AD).jpg?v=20260801-69';

  const style = document.createElement('style');
  style.textContent = `
    #app .transport-route-screen{
      padding-top:14px!important
    }
    #app .transport-route-card{
      margin:0 0 4px;
      padding:28px 14px 12px;
      overflow:hidden;
      background:#fff;
      border:1px solid #dbe2ea;
      border-radius:16px;
      box-shadow:0 8px 24px rgba(15,23,42,.06)
    }
    #app .transport-route-guide{
      margin:0 0 24px;
      color:#0f172a;
      text-align:center;
      font-size:24px;
      line-height:1.35;
      font-weight:800;
      letter-spacing:-.03em
    }
    #app .transport-route-guide strong{
      color:#2563eb;
      font-weight:800
    }
    #app .transport-route-map{
      display:block;
      width:100%;
      height:auto;
      border:0;
      border-radius:0;
      image-rendering:auto
    }
    @media(max-width:390px){
      #app .transport-route-card{
        margin-bottom:2px;
        padding:24px 12px 10px
      }
      #app .transport-route-guide{
        margin-bottom:20px;
        font-size:21px
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

    const card = document.createElement('div');
    card.className = 'transport-route-card';

    const guide = document.createElement('div');
    guide.className = 'transport-route-guide';
    guide.innerHTML = '정문 통과 후 직진, <strong>“전선 야적장”</strong> 정차';

    const image = document.createElement('img');
    image.className = 'transport-route-map';
    image.src = ROUTE_IMAGE;
    image.alt = '물자수송용역 차량 동선 안내도';

    card.append(guide, image);

    screen.querySelectorAll(':scope > :not(.sticky-cta)').forEach((element) => element.remove());
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
