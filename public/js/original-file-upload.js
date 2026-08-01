(() => {
  // 제출 서류 이미지는 브라우저에서 축소·재압축하지 않고 원본 파일 그대로 서버에 전송한다.
  // app.js의 이미지 압축 함수가 createImageBitmap()을 호출하면 원본 반환 경로로 전환한다.
  const nativeCreateImageBitmap = window.createImageBitmap?.bind(window);
  if (!nativeCreateImageBitmap) return;

  window.createImageBitmap = (source, ...options) => {
    if (source instanceof File && source.type?.startsWith('image/')) {
      return Promise.reject(new Error('Preserve original upload file'));
    }
    return nativeCreateImageBitmap(source, ...options);
  };
})();
