/**
 * 자재센터 출입차량 유형별 설정 데이터
 *
 * 유형을 추가/수정하려면 이 배열만 바꾸면 됩니다.
 * - safetyRules      : 유형별 필수 안전수칙 (기사가 확인 후 동의)
 * - route            : 유형별 차량 동선 안내
 * - requiredDocuments: 유형별 제출 서류 (required=true 는 필수)
 */
module.exports = [
  {
    id: 'large-truck',
    name: '대형 화물차',
    subtitle: '11톤 이상 대형 납품·상하차 차량',
    icon: '🚛',
    color: '#2563eb',
    safetyRules: [
      '센터 구내 진입 시 제한속도 10km/h 이하를 반드시 준수합니다.',
      '상하차 구역 진입 전 유도원의 수신호를 대기하고 지시에 따릅니다.',
      '하차 작업 중에는 반드시 시동을 끄고 주차 브레이크를 체결합니다.',
      '적재함 개방·크레인 작업 시 하부 및 주변에 작업자가 없는지 확인합니다.',
      '안전모·안전화 등 개인보호구를 착용한 상태로 하차합니다.',
      '후진 시 반드시 유도원 배치 후 진행하며, 사각지대를 육안 확인합니다.',
    ],
    route: {
      summary: '정문 → 계량대 → B동 대형 상하차장',
      steps: [
        '정문 차단기에서 QR/승인번호 확인 후 진입',
        '계량대(정문 우측 30m)에서 계근 후 대기',
        '내부 순환도로 우측 차선을 따라 B동으로 이동',
        'B동 대형 상하차장 유도원 지시에 따라 지정 베이에 정차',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'insurance', label: '차량 보험증권(자동차·화물)', required: true },
      { key: 'delivery', label: '납품(거래) 명세서', required: true },
      { key: 'safetyEdu', label: '안전교육 이수증', required: false },
    ],
  },
  {
    id: 'small-truck',
    name: '중·소형 화물차',
    subtitle: '1~5톤 납품·배송 차량',
    icon: '🚚',
    color: '#0d9488',
    safetyRules: [
      '센터 구내 제한속도 10km/h 이하를 준수합니다.',
      '지정된 소형 하차장 외 구역에서는 정차·하차하지 않습니다.',
      '수레·핸드파렛트 이동 시 보행자 통로를 확인하고 서행합니다.',
      '하차 작업 중에는 시동을 끄고 주차 브레이크를 체결합니다.',
      '안전화를 착용하고 무거운 자재는 2인 1조 또는 장비를 사용합니다.',
    ],
    route: {
      summary: '정문 → A동 소형 하차장',
      steps: [
        '정문 차단기에서 승인번호 확인 후 진입',
        '내부 순환도로를 따라 좌측 A동 방향으로 이동',
        'A동 소형 하차장(1~4번 베이) 빈 자리에 정차',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'delivery', label: '납품(거래) 명세서', required: true },
      { key: 'insurance', label: '차량 보험증권', required: false },
    ],
  },
  {
    id: 'tank-lorry',
    name: '탱크로리·위험물',
    subtitle: '유류·화학물질 등 위험물 운반 차량',
    icon: '🛢️',
    color: '#dc2626',
    safetyRules: [
      '위험물 하역 구역에서는 화기 취급 및 흡연을 절대 금지합니다.',
      '정전기 방지를 위해 접지선을 연결한 후 하역을 시작합니다.',
      '하역 중 엔진은 정지하고, 소화기를 차량 인근에 비치합니다.',
      '누출 발생 시 즉시 하역을 중단하고 관리자에게 신고합니다.',
      '개인보호구(내화학 장갑·보안경)를 착용하고 작업합니다.',
      'MSDS(물질안전보건자료)를 지참하고 지시에 따라 작업합니다.',
    ],
    route: {
      summary: '정문 → 위험물 전용 하역장(C동 후면)',
      steps: [
        '정문에서 위험물 반입 승인 확인 후 진입',
        '내부 순환도로 우측 끝 위험물 전용 게이트로 이동',
        'C동 후면 위험물 하역장에서 관리자 입회하에 정차',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'hazmat', label: '위험물 운송자격증', required: true },
      { key: 'msds', label: 'MSDS(물질안전보건자료)', required: true },
      { key: 'insurance', label: '차량 보험증권', required: true },
    ],
  },
  {
    id: 'equipment',
    name: '지게차·특수장비',
    subtitle: '지게차·크레인 등 장비 반입 차량',
    icon: '🏗️',
    color: '#d97706',
    safetyRules: [
      '장비 하차·이동 전 작업 반경 내 인원과 장애물을 확인합니다.',
      '지게차 등 장비 운전자는 유효한 조종 자격을 소지해야 합니다.',
      '고소·인양 작업 시 신호수를 배치하고 통제 구역을 설정합니다.',
      '장비 이동 시 급선회·급제동을 금지하고 서행합니다.',
      '작업 종료 후 장비를 안전한 위치에 하강·고정합니다.',
    ],
    route: {
      summary: '정문 → 장비 반입 야드(D동 옆)',
      steps: [
        '정문에서 장비 반입 승인 확인 후 진입',
        '내부 순환도로를 따라 D동 방향으로 이동',
        'D동 옆 장비 반입 야드에서 통제요원 지시에 따라 하차',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'operatorCert', label: '건설기계 조종사 면허/자격증', required: true },
      { key: 'insurance', label: '차량·장비 보험증권', required: true },
    ],
  },
  {
    id: 'visitor',
    name: '방문 승용차',
    subtitle: '점검·미팅 등 방문 목적 차량',
    icon: '🚗',
    color: '#7c3aed',
    safetyRules: [
      '센터 구내 제한속도 10km/h 이하를 준수합니다.',
      '지정된 방문자 주차구역에만 주차합니다.',
      '작업 구역(상하차장·야드) 무단 출입을 금지합니다.',
      '도보 이동 시 지정된 보행자 통로를 이용합니다.',
      '방문증을 패용하고 담당 직원의 안내에 따라 이동합니다.',
    ],
    route: {
      summary: '정문 → 방문자 주차장(본관 앞)',
      steps: [
        '정문에서 방문 승인 확인 후 진입',
        '본관 방향으로 이동',
        '본관 앞 방문자 주차장(P구역)에 주차 후 담당자 연락',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: false },
    ],
  },
];
