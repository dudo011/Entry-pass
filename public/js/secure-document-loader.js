(() => {
  const TOKEN_KEY = 'ep_token';
  const objectUrls = new Set();
  const loading = new WeakSet();

  async function protectedBlob(url) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (!token) throw new Error('로그인이 필요합니다.');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || '첨부서류를 불러오지 못했습니다.');
    }
    return response.blob();
  }

  async function secureImage(img) {
    const source = img.dataset.secureSource || img.getAttribute('src') || '';
    if (!source.startsWith('/uploads/') || loading.has(img)) return;
    loading.add(img);
    img.dataset.secureSource = source;
    img.removeAttribute('src');
    img.alt = img.alt || '첨부서류 불러오는 중';
    try {
      const blob = await protectedBlob(source);
      const objectUrl = URL.createObjectURL(blob);
      objectUrls.add(objectUrl);
      img.src = objectUrl;
      img.dataset.secureLoaded = 'true';
      if (img.dataset.lightbox?.startsWith('/uploads/')) img.dataset.lightbox = objectUrl;
    } catch (error) {
      img.alt = error.message;
      img.dataset.secureError = 'true';
    } finally {
      loading.delete(img);
    }
  }

  function secureLinks(root = document) {
    root.querySelectorAll('img[src^="/uploads/"], img[data-secure-source^="/uploads/"]').forEach(secureImage);
    root.querySelectorAll('a[href^="/uploads/"]').forEach((link) => {
      if (link.dataset.secureBound === 'true') return;
      link.dataset.secureBound = 'true';
      const source = link.getAttribute('href');
      link.removeAttribute('href');
      link.style.cursor = 'pointer';
      link.onclick = async (event) => {
        event.preventDefault();
        try {
          const blob = await protectedBlob(source);
          const objectUrl = URL.createObjectURL(blob);
          objectUrls.add(objectUrl);
          window.open(objectUrl, '_blank', 'noopener,noreferrer');
        } catch (error) {
          const toast = document.createElement('div');
          toast.className = 'toast'; toast.textContent = error.message;
          document.body.appendChild(toast); setTimeout(() => toast.remove(), 2600);
        }
      };
    });
  }

  const observer = new MutationObserver(() => secureLinks());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  secureLinks();

  window.addEventListener('pagehide', () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  });
})();
