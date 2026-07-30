(() => {
  const TOKEN_KEY = 'ep_token';
  const USER_CACHE_KEY = 'ep_user_cache';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const readCachedUser = () => {
    try { return JSON.parse(localStorage.getItem(USER_CACHE_KEY) || 'null'); } catch { return null; }
  };
  const cacheUser = (user) => {
    if (!user) return;
    try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user)); } catch { /* noop */ }
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    if (/\/api\/auth\/(?:login|register|me|profile)(?:\?|$)/.test(url)) {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        if (response.ok && data?.user) cacheUser(data.user);
      } catch { /* 기존 요청 처리 유지 */ }
    }
    return response;
  };

  const style = document.createElement('style');
  style.textContent = `
    .driver-home-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
    .driver-home-actions .link-btn{position:static!important;transform:none!important;white-space:nowrap}
    .driver-profile-overlay{position:fixed;inset:0;z-index:10000;background:var(--bg,#f5f7fb);overflow:auto}
    .driver-profile-overlay .profile-appbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;min-height:64px;padding:0 18px;background:#fff;border-bottom:1px solid var(--border,#e5e7eb)}
    .driver-profile-overlay .profile-appbar h1{margin:0;font-size:21px;font-weight:700;letter-spacing:0}
    .driver-profile-overlay .profile-close{margin-left:auto;border:0;background:transparent;font-size:28px;line-height:1;padding:8px;color:var(--text,#111827)}
    .driver-profile-overlay .profile-screen{max-width:560px;margin:0 auto;padding:18px 16px 36px}
    .driver-profile-overlay .profile-card{background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:16px}
    .driver-profile-overlay .field-h{display:flex;align-items:center;gap:12px;min-height:58px}
    .driver-profile-overlay .field-h .lb{flex:0 0 118px;font-size:16px;font-weight:700}
    .driver-profile-overlay .field-h input,.driver-profile-overlay .field-h select{flex:1;min-width:0;box-sizing:border-box}
    .driver-profile-overlay .readonly-id{background:#f3f4f6!important;color:#6b7280!important}
    .driver-profile-overlay .profile-save{margin-top:18px;width:100%}
    .mini-card.visit-expired .veh{text-decoration:line-through;color:var(--muted,#6b7280)}
  `;
  document.head.appendChild(style);

  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api${path}`, { ...options, headers });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
    return data;
  }

  function toast(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2400);
  }

  function formatVisitDate(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '출입일자 미정';
    const [year, month, day] = key.split('-');
    return `${year}. ${Number(month)}. ${Number(day)}`;
  }

  function isPastVisit(value) {
    const key = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return key < todayKey;
  }

  async function getCurrentUser() {
    const cached = readCachedUser();
    if (cached) return cached;
    const { user } = await api('/auth/me');
    cacheUser(user);
    return user;
  }

  async function openProfile() {
    if (document.querySelector('.driver-profile-overlay')) return;
    try {
      const [user, vehicleTypes] = await Promise.all([getCurrentUser(), api('/vehicle-types')]);
      const overlay = document.createElement('div');
      overlay.className = 'driver-profile-overlay';
      const options = vehicleTypes.map((type) =>
        `<option value="${esc(type.id)}" ${type.id === user.defaultVehicleTypeId ? 'selected' : ''}>${esc(type.name)}</option>`).join('');
      overlay.innerHTML = `
        <div class="profile-appbar"><h1>내 기본정보 수정</h1><button type="button" class="profile-close" aria-label="닫기">×</button></div>
        <div class="profile-screen"><div class="profile-card">
          <label class="field-h"><span class="lb">차량번호</span><input class="readonly-id" type="text" value="${esc(user.loginId)}" readonly></label>
          <label class="field-h"><span class="lb">비밀번호</span><input id="profilePassword" type="password" autocomplete="new-password" minlength="4" placeholder="변경할 경우 최소 4자리"></label>
          <label class="field-h"><span class="lb">비밀번호 확인</span><input id="profilePassword2" type="password" autocomplete="new-password" minlength="4" placeholder="변경할 경우 다시 입력"></label>
          <label class="field-h"><span class="lb">이름</span><input id="profileName" type="text" value="${esc(user.name)}"></label>
          <label class="field-h"><span class="lb">연락처</span><input id="profilePhone" type="tel" value="${esc(user.phone)}"></label>
          <label class="field-h"><span class="lb">계약유형</span><select id="profileVehicleType">${options}</select></label>
          <label class="field-h"><span class="lb">소속업체</span><input id="profileCompany" type="text" value="${esc(user.company)}" placeholder="없을 경우 공란"></label>
          <button type="button" class="btn btn-primary profile-save">저장</button>
        </div></div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('.profile-close').onclick = close;
      overlay.querySelector('.profile-save').onclick = async (event) => {
        const button = event.currentTarget;
        const password = overlay.querySelector('#profilePassword').value;
        const password2 = overlay.querySelector('#profilePassword2').value;
        if (password && password.length < 4) return toast('비밀번호는 최소 4자리로 입력해 주세요.');
        if (password !== password2) return toast('비밀번호가 일치하지 않습니다.');
        const name = overlay.querySelector('#profileName').value.trim();
        const phone = overlay.querySelector('#profilePhone').value.trim();
        if (!name || !phone) return toast('이름과 연락처를 입력해 주세요.');
        button.disabled = true;
        try {
          const result = await api('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify({
              password: password || undefined,
              name,
              phone,
              defaultVehicleTypeId: overlay.querySelector('#profileVehicleType').value,
              company: overlay.querySelector('#profileCompany').value.trim(),
            }),
          });
          cacheUser(result.user);
          toast('기본정보가 수정되었습니다.');
          close();
          setTimeout(() => location.reload(), 300);
        } catch (error) {
          button.disabled = false;
          toast(error.message);
        }
      };
    } catch (error) {
      toast(error.message);
    }
  }

  function refineApplicationCompany() {
    const companyInput = document.querySelector('#app #company');
    if (!companyInput || companyInput.dataset.companyLinked === 'true') return;
    const cached = readCachedUser();
    if (cached?.company && !companyInput.value.trim()) {
      companyInput.value = cached.company;
      companyInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    companyInput.dataset.companyLinked = 'true';
    if (!cached) {
      api('/auth/me').then(({ user }) => {
        cacheUser(user);
        if (user?.company && !companyInput.value.trim()) {
          companyInput.value = user.company;
          companyInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }).catch(() => {});
    }
  }

  async function refineHome() {
    refineApplicationCompany();

    const homeButton = document.querySelector('#app [data-nav="driverTypes"]');
    const list = document.getElementById('myList');
    const appbar = document.querySelector('#app > .appbar');
    if (!homeButton || !list || !appbar) return;

    document.querySelector('#app .profile-card')?.remove();

    if (appbar.dataset.driverHomeRefined !== 'true') {
      const cached = readCachedUser();
      const heading = appbar.querySelector('h1');
      if (heading) heading.textContent = cached?.loginId || cached?.defaultVehicleNumber || '차량번호(ID)';
      appbar.querySelector('.sub')?.remove();

      const logout = appbar.querySelector('[data-logout]');
      const actions = document.createElement('div');
      actions.className = 'driver-home-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'link-btn';
      edit.textContent = '정보수정';
      edit.onclick = openProfile;
      actions.append(edit);
      if (logout) actions.append(logout);
      appbar.append(actions);
      appbar.dataset.driverHomeRefined = 'true';

      if (!cached) {
        api('/auth/me').then(({ user }) => {
          cacheUser(user);
          if (heading) heading.textContent = user.loginId || user.defaultVehicleNumber || '차량번호(ID)';
        }).catch(() => {});
      }
    }

    const cards = [...list.querySelectorAll('.mini-card[data-open]:not([data-visit-refined])')];
    if (!cards.length) return;
    try {
      const requests = await api('/my/requests');
      const byId = new Map(requests.map((request) => [String(request.id), request]));
      cards.forEach((card) => {
        const request = byId.get(String(card.dataset.open));
        if (!request) return;
        const label = card.querySelector('.veh');
        if (label) label.textContent = formatVisitDate(request.visitAt);
        card.classList.toggle('visit-expired', isPastVisit(request.visitAt));
        card.dataset.visitRefined = 'true';
      });
    } catch { /* 기존 목록 표시 유지 */ }
  }

  const app = document.getElementById('app');
  if (!app) return;
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refineHome, 0);
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();