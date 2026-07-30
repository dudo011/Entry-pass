(() => {
  const style = document.createElement('style');
  style.textContent = `
    .home-request-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
    .home-request-actions .big-cta{width:100%;margin:0!important;min-height:52px;padding:12px 10px;font-size:16px}
    .home-request-actions .past-request-btn{border:1px solid var(--border,#dbe1ea);background:#fff;color:var(--text,#111827);border-radius:12px;font-weight:700}
    #myList .mini-card.visit-expired{display:none!important}
    .active-request-empty{padding:28px 12px;text-align:center;color:var(--muted,#64748b)}
    .past-request-overlay{position:fixed;inset:0;z-index:10020;background:var(--bg,#f5f7fb);overflow:auto}
    .past-request-overlay .past-appbar{position:sticky;top:0;z-index:2;min-height:64px;padding:0 18px;display:flex;align-items:center;background:#fff;border-bottom:1px solid var(--border,#e5e7eb)}
    .past-request-overlay .past-appbar h1{margin:0;font-size:21px;font-weight:750}
    .past-request-overlay .past-close{margin-left:auto;border:0;background:transparent;font-size:28px;line-height:1;padding:8px;color:var(--text,#111827)}
    .past-request-overlay .past-screen{max-width:560px;margin:0 auto;padding:18px 16px 36px}
    .past-request-overlay .mini-card{width:100%;margin-bottom:12px}
    @media (max-width:380px){
      .home-request-actions{gap:8px}
      .home-request-actions .big-cta{font-size:15px;padding-inline:6px}
    }
  `;
  document.head.appendChild(style);

  function normalizeContractTypeTitle() {
    const heading = document.querySelector('#app > .appbar h1');
    if (heading?.textContent?.trim() === '차량 유형 선택') heading.textContent = '계약 유형';
  }

  function openPastRequests(list) {
    if (document.querySelector('.past-request-overlay')) return;
    const pastCards = [...list.querySelectorAll('.mini-card.visit-expired[data-open]')];
    const overlay = document.createElement('div');
    overlay.className = 'past-request-overlay';
    overlay.innerHTML = `
      <div class="past-appbar">
        <h1>과거 신청 내역</h1>
        <button type="button" class="past-close" aria-label="닫기">×</button>
      </div>
      <div class="past-screen"></div>`;

    const screen = overlay.querySelector('.past-screen');
    if (!pastCards.length) {
      screen.innerHTML = '<div class="empty">과거 신청 내역이 없습니다.</div>';
    } else {
      pastCards.forEach((card) => {
        const clone = card.cloneNode(true);
        clone.classList.remove('visit-expired');
        clone.style.display = '';
        clone.onclick = () => {
          const id = clone.dataset.open;
          overlay.remove();
          setTimeout(() => {
            const original = [...list.querySelectorAll('.mini-card[data-open]')]
              .find((item) => String(item.dataset.open) === String(id));
            original?.click();
          }, 0);
        };
        screen.appendChild(clone);
      });
    }

    overlay.querySelector('.past-close').onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }

  function refineHomeActions() {
    const list = document.getElementById('myList');
    const newRequestButton = document.querySelector('#app [data-nav="driverTypes"]');
    if (!list || !newRequestButton) return;

    let actions = newRequestButton.closest('.home-request-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'home-request-actions';
      newRequestButton.parentNode.insertBefore(actions, newRequestButton);
      actions.appendChild(newRequestButton);

      const pastButton = document.createElement('button');
      pastButton.type = 'button';
      pastButton.className = 'btn big-cta past-request-btn';
      pastButton.textContent = '과거 신청 내역';
      pastButton.onclick = () => openPastRequests(list);
      actions.appendChild(pastButton);
    }

    const cards = [...list.querySelectorAll('.mini-card[data-open]')];
    const activeCards = cards.filter((card) => !card.classList.contains('visit-expired'));
    let empty = list.querySelector('.active-request-empty');
    if (cards.length && !activeCards.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'active-request-empty';
        empty.textContent = '현재 출입 예정인 신청 내역이 없습니다.';
        list.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
  }

  function apply() {
    normalizeContractTypeTitle();
    refineHomeActions();
  }

  const app = document.getElementById('app');
  if (!app) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  schedule();
})();