(() => {
  const TOKEN_KEY = 'ep_token';
  const MARKER_KEY = 'ep_cookie_auth';
  const COOKIE_MARKER = 'cookie-session';
  const nativeFetch = window.fetch.bind(window);
  const storage = window.localStorage;
  const storageProto = Object.getPrototypeOf(storage);
  const nativeGetItem = storageProto.getItem;
  const nativeSetItem = storageProto.setItem;
  const nativeRemoveItem = storageProto.removeItem;

  let legacyToken = nativeGetItem.call(storage, TOKEN_KEY) || '';
  if (legacyToken === COOKIE_MARKER) legacyToken = '';
  if (legacyToken) nativeRemoveItem.call(storage, TOKEN_KEY);

  function hasAuthMarker() {
    return nativeGetItem.call(storage, MARKER_KEY) === '1' || !!legacyToken;
  }

  storageProto.getItem = function patchedGetItem(key) {
    if (this === storage && key === TOKEN_KEY) return hasAuthMarker() ? COOKIE_MARKER : null;
    return nativeGetItem.call(this, key);
  };

  storageProto.setItem = function patchedSetItem(key, value) {
    if (this === storage && key === TOKEN_KEY) {
      if (value) nativeSetItem.call(storage, MARKER_KEY, '1');
      else nativeRemoveItem.call(storage, MARKER_KEY);
      return;
    }
    return nativeSetItem.call(this, key, value);
  };

  storageProto.removeItem = function patchedRemoveItem(key) {
    if (this === storage && key === TOKEN_KEY) {
      legacyToken = '';
      nativeRemoveItem.call(storage, MARKER_KEY);
      nativeRemoveItem.call(storage, TOKEN_KEY);
      return;
    }
    return nativeRemoveItem.call(this, key);
  };

  function cookieValue(name) {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const value = part.trim();
      if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
    }
    return '';
  }

  function sameOriginUrl(input) {
    try {
      const raw = input instanceof Request ? input.url : input;
      return new URL(raw, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  function methodOf(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  }

  window.fetch = async function cookieAuthenticatedFetch(input, init = {}) {
    if (!sameOriginUrl(input)) return nativeFetch(input, init);

    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const isCompanyApi = url.pathname.startsWith('/api/company/');
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const method = methodOf(input, init);

    // 기존 직원/레거시 토큰은 최초 인증 확인에만 사용하고 이후 브라우저 쿠키로 전환한다.
    // 신규 업체 공동계정 API는 별도 Bearer 세션을 사용하므로 해당 Authorization은 보존한다.
    if (legacyToken) headers.set('Authorization', `Bearer ${legacyToken}`);
    else if (!isCompanyApi) headers.delete('Authorization');

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = cookieValue('ep_csrf');
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }

    const response = await nativeFetch(input, {
      ...init,
      headers,
      credentials: 'same-origin',
    });

    if (response.ok && (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register')) {
      nativeSetItem.call(storage, MARKER_KEY, '1');
      legacyToken = '';
    } else if (response.ok && url.pathname === '/api/auth/me' && legacyToken) {
      nativeSetItem.call(storage, MARKER_KEY, '1');
      legacyToken = '';
    } else if (url.pathname === '/api/auth/logout') {
      nativeRemoveItem.call(storage, MARKER_KEY);
      legacyToken = '';
    } else if (response.status === 401 && !isCompanyApi) {
      nativeRemoveItem.call(storage, MARKER_KEY);
      legacyToken = '';
    }

    return response;
  };

  // 기존 로그인 사용자를 페이지 로드 즉시 HttpOnly 쿠키로 안전하게 이전한다.
  if (legacyToken) {
    window.fetch('/api/auth/me').catch(() => {
      legacyToken = '';
      nativeRemoveItem.call(storage, MARKER_KEY);
    });
  }
})();
