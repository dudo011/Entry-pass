(() => {
  const HIGHLIGHTS = {
    '1': ['안전모', '안전화'],
    '2': ['파킹브레이크', '고임목'],
    '3': ['작업반경 내 출입 금지'],
    '5': ['안전대', '안전고리'],
  };

  function appendHighlightedText(target, text, phrases) {
    let cursor = 0;
    const matches = [];

    phrases.forEach((phrase) => {
      const index = text.indexOf(phrase);
      if (index >= 0) matches.push({ index, phrase });
    });

    matches.sort((a, b) => a.index - b.index);

    matches.forEach(({ index, phrase }) => {
      if (index < cursor) return;
      if (index > cursor) target.append(document.createTextNode(text.slice(cursor, index)));

      const strong = document.createElement('strong');
      strong.className = 'rule-highlight';
      strong.textContent = phrase;
      target.append(strong);
      cursor = index + phrase.length;
    });

    if (cursor < text.length) target.append(document.createTextNode(text.slice(cursor)));
  }

  function applySafetyHighlights() {
    document.querySelectorAll('.rule-list li').forEach((item) => {
      if (item.dataset.highlighted === 'true') return;

      const number = item.querySelector('.n')?.textContent?.trim();
      const textElement = item.querySelector('.n + span');
      const phrases = HIGHLIGHTS[number];
      if (!textElement || !phrases) return;

      const text = textElement.textContent || '';
      textElement.replaceChildren();
      appendHighlightedText(textElement, text, phrases);
      item.dataset.highlighted = 'true';
    });
  }

  const app = document.getElementById('app');
  if (!app) return;

  const observer = new MutationObserver(applySafetyHighlights);
  observer.observe(app, { childList: true, subtree: true });
  applySafetyHighlights();
})();
