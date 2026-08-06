(() => {
  const MAP_POSITION = {
    left: '32.5%',
    top: '43.847241867%',
    width: '65%',
    height: '53.748231966%',
  };

  function fixMapPosition(root = document) {
    root.querySelectorAll('.wpe-map-overlay').forEach((image) => {
      image.style.setProperty('position', 'absolute', 'important');
      image.style.setProperty('right', 'auto', 'important');
      image.style.setProperty('bottom', 'auto', 'important');
      image.style.setProperty('left', MAP_POSITION.left, 'important');
      image.style.setProperty('top', MAP_POSITION.top, 'important');
      image.style.setProperty('width', MAP_POSITION.width, 'important');
      image.style.setProperty('height', MAP_POSITION.height, 'important');
      image.style.setProperty('object-fit', 'contain', 'important');
      image.style.setProperty('object-position', 'center', 'important');
      image.style.setProperty('background', '#fff', 'important');
    });
  }

  const observer = new MutationObserver(() => fixMapPosition());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'src'],
  });

  fixMapPosition();
})();
