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
  '안전장구(안전모, 안전화) 착용',
  '운전위치 이탈 시 시동 정지, 파킹브레이크 체결, 고임목 설치',
  '작업차량의 작업반경 내 출입 금지',
  '음주 후 현장 투입 및 작업 금지',
  '적재물 덮개 작업시 안전대 착용, 안전고리 체결',
  '혹한·혹서기 충분한 휴식 시행',
];

// 모든 차량유형 공통 기타 안전수칙
const COMMON_OTHER = [
  '자재센터 내 제한속도 20km 준수',
  '교차지점 일단정지 후 확인',
  '운전자 좌석 안전띠 착용',
  '동승자 승차석 외 탑승 금지',
  '운전면허증, 화물운송종사자격증 소지',
];

// 공사업체·PCBs처리용역 차량 추가 필수 안전수칙 (공통 6개 + 아래 3개 = 총 9개, 2페이지)
const EXTRA_CONSTRUCTION_PCBS = [
  '작업계획서 작성 및 TBM 시행',
  '크레인·지게차 아웃트리거 등 전도방지 조치 철저',
  '인양물 작업전 해지장치 등 고정장치 확인, 작업 중 하부 출입금지',
];

// 공사업체(배전공사)·PCBs처리용역·불용품매각 차량 제출 서류 (사진/PDF 업로드)
const WORK_DOCS = [
  { key: 'workPlan', label: '작업계획서', required: true },
  { key: 'tbm', label: 'TBM 회의록', required: true,
    formImage: '/forms/tbm.png', formUrl: '/forms/tbm.pdf' },
  { key: 'safetyChecklist', label: '위험성 체크리스트', required: true,
    formImage: '/forms/work-plan.png', formUrl: '/forms/work-plan.pdf',
    focus: { x: 0.355, y: 0.325, w: 0.645 } },
  { key: 'sitePhoto', label: '차량·운전자 현장사진', required: false, note: '자재센터 출입 후 등록' },
];

const TRANSPORT_ROUTE = {
  summary: '정문 → 계량대 → 지정 상하차장',
  steps: [
    '정문 차단기에서 QR/승인번호 확인 후 진입',
    '계량대에서 계근 후 대기',
    '내부 순환도로를 따라 지정 상하차장으로 이동',
    '유도원 지시에 따라 지정 베이에 정차',
  ],
};

export default [
  {
    id: 'construction',
    passPrefix: 'A',           // 신청번호 접두 알파벳(방문 목적 순서: A~E)
    name: '공사업체',
    subtitle: '공사업체 차량',
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
    requiredDocuments: [...WORK_DOCS],
  },
  {
    id: 'transport',
    passPrefix: 'B',
    name: '물자수송용역 차량',
    subtitle: '연간 물자수송 용역계약 차량',
    icon: '🚛',
    color: '#2563eb',
    requiredSafetyRules: [...COMMON_REQUIRED],
    otherSafetyRules: [...COMMON_OTHER],
    route: { ...TRANSPORT_ROUTE },
    requiredDocuments: [],
  },
  {
    id: 'delivery',
    passPrefix: 'C',
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
    requiredDocuments: [],
  },
  {
    id: 'scrap',
    passPrefix: 'D',
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
    requiredDocuments: [...WORK_DOCS],
  },
  {
    id: 'pcbs',
    passPrefix: 'E',
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
    requiredDocuments: [...WORK_DOCS],
  },
];