(() => {
  const CACHE_VERSION = '20260802-102';
  const ROUTES = {
    transport: {
      image: `/route-images/transport.jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 <strong>“전선 야적장”</strong> 정차',
      alt: '물자수송용역 및 기자재 납품 차량 동선 안내도',
    },
    construction: {
      image: `/route-images/construction.jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 <strong>“3창고”</strong> 앞 정차',
      alt: '공사업체 차량 동선 안내도',
    },
    scrap: {
      image: `/route-images/scrap.jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 <strong>“고철장”</strong> 정차',
      alt: '불용품 매각 차량 동선 안내도',
    },
    pcbs: {
      image: `/route-images/pcbs.jpg?v=${CACHE_VERSION}`,
      guide: '정문 통과 후 <strong>“폐변압기 야적장”</strong> 정차',
      alt: 'PCBs 처리용역 차량 동선 안내도',
    },
  };

  Object.values(ROUTES).forEach((route) => {
    const preloadImage = new Image();
    preloadImage.decoding = 'async';
    preloadImage.src = route.image;
  });

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
    const allImageHints = [...(appbar?.querySelectorAll('img') || [])]
      .map((img) => [img.getAttribute('src'), img.getAttribute('alt'), img.getAttribute('title')]
        .filter(Boolean).join(' '))
      .join(' ');
    const appbarHints = [
      appbar?.textContent || '',
      appbar?.className || '',
      JSON.stringify(appbar?.dataset || {}),
      iconText,
      iconImageSrc,
      allImageHints,
    ].join(' ');
    const vehicleType = appbar?.dataset.vehicleType || '';

    if (
      vehicleType === 'pcbs' ||
      iconText.includes('☣') ||
      /pcb|hazard|drum|oil/i.test(appbarHints)
    ) {
      return ROUTES.pcbs;
    }

    if (
      iconText.includes('♻') ||
      /recycle|scrap|disuse|waste/i.test(appbarHints) ||
      vehicleType === 'scrap'
    ) {
      return ROUTES.scrap;
    }

    // 기자재 납품은 물자수송용역과 동일한 동선·안내 이미지를 사용한다.
    if (
      vehicleType === 'delivery' ||
      /delivery|equipment|supply|납품/i.test(appbarHints) ||
      /🚚|🚛|📦/.test(appbarHints)
    ) {
      return ROUTES.transport;
    }

    const transportIcon = appbar?.querySelector(
      '.flow-header-vehicle-image[src*="type-transport-flatbed"]'
    );
    if (transportIcon || vehicleType === 'transport') return ROUTES.transport;

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
    image.decoding = 'async';

    card.append(guide, image);
    screen.querySelectorAll(':scope > :not(.sticky-cta)').forEach((element) => element.remove());
    screen.insertBefore(card, cta);
    screen.dataset.transportRouteRefined = 'true';
    screen.classList.add('transport-route-screen');
  }

  const app = document.getElementById('app');
  if (!app) return;

  let scheduled = false;
  let lastApplyAt = 0;
  const MIN_APPLY_GAP = 400;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // queueMicrotask는 브라우저에 양보하지 않아, 다른 보정 스크립트와 상호 재발화 루프에
    // 걸리면 마이크로태스크가 끝없이 쌓여 화면이 하드 프리즈된다. rAF + 최소 간격으로
    // 반드시 프레임마다 양보하고 재적용 빈도도 제한한다.
    const run = () => {
      scheduled = false;
      lastApplyAt = Date.now();
      refineTransportRoute();
    };
    const wait = Math.max(0, MIN_APPLY_GAP - (Date.now() - lastApplyAt));
    if (wait === 0) requestAnimationFrame(run);
    else setTimeout(run, wait);
  };

  new MutationObserver(schedule).observe(app, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'data-construction-flow-header', 'data-vehicle-type', 'src', 'alt', 'title'],
  });
  schedule();
})();
