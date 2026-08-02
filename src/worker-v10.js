import worker from './worker-v9.js';
import { withSecurityHeaders } from './security-hardening.js';
import transportMap from '../차량동선(물자수송용역).jpg';
import constructionMap from '../차량동선(공사업체).jpg';
import scrapMap from '../차량동선(불용품매각).jpg';
import pcbsMap from '../차량동선(PCBs처리용역).jpg';

const ROUTE_IMAGES = new Map([
  ['/route-images/transport.jpg', transportMap],
  ['/route-images/construction.jpg', constructionMap],
  ['/route-images/scrap.jpg', scrapMap],
  ['/route-images/pcbs.jpg', pcbsMap],
]);

function routeImageResponse(request, image) {
  const headers = new Headers({
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  const body = request.method === 'HEAD' ? null : image;
  return withSecurityHeaders(new Response(body, { status: 200, headers }), request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const image = ROUTE_IMAGES.get(url.pathname);
    if (image && (request.method === 'GET' || request.method === 'HEAD')) {
      return routeImageResponse(request, image);
    }
    return worker.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  },
};
