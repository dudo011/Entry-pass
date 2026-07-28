/**
 * 자재센터 출입차량 유형별 설정 데이터
 *
 * 유형을 추가/수정하려면 이 배열만 바꾸면 됩니다.
 * - requiredSafetyRules : 필수 안전수칙 (1페이지, 반드시 확인·동의)
 * - otherSafetyRules    : 기타 안전수칙 (1페이지)
 * - route               : 유형별 차량 동선 안내
 * - requiredDocuments   : 유형별 제출 서류 (required=true 는 필수)
 */
export default [
  {
    id: 'transport',
    name: '물자수송용역 차량',
    subtitle: '연간 물자수송 용역계약 차량',
    icon: '🚛',
    color: '#2563eb',
    requiredSafetyRules: [
      '센터 구내 제한속도 10km/h 이하를 반드시 준수합니다.',
      '상하차 전 시동을 정지하고 주차 브레이크 체결 및 바퀴 굄목을 설치합니다.',
      '후진·정차 시 유도원의 신호에 따르고 사각지대를 육안 확인합니다.',
      '안전모·안전화 등 개인보호구를 착용한 상태로 작업합니다.',
      '적재물의 결속 상태를 확인하고 낙하를 방지합니다.',
    ],
    otherSafetyRules: [
      '지정된 상하차 구역 외에서는 정차·작업하지 않습니다.',
      '보행자 통로와 지게차 이동 동선에 주의합니다.',
      '구내 흡연 및 화기 취급을 금지합니다.',
      '작업 종료 후 주변을 정리정돈합니다.',
    ],
    route: {
      summary: '정문 → 계량대 → 지정 상하차장',
      steps: [
        '정문 차단기에서 QR/승인번호 확인 후 진입',
        '계량대에서 계근 후 대기',
        '내부 순환도로를 따라 지정 상하차장으로 이동',
        '유도원 지시에 따라 지정 베이에 정차',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'insurance', label: '차량 보험증권', required: true },
      { key: 'contract', label: '용역계약 확인서', required: true },
      { key: 'safetyEdu', label: '안전교육 이수증', required: false },
    ],
  },
  {
    id: 'construction',
    name: '공사업체 차량',
    subtitle: '공사·정비 용역 수행 차량',
    icon: '🏗️',
    color: '#d97706',
    requiredSafetyRules: [
      '센터 구내 제한속도를 준수하고 공사구역에서는 서행합니다.',
      '작업 전 안전모·안전화·안전벨트 등 보호구를 착용합니다.',
      '지정된 공사구역 외 지역으로 진입하지 않습니다.',
      '중장비 작업 반경 내 접근을 금지하고 신호수를 배치합니다.',
      '작업 전 위험성평가/작업 전 안전점검(TBM)에 참여합니다.',
    ],
    otherSafetyRules: [
      '자재 적치 시 보행·차량 통로를 확보합니다.',
      '분진·소음 발생 작업은 사전에 통보합니다.',
      '화기작업 시 화기작업허가서를 소지합니다.',
      '작업 종료 후 청소하고 폐자재를 반출합니다.',
    ],
    route: {
      summary: '정문 → 공사현장 지정 게이트',
      steps: [
        '정문에서 공사 출입 승인 확인 후 진입',
        '안내에 따라 공사현장 지정 게이트로 이동',
        '현장 관리자 확인 후 지정 위치에 주차',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'insurance', label: '차량 보험증권', required: true },
      { key: 'workPermit', label: '공사계약서/작업허가서', required: true },
      { key: 'safetyEdu', label: '안전보건교육 이수증', required: true },
      { key: 'workPlan', label: '유해위험작업 작업계획서', required: false },
    ],
  },
  {
    id: 'delivery',
    name: '기자재 납품차량',
    subtitle: '기자재·부품 납품 차량',
    icon: '🚚',
    color: '#0d9488',
    requiredSafetyRules: [
      '센터 구내 제한속도 10km/h 이하를 준수합니다.',
      '하차 전 시동을 정지하고 주차 브레이크를 체결합니다.',
      '지게차 하역 작업 시 적재물 하부에 접근하지 않습니다.',
      '안전모·안전화 등 개인보호구를 착용합니다.',
    ],
    otherSafetyRules: [
      '지정된 하역장에서만 하차합니다.',
      '납품 명세를 확인한 후 하차를 진행합니다.',
      '보행자 통로를 준수합니다.',
      '구내 흡연 및 화기 취급을 금지합니다.',
    ],
    route: {
      summary: '정문 → (대형은 계량대) → A동 하역장',
      steps: [
        '정문에서 승인번호 확인 후 진입',
        '대형 차량은 계량대 계근 후 이동',
        'A동 하역장 빈 베이에 정차 후 하역',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'insurance', label: '차량 보험증권', required: true },
      { key: 'delivery', label: '납품(거래) 명세서', required: true },
    ],
  },
  {
    id: 'scrap',
    name: '불용품 매각차량',
    subtitle: '불용·매각품 반출 차량',
    icon: '♻️',
    color: '#65a30d',
    requiredSafetyRules: [
      '센터 구내 제한속도를 준수합니다.',
      '상차 전 시동을 정지하고 주차 브레이크 체결 및 굄목을 설치합니다.',
      '크레인·지게차 상차 시 작업 반경 내 접근을 금지하고 신호수를 배치합니다.',
      '안전모·안전화·보호장갑 등 개인보호구를 착용합니다.',
      '반출 전 적재물 결속 상태를 확인하고 낙하를 방지합니다.',
    ],
    otherSafetyRules: [
      '반출 물품을 계량하고 반출증을 확인합니다.',
      '지정된 상차장 외에서는 작업하지 않습니다.',
      '날카로운 고철·폐자재 취급에 주의합니다.',
      '반출 전 정문 반출확인 절차를 이행합니다.',
    ],
    route: {
      summary: '정문 → 매각품 보관장 → 계량대 → 반출',
      steps: [
        '정문에서 매각 반출 승인 확인 후 진입',
        '매각품 보관장에서 담당자 입회하에 상차',
        '계량대에서 계근 후 정문 반출확인 절차 진행',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'insurance', label: '차량 보험증권', required: true },
      { key: 'saleContract', label: '매각(낙찰) 계약서/반출증', required: true },
    ],
  },
  {
    id: 'pcbs',
    name: 'PCBs처리용역 차량',
    subtitle: 'PCBs 함유 폐기물 처리 용역 차량',
    icon: '☣️',
    color: '#dc2626',
    requiredSafetyRules: [
      '유해화학물질 취급 구역에서 화기 취급 및 흡연을 절대 금지합니다.',
      '상차·이송 전 접지 및 누출방지 조치를 완료합니다.',
      '방제장비·흡착포·소화기를 차량 인근에 비치합니다.',
      '내화학 장갑·보안경·방독마스크 등 개인보호구를 착용합니다.',
      '누출·사고 발생 시 즉시 작업을 중단하고 관리자에게 신고합니다.',
    ],
    otherSafetyRules: [
      '지정된 보관·상차 장소에서만 작업합니다.',
      '폐기물 인계·인수서(올바로) 확인 후 반출합니다.',
      '이송 경로 및 차량 표지 부착 상태를 확인합니다.',
      '작업 종료 후 오염 여부를 점검합니다.',
    ],
    route: {
      summary: '정문 → 지정 보관장소(격리구역) → 계량 → 전용 게이트 반출',
      steps: [
        '정문에서 PCBs 반출 승인 확인 후 진입',
        '지정 격리 보관장소에서 관리자 입회하에 상차',
        '계량 후 위험물 전용 게이트로 반출',
      ],
    },
    requiredDocuments: [
      { key: 'license', label: '운전면허증', required: true },
      { key: 'hazmat', label: '위험물/폐기물 운반차량 서류', required: true },
      { key: 'wasteContract', label: '폐기물 처리 용역계약서', required: true },
      { key: 'manifest', label: '폐기물 인계서(올바로)', required: true },
      { key: 'msds', label: 'MSDS(물질안전보건자료)', required: false },
    ],
  },
];
