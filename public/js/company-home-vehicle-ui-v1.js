(() => {
  const app = document.getElementById('app');
  if (!app) return;

  function setFieldLabel(inputId, text) {
    const input = document.getElementById(inputId);
    const label = input?.closest('.cf-field')?.querySelector(':scope > span');
    if (label) label.textContent = text;
  }

  function refineHome() {
    const requestList = document.getElementById('cf_request_list');
    const requestButton = app.querySelector('[data-cf-view="request"]');
    const vehiclesButton = app.querySelector('[data-cf-view="vehicles"]');
    if (!requestList || !requestButton || !vehiclesButton) return;

    const appbar = app.querySelector(':scope > .cf-appbar');
    const title = appbar?.querySelector('h1');
    const subtitle = appbar?.querySelector('small');
    if (title) title.textContent = '출입 신청 관리';
    subtitle?.remove();

    /* 별도 소개문구 없이 헤드 다음에 주요 기능 버튼을 바로 배치한다. */
    app.querySelector(':scope > .cf-screen > .cf-hero')?.remove();

    requestButton.textContent = '새 출입 신청';
    vehiclesButton.textContent = '소속 차량관리';
  }

  function refineVehicleList() {
    const numberInput = document.getElementById('cf_v_number');
    if (!numberInput) return;

    setFieldLabel('cf_v_driver', '운전자');
    setFieldLabel('cf_v_phone', '연락처');

    /* 업체 계약유형은 회원가입에서 관리하므로 차량별 기본유형은 받지 않는다. */
    document.getElementById('cf_v_type')?.closest('.cf-field')?.remove();

    app.querySelectorAll('.cf-screen > .cf-item .cf-meta').forEach((meta) => {
      const br = meta.querySelector('br');
      if (br) {
        let node = br.nextSibling;
        while (node) {
          const next = node.nextSibling;
          node.remove();
          node = next;
        }
        br.remove();
      }
      if (meta.firstChild?.nodeType === Node.TEXT_NODE) {
        meta.firstChild.textContent = meta.firstChild.textContent.replace(/^기본 운전자\s*/u, '운전자 ');
      } else {
        meta.innerHTML = meta.innerHTML.replace(/^기본 운전자\s*/u, '운전자 ');
      }
    });
  }

  function apply() {
    refineHome();
    refineVehicleList();
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  };

  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
