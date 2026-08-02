(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const style = document.createElement('style');
  style.textContent = `
    .password-reset-link{display:block;margin:14px auto 0;border:0;background:transparent;color:#2563eb;font-size:16px;font-weight:800;text-decoration:underline;text-underline-offset:4px;cursor:pointer;touch-action:manipulation}
    .password-reset-layer{position:fixed;inset:0;z-index:85000;background:#f8fafc;overflow:auto;overscroll-behavior:contain}
    .password-reset-head{position:sticky;top:0;z-index:2;height:76px;min-height:76px;box-sizing:border-box;display:flex;align-items:center;padding:14px 16px;background:#0f172a;color:#fff}
    .password-reset-head h2{margin:0;font-size:24px;letter-spacing:-.7px}
    .password-reset-body{max-width:520px;margin:0 auto;padding:18px 16px calc(30px + env(safe-area-inset-bottom))}
    .password-reset-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:18px;box-shadow:0 10px 25px rgba(15,23,42,.07)}
    .password-reset-card p{margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.55}
    .password-reset-field{display:block;margin-bottom:13px}
    .password-reset-field span{display:block;margin-bottom:6px;color:#0f172a;font-size:15px;font-weight:800}
    .password-reset-field input{width:100%;min-height:52px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:12px 13px;background:#fff;color:#0f172a;font-size:17px}
    .password-reset-submit{width:100%;min-height:54px;margin-top:5px;border:0;border-radius:13px;background:#2563eb;color:#fff;font-size:17px;font-weight:900;cursor:pointer;touch-action:manipulation}
    .password-reset-submit:disabled{opacity:.65;cursor:wait}
    .password-reset-result{padding:24px 8px;text-align:center}
    .password-reset-result .icon{font-size:48px;line-height:1;margin-bottom:14px}
    .password-reset-result h3{margin:0 0 10px;font-size:22px;color:#0f172a}
    .password-reset-result p{margin:0;color:#475569;font-size:16px;line-height:1.65}
    .password-reset-error{min-height:20px;margin:10px 0 0;color:#b91c1c;font-size:14px;font-weight:750}

    .password-request-section{margin:0 0 16px;padding:14px;border:1px solid #fcd34d;border-radius:15px;background:#fffbeb}
    .password-request-section h3{margin:0 0 10px;color:#92400e;font-size:18px}
    .password-request-item{padding:13px;border:1px solid #fde68a;border-radius:13px;background:#fff;margin-top:9px}
    .password-request-name{color:#0f172a;font-size:17px;font-weight:900;line-height:1.4}
    .password-request-meta{margin-top:4px;color:#64748b;font-size:14px;line-height:1.5}
    .password-request-time{margin-top:4px;color:#94a3b8;font-size:12px}
    .password-request-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px}
    .password-request-actions button{min-width:0;min-height:42px;border-radius:10px;font-size:14px;font-weight:850;cursor:pointer;touch-action:manipulation}
    .password-request-actions .approve{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8}
    .password-request-actions .reject{border:1px solid #fecaca;background:#fff7f7;color:#b91c1c}
    .password-request-empty{padding:8px 2px;color:#64748b;font-size:14px}
    .password-issued-backdrop{position:fixed;inset:0;z-index:95000;display:grid;place-items:center;padding:18px;box-sizing:border-box;background:rgba(15,23,42,.62)}
    .password-issued-modal{width:min(100%,450px);box-sizing:border-box;border-radius:18px;background:#fff;padding:20px;box-shadow:0 24px 70px rgba(15,23,42,.3)}
    .password-issued-modal h3{margin:0 0 9px;font-size:21px}.password-issued-modal p{color:#475569;line-height:1.55}
    .password-issued-value{padding:14px;border:1px dashed #94a3b8;border-radius:12px;background:#f8fafc;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:23px;font-weight:900;letter-spacing:1px;user-select:all}
    .password-issued-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:17px}
    .password-issued-actions button{min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:900;cursor:pointer}
    .password-issued-actions .primary{border-color:#2563eb;background:#2563eb;color:#fff}
  `;
  document.head.appendChild(style);

  const csrfToken = () => {
    const part = document.cookie.split(';').map((value) => value.trim())
      .find((value) => value.startsWith('ep_csrf='));
    return part ? decodeURIComponent(part.slice('ep_csrf='.length)) : '';
  };

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem('ep_token') || '';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.method && options.method !== 'GET') {
      const csrf = csrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }

  function isDriverLogin() {
    const loginId = document.getElementById('a_loginId');
    const password = document.getElementById('a_password');
    const confirm = document.getElementById('a_password2');
    const submit = document.getElementById('a_submit');
    if (!loginId || !password || confirm || submit?.textContent?.trim() !== '로그인') return false;
    const label = loginId.closest('label')?.querySelector('.lb')?.textContent || '';
    return label.includes('차량번호') || String(loginId.placeholder || '').includes('차량번호');
  }

  function openResetLayer() {
    document.querySelector('.password-reset-layer')?.remove();
    const layer = document.createElement('section');
    layer.className = 'password-reset-layer';
    layer.innerHTML = `
      <header class="password-reset-head"><h2>임시 비밀번호 발급 요청</h2></header>
      <main class="password-reset-body">
        <div class="password-reset-card" data-form>
          <p>가입할 때 등록한 정보와 동일하게 입력해 주세요. 요청이 접수되면 자재센터 관리자가 등록된 연락처로 본인 확인 후 임시 비밀번호를 안내합니다.</p>
          <label class="password-reset-field"><span>차량번호</span><input data-vehicle autocomplete="username" placeholder="예: 12가3456"></label>
          <label class="password-reset-field"><span>이름</span><input data-name autocomplete="name" placeholder="가입자 이름"></label>
          <label class="password-reset-field"><span>연락처</span><input data-phone inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></label>
          <label class="password-reset-field"><span>소속업체</span><input data-company autocomplete="organization" placeholder="소속업체명"></label>
          <button type="button" class="password-reset-submit">임시 비밀번호 발급 요청</button>
          <div class="password-reset-error" role="alert"></div>
        </div>
      </main>`;
    document.body.appendChild(layer);
    history.pushState({ ...(history.state || {}), passwordResetRequest: true }, '');

    const phone = layer.querySelector('[data-phone]');
    phone.addEventListener('input', () => {
      const digits = phone.value.replace(/\D/g, '').slice(0, 11);
      phone.value = digits.length < 4 ? digits
        : digits.length < 8 ? `${digits.slice(0, 3)}-${digits.slice(3)}`
          : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    });

    const button = layer.querySelector('.password-reset-submit');
    button.onclick = async () => {
      const body = {
        vehicleNumber: layer.querySelector('[data-vehicle]').value.trim(),
        name: layer.querySelector('[data-name]').value.trim(),
        phone: layer.querySelector('[data-phone]').value.trim(),
        company: layer.querySelector('[data-company]').value.trim(),
      };
      const errorBox = layer.querySelector('.password-reset-error');
      errorBox.textContent = '';
      if (Object.values(body).some((value) => !value)) {
        errorBox.textContent = '모든 항목을 입력해 주세요.';
        return;
      }
      button.disabled = true;
      button.textContent = '요청 중…';
      try {
        const result = await request('/api/auth/password-reset-requests', { method: 'POST', body });
        const issued = result.status === 'issued';
        layer.querySelector('[data-form]').innerHTML = `
          <div class="password-reset-result">
            <div class="icon">${issued ? '🔐' : '✅'}</div>
            <h3>${issued ? '임시 비밀번호 발급 완료' : '발급 요청이 접수되었습니다'}</h3>
            <p>${esc(result.message)}</p>
          </div>`;
      } catch (error) {
        button.disabled = false;
        button.textContent = '임시 비밀번호 발급 요청';
        errorBox.textContent = error.message;
      }
    };
  }

  function enhanceDriverLogin() {
    if (!isDriverLogin()) return;
    const screen = document.querySelector('#app > .screen');
    if (!screen || screen.querySelector('.password-reset-link')) return;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'password-reset-link';
    link.textContent = '비밀번호를 잊으셨나요?';
    link.onclick = openResetLayer;
    const switchText = screen.querySelector('.switch');
    if (switchText) screen.insertBefore(link, switchText);
    else screen.appendChild(link);
  }

  function issuedModal(data, phone) {
    const backdrop = document.createElement('div');
    backdrop.className = 'password-issued-backdrop';
    backdrop.innerHTML = `
      <div class="password-issued-modal">
        <h3>임시 비밀번호 발급 완료</h3>
        <p><b>${esc(data.loginId || '')}</b> 회원의 임시 비밀번호입니다.</p>
        <div class="password-issued-value">${esc(data.temporaryPassword)}</div>
        <p style="font-size:13px">등록 연락처 ${esc(phone || '-')}로 본인 확인 후 안내해 주세요. 이 비밀번호는 현재 창에서만 확인할 수 있습니다.</p>
        <div class="password-issued-actions"><button type="button" data-copy>복사</button><button type="button" class="primary" data-close>확인</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-copy]').onclick = async () => {
      await navigator.clipboard?.writeText(data.temporaryPassword).catch(() => {});
    };
    backdrop.querySelector('[data-close]').onclick = () => backdrop.remove();
  }

  async function loadAdminRequests(section) {
    const list = section.querySelector('[data-password-requests]');
    try {
      const requests = await request('/api/admin/password-reset-requests?status=pending');
      section.querySelector('h3').textContent = `비밀번호 발급 요청 ${requests.length}건`;
      list.innerHTML = requests.length ? requests.map((item) => `
        <article class="password-request-item">
          <div class="password-request-name">${esc(item.vehicleNumber)} (${esc(item.name)})</div>
          <div class="password-request-meta">${esc(item.phone)}, ${esc(item.company || '-')}</div>
          <div class="password-request-time">요청 ${esc(new Date(item.createdAt).toLocaleString('ko-KR'))}</div>
          <div class="password-request-actions">
            <button type="button" class="approve" data-reset-approve="${esc(item.id)}">임시 비밀번호 발급</button>
            <button type="button" class="reject" data-reset-reject="${esc(item.id)}">요청 반려</button>
          </div>
        </article>`).join('') : '<div class="password-request-empty">대기 중인 비밀번호 발급 요청이 없습니다.</div>';

      list.querySelectorAll('[data-reset-approve]').forEach((button) => {
        button.onclick = async () => {
          const item = requests.find((entry) => entry.id === button.dataset.resetApprove);
          if (!item || !confirm(`${item.vehicleNumber} (${item.name}) 회원의 임시 비밀번호를 발급하시겠습니까?\n기존 로그인은 모두 종료됩니다.`)) return;
          button.disabled = true;
          try {
            const result = await request(`/api/admin/password-reset-requests/${encodeURIComponent(item.id)}/approve`, { method: 'POST' });
            issuedModal(result, item.phone);
            await loadAdminRequests(section);
          } catch (error) {
            button.disabled = false;
            alert(error.message);
          }
        };
      });

      list.querySelectorAll('[data-reset-reject]').forEach((button) => {
        button.onclick = async () => {
          const item = requests.find((entry) => entry.id === button.dataset.resetReject);
          if (!item || !confirm(`${item.vehicleNumber} (${item.name}) 회원의 요청을 반려하시겠습니까?`)) return;
          button.disabled = true;
          try {
            await request(`/api/admin/password-reset-requests/${encodeURIComponent(item.id)}/reject`, {
              method: 'POST', body: { reason: '회원정보 확인 필요' },
            });
            await loadAdminRequests(section);
          } catch (error) {
            button.disabled = false;
            alert(error.message);
          }
        };
      });
    } catch (error) {
      list.innerHTML = `<div class="password-request-empty">${esc(error.message)}</div>`;
    }
  }

  function enhanceMemberManagement() {
    const layer = document.querySelector('.driver-manage-layer');
    const body = layer?.querySelector('.driver-manage-body');
    if (!body) return;
    layer.querySelectorAll('.driver-badge').forEach((badge) => {
      if (badge.textContent.trim() === '비밀번호 변경 대기') badge.textContent = '새 비밀번호 설정 대기';
    });
    if (body.querySelector('.password-request-section')) return;
    const section = document.createElement('section');
    section.className = 'password-request-section';
    section.innerHTML = '<h3>비밀번호 발급 요청</h3><div data-password-requests><div class="password-request-empty">불러오는 중…</div></div>';
    body.insertBefore(section, body.firstChild);
    loadAdminRequests(section);
  }

  window.addEventListener('popstate', () => document.querySelector('.password-reset-layer')?.remove());

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceDriverLogin();
      enhanceMemberManagement();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
