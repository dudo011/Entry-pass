(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const TOKEN_KEY = 'ep_company_token';
  const DETAIL_KEY = 'ep_company_detail_request_id';

  function toast(message) {
    document.querySelectorAll('.company-share-toast').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'company-share-toast';
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed', left: '50%', bottom: 'calc(26px + env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)', zIndex: '120000', maxWidth: 'calc(100vw - 32px)',
      padding: '12px 16px', borderRadius: '12px', background: '#0f172a', color: '#fff',
      fontWeight: '800', textAlign: 'center',
    });
    document.body.append(node);
    setTimeout(() => node.remove(), 2600);
  }

  function formatDate(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key || '-';
    const [y, m, d] = key.split('-').map(Number);
    return `${y}. ${m}. ${d}.`;
  }

  function shareText(meta) {
    return `[자재센터 출입 승인]\n차량번호: ${meta.vehicleNumber}\n출입일: ${formatDate(meta.visitAt)}\n\n출입 전 안전수칙과 차량동선을 확인해 주세요.`;
  }

  async function fetchDriverLink(requestId) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (!token) throw new Error('업체 로그인이 필요합니다.');
    const response = await fetch(`/api/company/requests/${encodeURIComponent(requestId)}/driver-link`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let data = null;
    try { data = await response.json(); } catch { /* noop */ }
    if (!response.ok) throw new Error(data?.error || '기사 안내 링크를 불러오지 못했습니다.');
    return data;
  }

  function removeStaffShareActions() {
    const title = app.querySelector(':scope > .appbar h1')?.textContent?.trim();
    if (title !== '출입 신청 상세') return;
    app.querySelectorAll('.cf-staff-workflow .cf-share-row').forEach((row) => row.remove());
  }

  async function addCompanyShareCard() {
    if (!app.classList.contains('company-flow-active')) return;
    const title = app.querySelector(':scope > .cf-appbar h1')?.textContent?.trim();
    if (title !== '신청 상세') return;

    const stage = app.querySelector('.cf-stage.safety_pending');
    if (!stage) return;
    const screen = app.querySelector(':scope > .cf-screen');
    if (!screen || screen.querySelector('.company-driver-share-card')) return;
    if (screen.dataset.driverShareLoading === 'true') return;

    const requestId = sessionStorage.getItem(DETAIL_KEY) || '';
    if (!requestId) return;
    screen.dataset.driverShareLoading = 'true';

    try {
      const meta = await fetchDriverLink(requestId);
      if (!screen.isConnected || !app.querySelector('.cf-stage.safety_pending')) return;

      const card = document.createElement('div');
      card.className = 'cf-card company-driver-share-card';
      card.innerHTML = `
        <div class="cf-title">차량기사 안내</div>
        <div style="font-size:16px;line-height:1.55;color:#334155">
          출입 승인이 완료되었습니다.<br>차량기사에게 안전수칙·차량동선 확인 링크를 보내주세요.
        </div>
        <div class="cf-meta" style="margin-top:10px;line-height:1.65">
          기사 ${escapeHtml(meta.driverName)} · ${escapeHtml(meta.driverPhone)}<br>
          링크 사용기한 ${escapeHtml(new Date(meta.expiresAt).toLocaleString('ko-KR'))}
        </div>
        <div class="cf-row2" style="margin-top:12px">
          <button type="button" class="cf-btn cf-primary" data-company-driver-share>카카오톡·공유</button>
          <button type="button" class="cf-btn cf-secondary" data-company-driver-copy>링크 복사</button>
        </div>`;

      const firstCard = screen.querySelector(':scope > .cf-card');
      if (firstCard) firstCard.after(card); else screen.prepend(card);

      card.querySelector('[data-company-driver-share]')?.addEventListener('click', async () => {
        const text = shareText(meta);
        try {
          if (navigator.share) {
            await navigator.share({ title: '자재센터 출입 승인', text, url: meta.driverLink });
          } else {
            await navigator.clipboard.writeText(`${text}\n${meta.driverLink}`);
            toast('공유문구와 링크를 복사했습니다. 카카오톡에 붙여넣어 주세요.');
          }
        } catch (error) {
          if (error?.name !== 'AbortError') toast('공유하지 못했습니다. 링크 복사를 이용해 주세요.');
        }
      });

      card.querySelector('[data-company-driver-copy]')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(meta.driverLink);
          toast('차량기사 전용 링크를 복사했습니다.');
        } catch {
          toast('링크 복사에 실패했습니다. 공유 버튼을 이용해 주세요.');
        }
      });
    } catch (error) {
      if (screen.isConnected) {
        const card = document.createElement('div');
        card.className = 'cf-card company-driver-share-card';
        card.innerHTML = `<div class="cf-title">차량기사 안내</div><div style="color:#b91c1c;line-height:1.5">${escapeHtml(error.message)}</div>`;
        const firstCard = screen.querySelector(':scope > .cf-card');
        if (firstCard) firstCard.after(card); else screen.prepend(card);
      }
    } finally {
      if (screen.isConnected) delete screen.dataset.driverShareLoading;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[char]));
  }

  document.addEventListener('click', (event) => {
    const request = event.target.closest?.('[data-cf-request]');
    if (request?.dataset.cfRequest) sessionStorage.setItem(DETAIL_KEY, request.dataset.cfRequest);
  }, true);

  let scheduled = false;
  const apply = () => {
    scheduled = false;
    removeStaffShareActions();
    addCompanyShareCard();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  schedule();
})();
