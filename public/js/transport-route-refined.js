(() => {
  const CACHE_VERSION = '20260801-72';
  const ROUTES = {
    transport: {
      image: `https://raw.githubusercontent.com/dudo011/Entry-pass/main/%EC%B0%A8%EB%9F%89%EB%8F%99%EC%84%A0(%EB%AC%BC%EC%9E%90%EC%88%98%EC%86%A1%EC%9A%A9%EC%97%AD).jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 직진, <strong>“전선 야적장”</strong> 정차',
      alt: '물자수송용역 차량 동선 안내도',
    },
    construction: {
      image: `https://raw.githubusercontent.com/dudo011/Entry-pass/main/%EC%B0%A8%EB%9F%89%EB%8F%99%EC%84%A0(%EA%B3%B5%EC%82%AC%EC%97%85%EC%B2%B4).jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 <strong>“3창고”</strong> 앞 정차',
      alt: '공사업체 차량 동선 안내도',
    },
    scrap: {
      image: `https://raw.githubusercontent.com/dudo011/Entry-pass/main/%EC%B0%A8%EB%9F%89%EB%8F%99%EC%84%A0(%EB%B6%88%EC%9A%A9%ED%92%88%EB%A7%A4%EA%B0%81).jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 안내 동선에 따라 <strong>“불용품 매각장”</strong> 정차',
      alt: '불용품 매각 차량 동선 안내도',
    },
  };

  const style = document.createElement('style');
  style.textContent = `
    #app .transport-route-screen{padding-top:14px!important}
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
    #app .transport-route-guide strong{color:#2563eb;font-weight:800}
    #app .transport-route-map{
      display:block;
      width:100%;
      height:auto;
      border:0;
      border-radius:0;
      image-rendering:auto
    }
    @media(max-width:390px){
      #app .transport-route-card{margin-bottom:2px;padding:24px 12px 10px}
      #app .transport-route-guide{margin-bottom:20px;font-size:21px}
    }
  `;
  document.head.appendChild(style);

  function getRouteConfig(app) {
    const appbar = app.querySelector(':scope > .appbar');
    const heading = appbar?.querySelector('h1')?.textContent?.trim() || '';
    if (heading !== '차량 동선 안내') return null;

    if (
      appbar?.dataset.constructionFlowHeader === 'true' ||
      appbar?.classList.contains('vehicle-flow-appbar') &&
        appbar?.querySelector('.vehicle-appbar-icon')?.textContent?.includes('🏗️')
    ) {
      return ROUTES.construction;
    }

    const icon = appbar?.querySelector('.vehicle-appbar-icon');
    const iconText = icon?.textContent?.trim() || '';
    const iconImageSrc = icon?.querySelector('img')?.getAttribute('src') || '';

    if (
      iconText.includes('♻') ||
      /recycle|scrap|disuse|waste/i.test(iconImageSrc) ||
      appbar?.dataset.vehicleType === 'scrap'
    ) {
      return ROUTES.scrap;
    }

    const transportIcon = appbar?.querySelector(
      '.flow-header-vehicle-image[src*="type-transport-flatbed"]'
    );
    if (transportIcon) return ROUTES.transport;

    return null;
  }

  function refineTransportRoute() {
    const app = document.getElementById('app');
    if (!app) return;

    const route = getRouteConfig(app);
    if (!route) return;

    const screen = app.querySelector(':scope > .steps + .screen, :scope > .screen');
    if (!screen || screen.dataset.transportRouteRefined === 'true') return;

    const cta = screen.querySelector('.sticky-cta');
    if (!cta) return;

    const card = document.createElement('div');
    card.className = 'transport-route-card';

    const guide = document.createElement('div');
    guide.className = 'transport-route-guide';
    guide.innerHTML = route.guide;

    const image = document.createElement('img');
    image.className = 'transport-route-map';
    image.src = route.image;
    image.alt = route.alt;

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
    attributes: true,
    attributeFilter: ['class', 'data-construction-flow-header', 'data-vehicle-type', 'src'],
  });
  schedule();
})();
