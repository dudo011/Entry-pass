/**
 * 자재센터 출입차량 유형별 설정 데이터
 *
 * 유형을 추가/수정하려면 이 배열만 바꾸면 됩니다.
 * - requiredSafetyRules : 필수 안전수칙 (1페이지, 반드시 확인·동의)
 * - otherSafetyRules    : 기타 안전수칙 (1페이지)
 * - route               : 유형별 차량 동선 안내
 * - requiredDocuments   : 유형별 제출 서류 (required=true 는 필수)
 *
 * ※ 필수/기타 안전수칙은 모든 차량에 공통(COMMON_REQUIRED / COMMON_OTHER)으로
 *   적용합니다. 차량유형별 추가 수칙이 생기면 해당 유형의 배열을
 *   [...COMMON_REQUIRED, '유형별 추가 수칙1', ...] 형태로 확장하면 됩니다.
 */

// 모든 차량유형 공통 필수 안전수칙
const COMMON_REQUIRED = [
  '개인 안전장구(안전모, 안전화 등) 착용',
  '운전위치 이탈 시 시동 정지, 파킹브레이크 체결',
  '작업차량의 작업반경 내 출입 금지',
  '음주 후 현장 투입 및 작업 금지',
  '적재물 덮개 작업시 안전대 착용, 안전고리 체결',
  '혹한·혹서기 충분한 휴식 시행',
];

// 모든 차량유형 공통 기타 안전수칙
const COMMON_OTHER = [
  '자재센터 내 제한속도 20km 준수',
  '교차지점 일단정지 후 확인',
  '운전자 좌석 안전띠 착용, 동승자 승차석 외 탑승 금지',
  '차량검사증 소지, 법정정기검사 필증 부착 등',
];

// 공사업체·PCBs처리용역 차량 추가 필수 안전수칙 (공통 6개 + 아래 3개 = 총 9개, 2페이지)
const EXTRA_CONSTRUCTION_PCBS = [
  '작업계획서 작성 및 TBM 시행',
  '크레인·지게차 아웃트리거 등 전도방지 조치 철저',
  '인양물 작업전 해지장치 등 고정장치 확인, 작업 중 하부 출입금지',
];

export default [
  {
    id: 'transport',
    name: '물자수송용역 차량',
    subtitle: '연간 물자수송 용역계약 차량',
    icon: '🚛',
    color: '#2563eb',
    requiredSafetyRules: [...COMMON_REQUIRED],
    otherSafetyRules: [...COMMON_OTHER],
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
    requiredSafetyRules: [...COMMON_REQUIRED, ...EXTRA_CONSTRUCTION_PCBS],
    otherSafetyRules: [...COMMON_OTHER],
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
    requiredSafetyRules: [...COMMON_REQUIRED],
    otherSafetyRules: [...COMMON_OTHER],
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
    requiredSafetyRules: [...COMMON_REQUIRED],
    otherSafetyRules: [...COMMON_OTHER],
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
    requiredSafetyRules: [...COMMON_REQUIRED, ...EXTRA_CONSTRUCTION_PCBS],
    otherSafetyRules: [...COMMON_OTHER],
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
