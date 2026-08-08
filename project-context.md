# Entry-Pass 프로젝트 컨텍스트

> 최종 갱신일: 2026-08-08  
> 저장소: `dudo011/Entry-pass`  
> 기준 브랜치: `main`  
> 현재 Worker 진입점: `src/worker.js` (과거 worker-v2..v10 체인을 동작 보존하며 단일 파일로 병합)  
> 문서 목적: 현재 구현 구조, 현장 업무 규칙, 2026-08-08까지의 주요 변경사항, 미해결 이슈를 다음 개발자 또는 AI 도구에 정확하게 인계하기 위한 문서

---

## 1. 프로젝트 성격

Entry-Pass는 자재센터 외부 차량 출입을 사전에 신청·승인하고, 차량기사에게 안전수칙과 이동동선을 안내한 뒤 현장사진까지 확인하여 출입 절차를 완료하는 **모바일 우선 PWA 프로토타입**이다.

현재 코드는 짧은 기간에 반복적으로 현장 테스트를 하면서 기능을 빠르게 추가한 형태이므로 다음 특징이 있다.

- HTML / CSS / Vanilla JavaScript 중심 SPA
- Cloudflare Workers + D1
- 기존 기능을 보존하기 위한 Worker 버전 체인
- 기본 화면 이후 여러 보정 JavaScript를 순차 로드하는 구조
- Android/Galaxy 실사용 화면을 보면서 UX를 반복 조정
- 공식 운영 구조라기보다 현장 요구사항 검증용 프로토타입 성격이 강함

따라서 다음 개발자는 **업무 흐름과 검증된 UX는 적극 재사용하되, 누적된 보정 스크립트 구조를 그대로 장기 운영 구조로 확대하지 않는 것**이 좋다.

---

## 2. 2026-08-08 기준 핵심 아키텍처

현재 주 흐름은 과거의 “차량기사 개인계정이 직접 신청” 방식이 아니라 **업체 공용계정 중심 구조**이다.

```text
업체 공용계정 가입/로그인
  → 업체 소속 차량 등록
  → 업체 사무실 담당자가 새 출입 신청
  → 차량 유형별 안전수칙 확인
  → 차량 동선 확인
  → 출입일자/차량/실제 운전자/필수서류 입력
  → 자재센터 직원 승인
  → 승인 시 신청별 기사 전용 보안링크 생성
  → 업체 담당자가 기사에게 링크 공유
  → 기사가 링크에서 안전수칙 확인
  → 현장 도착 후 사진 업로드
  → 첫 정상 현장사진 업로드 시 자동 최종완료
```

### 핵심 원칙

- 회사당 공용 업체계정 1개를 기본 단위로 사용한다.
- 사업자등록번호는 업체계정별 고유값이다.
- 로그인 ID는 업체계정, 기존 사용자계정, 직원 가입신청 범위를 포함해 중복을 막는다.
- 업체의 계약유형은 회원가입 시 결정하며, 출입신청 화면에서 임의 변경할 수 없다.
- 차량기사는 별도 회원가입을 하지 않아도 된다.
- 승인된 신청마다 별도의 기사 전용 보안링크를 발급한다.
- 기사 링크에서 안전수칙 확인 → 현장사진 업로드를 완료하면 자동으로 최종완료된다.
- 기존 `requests.status`는 호환성을 위해 `pending / approved / rejected`를 유지하고, 상세 진행단계는 `workflow_status`로 별도 관리한다.

---

## 3. 사용자와 권한

### 3.1 업체 공용계정

업체계정은 회사 사무실 담당자가 사용한다.

주요 기능:

- 회원가입 / 로그인
- 업체 계약유형 관리(가입 시 확정)
- 소속 차량 등록·수정·삭제
- 새 출입 신청 작성
- 등록차량 또는 용차 선택
- 실제 운전자 이름·연락처 입력 또는 변경
- 필수서류 제출
- 신청 진행상태 확인
- 완료된 출입 이력 확인
- 승인 후 기사 전용 링크 공유

### 3.2 차량기사

현재 신규 업체 흐름에서는 차량기사 회원계정이 필요하지 않다.

기사 전용 보안링크에서 다음 기능만 사용한다.

- 신청 차량·업체·출입일자 확인
- 차량 유형별 필수/기타 안전수칙 확인
- 차량 동선 확인
- 안전수칙 확인 완료
- 현장사진 업로드
- 최종완료 상태 확인

기사 링크는 신청별 토큰을 사용하며, 출입 예정일 다음 날 23:59:59 KST까지 유효하도록 설계되어 있다.

### 3.3 자재센터 직원

- 출입신청 조회
- 신청 상세 및 첨부서류 확인
- 승인
- 필요 시 반려 처리
- 승인된 신청의 진행상태 확인
- 통계/검색
- Excel 내보내기
- 기존 차량기사 회원관리 기능

### 3.4 관리자

일반 직원 기능을 포함하며 추가로 직원관리 기능을 사용한다.

- 직원 가입신청 승인·반려
- 직원 사용중지·재개
- 직원 권한 변경
- 직원 계정 삭제
- 관리자 권한 부여/회수

---

## 4. 업체 회원가입 규칙

관련 서버:

- `src/company-registration-v2.js`
- `src/company-flow-api.js`

현재 회원가입 입력 순서:

1. 아이디
2. 비밀번호
3. 비밀번호 확인
4. 업체명
5. 사업자번호
6. 업체 연락처
7. 계약유형
8. 회원가입

### 주요 규칙

- 담당자명 입력은 현재 UI에서 제거되어 있다.
- `contact_name` DB 필드는 기존 호환성을 위해 남아 있으나 신규 가입에서는 빈 문자열을 저장한다.
- 사업자등록번호는 숫자 10자리 기준으로 중복을 검사한다.
- 로그인 ID는 영문 대소문자를 구분하지 않고 중복 검사한다.
- 중복 범위는 `company_accounts`, 기존 `users`, 승인/대기 중인 `staff_applications`까지 포함한다.
- 업체가입 후 별도 관리자 승인 없이 `active` 상태로 즉시 사용할 수 있다.
- 향후 중지 기능을 고려해 `account_status` 필드를 유지한다.
- 비밀번호는 PBKDF2-SHA256, 100,000회 반복을 사용한다.

### 계약유형 표시명

회원가입 UI에서는 불필요한 “차량” 표현을 줄여 다음처럼 표시한다.

- 공사업체
- 물자수송용역
- 기자재 납품
- 불용품 매각
- PCBs처리용역

---

## 5. 차량 유형과 업무 규칙

기준 파일: `data/vehicleTypes.js`

| ID | 원본 유형명 | 신청번호 접두어 |
|---|---|---:|
| `construction` | 공사업체 | A |
| `transport` | 물자수송용역 차량 | B |
| `delivery` | 기자재 납품차량 | C |
| `scrap` | 불용품 매각차량 | D |
| `pcbs` | PCBs처리용역 차량 | E |

### 공통 필수 안전수칙 6개

1. 안전장구(안전모, 안전화) 착용
2. 운전위치 이탈 시 시동 정지, 파킹브레이크 체결, 고임목 설치
3. 작업차량의 작업반경 내 출입 금지
4. 음주 후 현장 투입 및 작업 금지
5. 적재물 덮개 작업 시 안전대 착용 및 안전고리 체결
6. 혹한·혹서기 충분한 휴식 시행

### 공통 기타 안전수칙

- 자재센터 내 제한속도 20km 준수
- 교차지점 일단정지
- 안전띠 착용
- 승차석 외 탑승 금지
- 운전면허 및 관련 자격 소지

### 공사업체·PCBs 추가 필수수칙

- 작업계획서 작성 및 TBM 시행
- 아웃트리거 등 전도방지 조치
- 적재·인양물 고정 및 작업반경 안전조치

---

## 6. 소속 차량관리

관련 프런트:

- `public/js/company-flow-v1.js`
- `public/js/company-home-vehicle-ui-v1.js`
- `public/js/company-home-history-tuning-v1.js`

업체는 여러 대의 소속 차량을 등록할 수 있다.

차량 마스터에는 다음 값을 저장한다.

- 차량번호
- 기본 운전자명
- 기본 운전자 연락처

`default_vehicle_type_id` 필드는 호환성 때문에 DB에 남아 있으나 현재 차량관리 UI에서는 차량유형을 받지 않는다. 신청 차량유형은 업체의 계약유형으로 강제한다.

### 2026-08-08 UI 변경

- 차량관리 버튼은 업체 홈 본문에서 제거했다.
- 헤드에서 `차량관리` 버튼을 `로그아웃` 왼쪽에 배치했다.
- `차량관리`와 `로그아웃` 버튼은 동일한 높이·글자크기·패딩으로 통일했다.
- 차량관리 화면에서는 **등록된 차량 목록을 차량 등록 폼보다 위에 표시**한다.
- 차량 목록은 한 줄에 `차량번호 | 수정 | 삭제`만 표시한다.
- 목록에서는 운전자명·연락처를 표시하지 않는다.
- 수정 기능 자체에서는 기존 운전자명·연락처를 계속 편집할 수 있다.

---

## 7. 업체 홈 화면

현재 홈 제목: `출입 신청 관리`

### 헤드

```text
출입 신청 관리        차량관리 | 로그아웃
```

### 주요 버튼

```text
새 출입 신청 | 출입 이력
```

두 버튼의 높이는 현재 60px로 맞춰져 있다.

### 신청내역 카드

홈의 진행 중 신청은 한 줄에 다음 세 항목만 표시한다.

```text
출입날짜 | 차량번호 | 진행상태
```

- 출입날짜에서 연도는 숨긴다.
- 날짜와 차량번호의 글자 크기/굵기는 동일하게 맞췄다.
- 홈 표시 상태명:
  - `승인대기`
  - `안전수칙`
  - `현장사진`
  - `최종완료`
  - `반려`

### 출입 이력

- `출입 이력`에는 `workflow_status = completed`인 최종완료 건만 포함한다.
- 출입일자 기준 내림차순으로 정렬하여 최근 출입일이 맨 위에 온다.
- 출입 이력 화면의 헤드 `X` 버튼은 삭제했다.
- Android/브라우저 시스템 뒤로가기를 누르면 업체 홈으로 돌아가도록 history state를 추가했다.

관련 보정 파일:

- `public/js/company-home-history-tuning-v1.js`

---

## 8. 새 출입 신청 흐름

관련 프런트:

- `public/js/company-request-flow-v2.js`
- `public/js/company-request-prefetch-v1.js`
- `public/js/safety-highlights-v2.js`
- `public/js/transport-route-refined.js`
- `public/js/application-flow-refined.js`

관련 서버:

- `src/company-contract-request-v2.js`
- `src/company-flow-api.js`

### 현재 흐름

```text
새 출입 신청
  → 필수 안전수칙
  → 기타 안전수칙
  → 차량 동선
  → 출입신청 정보/서류 입력
  → 신청 제출
```

### 계약유형 강제

업체가 회원가입할 때 선택한 `contract_type_id`가 해당 업체의 출입신청 차량유형이 된다.

서버는 `/api/company/requests` 제출 시 화면에서 전달된 차량유형을 신뢰하지 않고 업체계정의 계약유형으로 다시 덮어쓴다.

### 출입일자 기본값

- 기본값은 “오늘”이 아니라 **다음 영업일**이다.
- 토요일·일요일과 앱에 정의된 대한민국 공휴일/대체공휴일을 제외한다.
- 현재 하드코딩된 공휴일 목록은 2026~2027년 기준이므로 이후 연도 갱신이 필요하다.

### 차량 선택

- 등록 차량을 선택하면 차량번호가 자동 표시된다.
- 등록차량은 차량번호를 읽기전용으로 표시한다.
- 등록차량 선택 시 기본 운전자명·연락처를 자동 채운다.
- 실제 당일 운전자가 다르면 운전자명·연락처를 신청 화면에서 변경할 수 있다.
- 이 변경은 차량 마스터의 기본 운전자 정보를 수정하지 않는다.
- 목록 마지막에는 `용차`가 있다.
- 용차 선택 시 차량번호·운전자명·연락처를 직접 입력한다.

### 새 출입 신청 화면 전환 지연 개선

기존에는 `새 출입 신청`을 누를 때 계약정보·등록차량·차량유형을 다시 네트워크 조회하여 잠깐 버퍼링이 있었다.

현재는 `public/js/company-request-prefetch-v1.js`가 홈에서 필요한 데이터를 미리 불러와 캐시하고, 새 신청 화면에서 재사용한다.

차량 등록·수정·삭제가 발생하면 차량 캐시는 폐기한다.

---

## 9. 차량 동선

관련 파일:

- `public/js/transport-route-refined.js`
- `public/js/route-image-cache-v2.js`
- `public/js/application-flow-refined.js`

지도 자산:

```text
public/route-images/
├── construction.jpg
├── transport.jpg
├── scrap.jpg
└── pcbs.jpg
```

주요 목적지:

- 물자수송/납품: 전선 야적장
- 공사업체: 3창고
- 불용품 매각: 고철장
- PCBs: 폐변압기 야적장

### 2026-08-08 수정

한때 차량동선 화면에 실제 지도가 아니라 `수정중` 문구만 표시되는 문제가 있었다.

원인은 `application-flow-refined.js`의 오래된 route placeholder가 `transport-route-refined.js`가 만든 최신 지도 화면을 다시 덮어쓰는 것이었다.

현재는 `application-flow-refined.js`의 route 화면 보정을 no-op으로 바꾸고, 실제 지도 화면은 `transport-route-refined.js`가 전담한다.

또한 지도 이미지 쿼리버전을 강제로 최신화하기 위해 `route-image-cache-v2.js`가 `img.transport-route-map`의 URL을 보정한다.

---

## 10. 필수 제출서류

공사업체·불용품 매각·PCBs 처리 유형은 작업서류가 필요하다.

| 키 | 표시명 | 필수 여부 | 현재 비고 |
|---|---|---:|---|
| `workPlan` | 작업계획서 | 필수 | 앱 내 3쪽 작성 저장 해결됨(메모리 기반 toBlob 3쪽 → 배열 첨부). 15~17절 참고 |
| `tbm` | TBM | 필수 | 앱 내 필기/첨부 기능 유지 |
| `safetyChecklist` | 위험성 체크리스트 | 필수 | 앱 내 필기/첨부 기능 유지 |
| `sitePhoto` | 현장사진 | 신규 업체 신청 단계에서는 제외 | 기사 전용 링크에서 현장 도착 후 업로드 |

신규 업체 흐름에서는 현장사진을 업체 사무실이 사전 첨부하지 않는다. 직원 승인 후 기사가 현장에서 직접 업로드한다.

파일 제한은 서버에서 개별 파일 약 5MB를 기준으로 검증한다. 현재 문서는 D1 `documents` 테이블에 base64 형태로 저장한다.

---

## 11. 직원 승인 후 기사 전용 링크

관련 서버:

- `src/company-driver-share-v2.js`
- `src/company-driver-access-v3.js`
- `src/company-flow-api.js`

업체 신청이 직원에게 승인되면 신청별 기사 접근 토큰이 생성된다.

업체는 승인된 신청 상세에서 링크를 확인하여 기사에게 전달한다.

공유는 별도 유료 알림톡 API가 아니라 다음 방식 중심이다.

- 모바일 네이티브 공유
- 카카오톡 등 사용자가 직접 선택하는 공유
- 링크 복사

### 기사 링크 유효기간

출입예정일의 다음 날 23:59:59 KST까지 사용 가능하도록 설계되어 있다.

### 기사 진행 상태

```text
safety_pending
  → 기사 안전수칙 확인
photo_pending
  → 현장사진 업로드
completed
```

첫 번째 정상 현장사진 업로드가 성공하면 서버에서 즉시 `workflow_status='completed'`, `photo_uploaded_at`, `completed_at`을 기록한다.

완료된 링크는 만료 전까지 결과 확인용으로 사용할 수 있으나 추가 사진 등록은 막는다.

---

## 12. 신청 상태 모델

### 레거시 상태

`requests.status`

- `pending`
- `approved`
- `rejected`

기존 직원 화면 및 호환성을 위해 유지한다.

### 신규 상세 진행상태

`requests.workflow_status`

```text
pending
  → 직원 승인
safety_pending
  → 기사 안전수칙 확인
photo_pending
  → 기사 현장사진 업로드
completed
```

반려 시 `rejected`를 사용한다.

### 사용자 화면 표시

업체 홈:

- 승인대기
- 안전수칙
- 현장사진
- 최종완료
- 반려

관리자/직원 검색 결과에서도 신규 업체 신청은 `workflowStatus`를 우선 사용하여 동일한 실제 진행상태를 표시한다.

---

## 13. 관리자 출입 신청 관리 화면

관련 파일:

- `public/js/app.js`
- `public/js/admin-today-only.js`
- `public/js/request-list-unified-v1.js`
- `public/js/admin-stats-refined.js`
- `public/js/admin-excel-refined.js`
- `src/worker.js` (LAYER_v10)

### 상단 주요 탭

현재 UI:

```text
대기 | 승인 | 완료 | 통계
```

기존 `반려` 탭의 화면 자리를 `완료`로 전환했다.

반려 처리 기능 자체를 삭제한 것은 아니며, 필요하면 상세 처리에서 사용할 수 있다.

### 탭 분류 기준

#### 대기

직원 승인을 기다리는 `status=pending` 신청.

#### 승인

출입일자가 **오늘**이며 신규 업체 흐름에서 다음 진행상태인 신청만 표시한다.

- `safety_pending`
- `photo_pending`

즉 기사가 현장사진까지 완료해 `completed`가 되면 승인 숫자와 목록에서 빠진다.

#### 완료

출입일자가 **오늘**이며 다음 조건을 만족하는 신청.

- `companyFlow=true`
- `workflowStatus=completed`

완료 탭의 버튼 문구만 짧게 `완료`로 표시하고, 신청 카드의 상태 배지는 `최종완료`로 유지한다.

#### 통계

기간·방문목적·차량번호·계약업체 등으로 조회한다.

### 2026-08-08 상태 동기화 수정

기존 직원 API는 `status=approved`만 내려주어 기사 진행이 끝나도 계속 `승인 완료`로 보이는 문제가 있었다.

`src/worker.js`(LAYER_v10)에서 직원용 `GET /api/requests` 응답에 신규 업체 신청의 다음 값을 추가한다.

- `workflowStatus`
- `companyFlow: true`

`admin-today-only.js`는 약 5초 간격으로 최신 신청을 다시 불러와 승인/완료 숫자와 배지를 갱신한다.

### 완료 → 통계 탭 표시 버그 수정

완료 탭 선택 후 통계를 눌렀을 때 통계 화면은 열리지만 완료 버튼이 계속 검게 활성화되는 문제가 있었다.

원인은 별도 `completedMode`가 통계 진입 시 해제되지 않는 것이었다.

현재는 완료 외 어떤 탭을 눌러도 `completedMode=false`로 즉시 초기화하고, 렌더링 시 실제 활성 탭을 다시 확인한다.

---

## 14. 관리자 목록 한 줄 표시

관리자 신청 목록 역시 모바일 폭을 고려하여 다음 3열 구조를 사용한다.

```text
출입일자 | 차량번호 | 상태
```

날짜와 차량번호는 동일한 17px / 굵은 글꼴을 사용한다.

신규 업체 신청의 상태 배지는 실제 `workflowStatus`를 반영한다.

---

## 15. 작업계획서 3쪽 편집기 — 저장 경로 통일(A안) 적용, 실기기 검증 대기

> **2026-08-08 갱신: 저장 실패의 근본 원인이 "작업계획서만 별도의 취약한 배관을
> 탄다"는 점으로 특정되어, TBM·위험성 체크리스트가 쓰는 검증된 저장 경로로
> 통일(A안)했다. 코드/헤드리스 로드 검증은 마쳤고, Galaxy 실기기 최종 확인만
> 남았다. 자세한 적용 내용은 16절 "시도 7" 참고.**
>
> **원인 요약**: 작업계획서만 (1) 전역 `window.fetch` 몽키패치, (2) 크로스모듈
> 브리지, (3) 1개 `workPlan` 키에 fetch로 다중 파일 주입, (4) 구형 DataTransfer
> 저장이라는 4중 취약 배관을 탔다. 반면 TBM·위험성 체크리스트는
> `openExistingFormAnnotator`에서 `flow.files[key]=file`로 곧바로 저장하는
> 단순 경로라 실기기에서 안정적으로 동작한다. "어제 코드 복원만으로 안 됐다"는
> 관찰과도 일치한다(문제는 인코딩 속도가 아니라 배관 차이).

작업계획서 UI 자체는 3쪽 편집기로 구현되어 있다.

- 1쪽: 작업개요, 장비 사용계획
- 2쪽: 중량물 취급계획, 작업계획도
- 3쪽: 위험요인·안전대책, 작업지휘자/유도자 지정 및 교육

사용 기능:

- 한 손가락 작성
- 두 손가락 확대/이동
- 되돌리기
- 현재 쪽 지우기
- 이전/다음 페이지

2쪽에는 실제 공사업체 차량 동선 이미지가 정해진 위치에 삽입된다.

확인된 지도 위치 기준:

```text
left   32.5%
top    43.847241867%
width  65%
height 53.748231966%
```

현재 관련 파일:

- `public/js/work-plan-form-editor.js`
- `public/js/work-plan-stable-save-v1.js`  ← **현재 index.html에서 로드되는 저장 보정 모듈**
- `public/js/work-plan-map-position-fix.js`

과거 시도 파일(`work-plan-fast-save-v2.js`, `work-plan-map-override.js`)은
2026-08-08 저장소 정리 시 삭제했다(로드되지 않던 죽은 코드). 필요 시 git
이력에서 복구할 수 있다.

### 15.1 중요한 관찰

사용자 제보상 **2026-08-07까지는 작업계획서 저장이 정상 동작했던 시점이 있었으나**, 2026-08-08 신규 업체 신청 흐름과 연결한 뒤 저장이 정상 완료되지 않았다.

따라서 단순 이미지 생성 성능 문제뿐 아니라 다음 가능성을 함께 봐야 한다.

- 신규 업체 신청의 `flow.files` 연결 방식
- 편집기 닫힘/화면 lifecycle
- 생성 파일을 `<input type=file>`에 넣는 모바일 브라우저 제약
- 전역 `fetch` 래핑과 FormData 변경
- 큰 canvas JPEG/PDF 인코딩의 Galaxy 메모리 문제

---

## 16. 작업계획서에서 시도했지만 실패한 방법

아래 내용은 **같은 접근을 반복하지 않도록 반드시 참고**해야 한다.

### 시도 1. 3쪽을 하나의 긴 JPEG로 합성

파일: 과거 `work-plan-fast-save-v2.js` 계열

방법:

- 각 페이지를 캡처
- 약 `1000 x 4278` 크기의 하나의 긴 canvas에 3쪽을 세로로 합침
- 마지막에 JPEG 1장으로 `canvas.toBlob()` 인코딩
- 생성 JPEG를 작업계획서 첨부파일로 사용

실기기 결과:

- 1/3, 2/3, 3/3 페이지 처리는 진행됨
- 화면 상단이 **`파일 만드는 중…`**에서 장시간 멈춤

판단:

- Galaxy 모바일 브라우저에서 대형 canvas 최종 JPEG 인코딩이 병목으로 의심됨

### 시도 2. 각 페이지 JPEG 생성 후 한 개 PDF로 조립

방법:

- 3쪽을 각각 JPEG로 축소 캡처
- 3개 JPEG를 직접 PDF 객체에 삽입
- 최종 `작업계획서.pdf` 1개 생성

목표:

- 대형 세로 canvas 인코딩을 없애고 TBM 저장과 비슷한 속도를 기대

실기기 결과:

- PDF 생성 단계는 넘어간 경우가 있었음
- 이후 **`첨부 중…`**에서 멈춤

판단:

- 이미지/PDF 생성뿐 아니라 생성 파일을 신청화면에 연결하는 경로에도 문제가 있음

### 시도 3. `DataTransfer → input.files → change` 방식

방법:

- 생성한 PDF/JPEG를 `DataTransfer`에 넣음
- `input.files`에 프로그램으로 할당
- `change` 이벤트를 발생시켜 기존 파일첨부 로직 재사용

실기기 결과:

- **`첨부 중…`에서 진행되지 않음**

판단:

- Samsung Internet / Android Chrome 계열에서 프로그래밍 방식의 `input.files` 대입이 불안정할 가능성이 높음

### 시도 4. 파일 input을 완전히 우회하고 앱 상태에 직접 연결

방법:

- `window.__companyRequestAttachGeneratedFile` 브리지를 추가
- `DataTransfer`, `input.files`, `change` 이벤트를 사용하지 않음
- 생성 파일을 신규 업체 신청의 `flow.files.workPlan`에 직접 저장

실기기 결과:

- 여전히 저장 화면이 정상 종료되지 않음
- 일부 버전에서는 **`첨부 중…`** 상태에서 멈춤

판단:

- 단순 `input.files` 문제만은 아님

### 시도 5. 2026-08-06 이전 정상 동작 저장엔진 복원

파일:

- `work-plan-map-override.js`의 이전 버전

방법:

- 새 fast-save 방식을 제거
- 과거 사용하던 `3쪽 캡처 → PDF 생성 → 첨부` 저장 엔진으로 복원

실기기 결과:

- 상단 문구가 과거 방식인 **`저장 중…`**으로 바뀌어 복원 코드가 실제 로드된 것은 확인됨
- 그러나 신규 업체 신청 흐름에서는 여전히 다음 화면으로 넘어가지 않음

판단:

- “어제 정상 코드” 자체만 복원해도 해결되지 않았으므로, **신규 업체 신청 흐름과의 통합 차이**가 핵심 후보임

### 시도 6. PDF를 완전히 제거하고 3쪽 JPEG를 그대로 제출

현재 활성 파일:

- `public/js/work-plan-stable-save-v1.js`

현재 코드 방식:

1. 각 페이지를 850px 폭 JPEG로 캡처
2. PDF 생성 없음
3. 1쪽 파일을 `__companyRequestAttachGeneratedFile('workPlan', file)`로 직접 연결
4. 2·3쪽은 `extraWorkPlanPages`에 보관
5. 업체가 최종 신청할 때 전역 `fetch` wrapper가 `FormData`에 동일한 `documentKeys=workPlan`으로 2·3쪽을 추가

서버는 같은 `workPlan` 키로 여러 파일이 들어오는 것을 막지 않으므로, 구조상 3개 이미지 제출은 가능하도록 설계했다.

실기기 결과:

- 사용자가 **여전히 정상적으로 다음 화면으로 넘어가지 않는다고 확인**
- 이 시점에서 작업계획서 문제는 보류하고 다른 기능 작업으로 이동함

### 시도 7 (2026-08-08, 현재 적용 — A안: 검증된 저장 경로로 통일)

핵심 판단: 새 저장 방식을 또 만들지 않고, **이미 실기기에서 잘 되는 TBM·위험성
체크리스트의 저장 경로에 작업계획서를 얹는다.**

적용 내용:

1. `company-request-flow-v2.js` — `flow.files[key]` 값이 File 배열(작업계획서
   3쪽)일 수 있도록 확장. 라벨 표기, 필수서류 검증, 제출 FormData 조립에서
   배열을 순회한다. 브리지 `__companyRequestAttachGeneratedFile`는
   `storeGeneratedFile`을 통해 File 하나 또는 File[] 모두 저장한다.
2. `work-plan-stable-save-v1.js` — **전역 `window.fetch` 몽키패치와
   `extraWorkPlanPages`를 완전히 제거**. 3쪽 JPEG를 캡처해 `bridge('workPlan',
   [p1,p2,p3])` 배열로 한 번에 전달하고 편집기를 닫는다. 저장 버튼 문구로
   단계(지도 로딩 → 1/3·2/3·3/3쪽 저장 → 신청서에 첨부 → 완료)를 표시해
   실기기에서 마지막 성공 지점을 눈으로 확인할 수 있다.
3. `work-plan-form-editor.js` — 3쪽 편집 UI는 유지하되, **자체 PDF+DataTransfer
   저장 경로(구형)는 비활성화**(`try{return;...}`)해 위험 배관을 제거.
4. 서버(`company-flow-api.js`)는 동일 `documentKeys=workPlan`으로 온 다중 파일을
   각각 문서로 저장하므로 **서버 변경 없음**.

보강(2026-08-08, 시도 7-b — 실제 멈춤 원인은 "캡처 단계"였음):

실기기에서 저장 버튼이 "N/3 저장 중…"에서 멈춘다는 것은 **첨부/제출 배관이
아니라 그 앞의 캡처 단계에서 막힌다**는 뜻이었다. 시도 7-a는 캡처 이후(첨부·
제출)만 고쳐 멈춤을 해결하지 못했다. 캡처 단계의 세 병목을 모두 제거:

- `toDataURL`(동기 인코딩 → 메인 스레드 블로킹) → `toBlob`(비동기)로 교체
- `pdf()` 조립 루프("파일 만드는 중" 멈춤 원인) 제거, 페이지별 JPEG 직접 생성
- `DataTransfer`(삼성 인터넷 "첨부 중" 멈춤) 제거, 배열 브리지로 대체

또한 stable-save의 **DOM 페이지 네비게이션 캡처(goToPage/waitForBackground)를
버리고**, 저장 로직을 편집기 모듈(`work-plan-form-editor.js`)로 옮겨
편집기 메모리(`pages[]`/`docs[]`)에서 3쪽을 한 번에 캡처한다(회사 흐름 통합
전 정상 동작하던 방식). `work-plan-stable-save-v1.js`는 2쪽 지도 오버레이
표시 전용으로 축소했다(클릭 가로채기 제거).

검증 상태:

- 헤드리스에서 저장 시 브리지가 `workPlan` 키로 File 배열 3개(각 ~70~110KB
  JPEG)를 받고 편집기 정상 종료·버튼 "완료" 도달·JS 예외 없음 확인.
- **남은 것: Galaxy 실기기에서 실제 저장 → 제출까지 1회 확인.** 새 버전은
  저장 버튼 문구에 "쪽"이 있다("N/3쪽 저장 중…"). "3/3 저장 중…"처럼 "쪽"이
  없으면 옛 캐시가 로드된 것이므로 앱을 완전히 종료 후 재실행해야 한다.

### 결론

문제의 근원은 인코딩 속도나 DataTransfer 단일 이슈가 아니라 **작업계획서만
별도의 취약한 배관을 탔다는 점**이었고, A안으로 검증된 단일 경로에 통일했다.
그래도 실기기에서 문제가 남으면 다음 순서로 좁힌다.

1. 페이지 캡처/인코딩(저장 버튼 문구가 "N/3쪽 저장 중…"에서 멈추는지)
2. 배열 첨부 브리지("신청서에 첨부 중…"에서 멈추는지)
3. 제출/렌더 lifecycle("완료" 후 신청 화면 복귀·제출)

---

## 17. 작업계획서 다음 디버깅 권고

아래는 아직 충분히 검증하지 않은 **다음 조사 방향**이다.

### 우선 1. 단계별 실기기 로그 추가

저장 함수에서 다음 지점마다 화면 또는 콘솔에 timestamp를 남기는 것이 좋다.

```text
save click
map loaded
page 1 captured
page 2 captured
page 3 captured
bridge called
flow.files updated
editor root removed
request screen repaint
```

현재는 버튼 문구만으로 추정했기 때문에 정확한 마지막 성공 라인을 잡기 어렵다.

### 우선 2. 전역 fetch monkey patch 제거

현재 `work-plan-stable-save-v1.js`는 2·3쪽을 최종 제출할 때 추가하기 위해 `window.fetch`를 래핑한다.

장기적으로는 `company-request-flow-v2.js`의 제출 로직 자체가 다음처럼 명시적으로 다중 작업계획서 파일 배열을 받도록 수정하는 편이 안전하다.

```text
flow.files.workPlan = [page1, page2, page3]
```

그리고 제출 시 배열을 순회하여 FormData에 넣는 방식이 더 명확하다.

### 우선 3. 레거시 정상 시점과 신규 업체 흐름의 차이 비교

2026-08-07 정상 동작 시점의 다음 항목을 현재 흐름과 diff 하는 것이 중요하다.

- 작업계획서 편집기 생성 함수
- 저장 버튼 이벤트 캡처 순서
- `input[data-doc=workPlan]` 존재 여부
- 화면 overlay/history 처리
- 저장 후 호출되는 change handler
- 신청 데이터가 보관되는 객체 구조

### 우선 4. 저장 완료 후 UI 닫기부터 먼저 검증

이미지 파일 생성과 서버 제출을 한 번에 해결하려 하지 말고 다음 순서로 분리 테스트하는 것이 좋다.

1. 3쪽 캡처 없이 저장 버튼 클릭 시 편집기가 정상 닫히는지
2. 1쪽만 캡처한 후 닫히는지
3. 3쪽 캡처 후 파일 연결 없이 닫히는지
4. 파일 연결을 추가한 후 닫히는지
5. 최종 제출에 다중 파일을 추가

이렇게 하면 병목 위치를 좁히기 쉽다.

---

## 18. 관리자 통계/Excel

통계 화면은 기간, 방문목적, 차량번호, 계약업체 등으로 검색한다.

Excel 내보내기 기능은 `public/js/admin-excel-refined.js`에서 브라우저 내부적으로 XLSX 구조를 생성한다.

주의:

- 기존 Excel 상태명은 레거시 `status` 기반 부분이 남아 있을 수 있으므로, 향후 공식화할 때 `workflowStatus`를 함께 반영할지 검토한다.

---

## 19. 레거시 차량기사 계정 기능

신규 업체 흐름이 주 구조이지만 기존 차량기사 회원관리 기능은 저장소에 남아 있으며 관리자/직원 도구에서 일부 사용한다.

대표 기능:

- 차량번호 기반 기사 계정
- 임시 비밀번호 발급
- 비밀번호 발급 요청 처리
- 차주 변경
- 논리적 회원 삭제
- 기존 출입기록 보존

관련 파일:

- `src/driver-account-staff-api.js`
- `src/password-reset-staff-api.js`
- `public/js/driver-account-management-v2.js`
- `public/js/password-reset-flow-v2.js`

다음 개발자는 **이 레거시 기사계정 흐름과 신규 “기사 무계정 보안링크” 흐름을 혼동하지 않아야 한다.**

신규 업체 신청에서는 기사 회원가입이 필요 없다.

---

## 20. 주요 데이터 구조

### `company_accounts`

- `id`
- `login_id`
- `login_id_norm`
- `company_name`
- `business_no`
- `business_no_norm`
- `contact_name` (호환 필드, 신규 UI에서는 비사용)
- `phone`
- `contract_type_id`
- `salt`
- `hash`
- `account_status`
- `created_at`

### `company_sessions`

업체 Bearer 세션 토큰을 저장한다.

업체 세션 최대기간은 현재 약 30일이다.

### `company_vehicles`

- `company_account_id`
- `vehicle_number`
- `driver_name`
- `driver_phone`
- `default_vehicle_type_id` (호환 필드)

업체 내 차량번호는 unique이다.

### `requests`

레거시 필드에 신규 업체 흐름 필드가 추가되어 있다.

주요 신규 필드:

- `workflow_status`
- `company_account_id`
- `company_vehicle_id`
- `is_temporary_vehicle`
- `driver_access_token`
- `driver_access_expires_at`
- `safety_confirmed_at`
- `photo_uploaded_at`
- `completed_at`

### `documents`

신청별 첨부문서를 base64로 저장한다.

---

## 21. 현재 Worker 구조

현재 진입점: `src/worker.js` (단일 파일).

2026-08-08 정리 전에는 `worker.js + worker-v2..v10`으로 이어지는 "레이어
오버라이드" 버전 체인(10개 파일)이었다. 새 담당자 혼동을 줄이기 위해 **동작을
보존하며 하나의 `src/worker.js`로 합쳤다.** 각 과거 버전은 블록 스코프로 격리된
레이어(`LAYER_base`, `LAYER_v2`…`LAYER_v10`)로 남아 있으며, 실행 순서는 동일하다.

```text
요청 → LAYER_v10 → v9 → v8 → v7 → v6 → v5 → v4 → v3 → v2 → LAYER_base
      (각 레이어가 자체 라우트 처리 후 안쪽 레이어로 위임)
export default LAYER_v10
```

합치기 방식은 로직 재작성이 아니라 "각 파일 본문을 블록으로 감싸고 파일 간
import를 파일 내 변수 참조로 바꾼" 기계적 병합이라, 라우트 우선순위·미들웨어·
스케줄러(cron) 동작이 그대로 보존된다. 원본 체인과 병합본을 dev 서버로 나란히
띄워 대표 라우트 11개(정적 자산·`/api/vehicle-types` 실데이터·인증/검증/404)의
응답이 **바이트 단위로 동일**함을 확인했다.

`LAYER_v10`(최외곽)은 신규 업체 흐름을 우선 처리한다.

주요 모듈:

- `company-registration-v2.js`
- `company-contract-request-v2.js`
- `company-driver-share-v2.js`
- `company-driver-access-v3.js`
- `company-flow-api.js`

또한 직원용 `GET /api/requests` 응답에 신규 업체 신청의 `workflowStatus`를 합쳐 기존 직원 화면에서도 실제 기사 진행상태를 알 수 있게 한다.

---

## 22. 보안 관련 현재 상태

### 적용 중

- PBKDF2-SHA256 100,000회
- 랜덤 salt
- 직원 세션 쿠키 기반 인증
- 업체 Bearer 세션
- CSRF 보호(직원 cookie write 요청)
- 주요 응답 no-store
- 보안헤더 적용
- 기사 현장사진은 JPG/PNG magic byte 검사
- 사진 개별 5MB 제한
- 기사 링크 만료시간 검사

### 기술 부채/추가 검토

- 업체 Bearer 토큰이 프런트 localStorage에 남는 구조
- 기사 접근토큰이 현재 raw token 형태로 D1에 저장되는 구조
- D1에 첨부문서를 base64 저장하는 확장성
- 정식 migration 체계 부재
- 프런트 보정 스크립트 누적
- Worker 버전 체인 누적
- 정식 보안진단 미실시

`src/worker.js`의 LAYER_v10은 기사 사진 업로드를 위해 `Permissions-Policy`의 camera를 same-origin에 허용하도록 보정한다.

---

## 23. PWA와 캐시

과거 실기기에서 이전 JavaScript가 계속 보이는 문제가 여러 번 있었다.

현재 적용 원칙:

- `index.html`에서 주요 JS/CSS에 쿼리버전 사용
- Worker 응답에서 JS/CSS/HTML을 no-store 처리
- Service Worker 역시 최신 코드 반영을 우선

화면 이상이 발생하면 **실제 UI 증상과 함께 index.html의 스크립트 버전, 현재 로드 대상 파일, Service Worker 상태를 모두 확인**해야 한다.

---

## 24. 2026-08-08 주요 변경사항 요약

### 업체 가입/계정

- 업체 공용계정 구조 정착
- 회원가입 필드 순서 정리
- 담당자명 제거
- 계약유형 가입 시 선택
- 로그인 ID 전역 중복검사
- 사업자등록번호 중복검사

### 업체 홈

- 헤드 제목 `출입 신청 관리`
- `차량관리`를 헤드의 `로그아웃` 옆으로 이동
- 차량관리/로그아웃 버튼 크기와 글자 통일
- 본문 버튼을 `새 출입 신청 | 출입 이력`으로 정리
- 버튼 높이 60px
- 신청내역을 `날짜 | 차량번호 | 상태` 한 줄로 표시
- 날짜 연도 제거
- 날짜 글꼴을 차량번호와 동일화
- 출입 이력은 최종완료 건만 표시
- 출입 이력 최근 출입일자 우선 정렬
- 출입 이력 X 버튼 제거
- Android 뒤로가기로 홈 복귀

### 차량관리

- 등록 차량 목록을 상단으로 이동
- 목록 표시를 `차량번호 | 수정 | 삭제`로 단순화
- 목록에서 운전자/연락처 숨김

### 새 출입 신청

- 출입일자 기본값을 다음 영업일로 복원
- 등록차량 선택 시 차량번호 자동 표시
- 용차 지원
- 등록차량 기본 운전자/연락처 자동 입력 및 신청별 override 지원
- 신규 신청 진입 전 필요한 데이터 prefetch로 화면 전환 버퍼링 감소

### 차량동선

- 오래된 `수정중` placeholder 제거
- 실제 유형별 지도 화면 유지
- 지도 이미지 캐시 버전 보정

### 기사 진행

- 업체 승인 후 신청별 기사 전용 보안링크
- 기사 안전수칙 확인
- 현장사진 업로드
- 사진 성공 시 자동 최종완료

### 관리자 화면

- 신규 업체 신청의 `workflowStatus`를 직원 API에 노출
- 실제 기사 진행상태를 카드에 반영
- 승인 탭은 오늘의 `안전수칙/현장사진` 진행 건만 표시
- 기존 반려 탭 자리를 `완료` 탭으로 변경
- 완료 탭은 오늘의 `workflowStatus=completed` 건만 표시
- 완료 탭 버튼 문구는 `완료`, 카드 상태는 `최종완료`
- 완료 → 통계 이동 시 완료 버튼이 계속 활성화되던 상태 버그 수정
- 약 5초 간격으로 관리자 상태 자동 갱신

### 작업계획서

- 근본 원인을 "작업계획서만 별도의 취약한 배관(전역 fetch 몽키패치·크로스모듈
  브리지·1키 다중파일 fetch 주입·구형 DataTransfer)을 탄다"로 특정
- TBM·위험성 체크리스트가 쓰는 검증된 in-module 저장 경로로 통일(A안) 적용
- `flow.files.workPlan`을 3쪽 File 배열로 저장, 몽키패치·DataTransfer 제거
- 저장 버튼에 단계별 진행 문구 추가(실기기 병목 지점 확인용)
- 코드/헤드리스 검증 완료, **Galaxy 실기기 최종 확인 대기**
- 상세 내용은 본 문서 15~17절(특히 16절 "시도 7") 참고

---

## 25. 현재 주요 파일

| 파일 | 역할 |
|---|---|
| `src/worker.js` | 현재 Worker 진입점(단일 파일). 과거 worker-v2..v10 레이어 체인을 동작 보존 병합. 신규 업체 흐름 우선 라우팅, 직원 API workflow 상태 보정 |
| `src/company-flow-api.js` | 업체 인증, 차량관리, 신청/승인 관련 기본 API |
| `src/company-registration-v2.js` | 업체 회원가입 v2 |
| `src/company-contract-request-v2.js` | 업체 계약유형 강제 및 신청 wrapper |
| `src/company-driver-share-v2.js` | 업체의 기사 링크 조회/공유 데이터 |
| `src/company-driver-access-v3.js` | 기사 보안링크 조회 및 현장사진 업로드/자동완료 |
| `public/js/company-flow-v1.js` | 업체 기본 화면/상태/API |
| `public/js/company-registration-ui-v2.js` | 업체 회원가입 UI |
| `public/js/company-request-flow-v2.js` | 신규 업체 출입신청 화면 |
| `public/js/company-request-prefetch-v1.js` | 새 신청 진입용 데이터 사전 캐시 |
| `public/js/company-home-vehicle-ui-v1.js` | 업체 홈/차량관리 기본 보정 |
| `public/js/company-home-history-tuning-v1.js` | 홈 버튼, 출입이력, 날짜/상태/뒤로가기 보정 |
| `public/js/company-flow-ui-fix.js` | 업체 화면 공통 헤더/스타일 보정 |
| `public/js/admin-today-only.js` | 관리자 대기/승인/완료 탭의 오늘 기준 workflow 처리 |
| `public/js/request-list-unified-v1.js` | 관리자/업체 목록 3열 한 줄 UI |
| `public/js/admin-excel-refined.js` | 통계 Excel 내보내기 |
| `public/js/transport-route-refined.js` | 차량유형별 동선 화면 |
| `public/js/route-image-cache-v2.js` | 동선 이미지 캐시 버전 강제 갱신 |
| `public/js/application-flow-refined.js` | 신청 화면 보정; route 화면은 현재 덮어쓰지 않음 |
| `public/js/work-plan-form-editor.js` | 작업계획서 3쪽 편집기 |
| `public/js/work-plan-stable-save-v1.js` | 작업계획서 3쪽 캡처→배열 브리지 저장(A안, 몽키패치 제거·검증 대기) |
| `public/js/work-plan-map-position-fix.js` | 작업계획서 2쪽 지도 위치 보정 |
| `public/index.html` | 실제 CSS/JS 로드 순서와 캐시 버전 |
| `data/vehicleTypes.js` | 차량유형/안전수칙/동선/필수서류 기준 데이터 |
| `public/route-images/` | 유형별 동선 지도 이미지 |
| `wrangler.toml` | Cloudflare Worker/D1 설정 |

---

## 26. 현재 검증 수준

확인한 범위:

- Galaxy/Android 실제 화면을 통한 반복 UI 확인
- 신규 업체 가입/홈/차량관리/신청 화면 동작 확인
- 관리자 탭 및 workflow 상태 표시 화면 확인
- 기사 안전수칙/현장사진 흐름 구현
- GitHub 최신 파일 재조회 방식으로 변경사항 검증

미확인 또는 불완전:

- **작업계획서 앱 내 저장: 실기기 실패 상태**
- 전체 신규 업체 흐름에 대한 자동 E2E 테스트 없음
- GitHub Actions CI 없음
- 정식 운영 수준의 부하/장애/보안 테스트 없음

GitHub commit status는 일반적으로 `statuses: []`이며 이는 “CI 통과”가 아니라 **CI 상태검사가 구성되어 있지 않음**을 의미한다.

---

## 27. 다음 개발자/AI가 반드시 알아야 할 것

1. 현재 주 아키텍처는 **업체 공용계정 + 기사 무계정 보안링크**이다.
2. 과거 차량기사 회원계정 흐름은 레거시 기능이며 신규 업체 흐름과 혼동하지 않는다.
3. 업체의 차량유형은 출입신청 시 선택하지 않고 회원가입의 계약유형으로 강제한다.
4. 관리자 화면은 레거시 `status`만 보면 안 되고 반드시 `workflowStatus`를 함께 봐야 한다.
5. `완료` 관리자 탭은 오늘의 `workflowStatus=completed` 신청을 의미한다.
6. 업체 `출입 이력`은 최종완료 신청만 포함한다.
7. 작업계획서 저장은 해결된 기능으로 취급하면 안 된다.
8. 작업계획서에 이미 여러 접근을 시도했으므로 16절의 실패 기록을 먼저 읽고 다른 방식으로 접근한다.
9. 동선 화면의 body를 `application-flow-refined.js`에서 다시 교체하면 `수정중` 회귀가 발생할 수 있다.
10. 수정 전 최신 파일과 SHA를 다시 확인하고, 실제 `public/index.html` 로드 여부를 반드시 확인한다.

---

## 28. 유지관리 원칙

- 차량유형/안전수칙/필수서류 변경 전 `data/vehicleTypes.js` 확인
- 권한 변경 시 UI와 서버 양쪽을 함께 수정
- 기존 신청기록을 삭제하는 변경 금지
- DB 스키마 변경 시 정식 migration 도입 권장
- 지도·양식 이미지는 앱 내부 정적 자산 사용
- PWA/모바일 회귀는 실제 Android에서 확인
- `public/index.html`에 로드되지 않는 보정 파일은 실제 동작 코드로 간주하지 않음
- 운영 비밀값, 토큰, 비밀번호, D1 식별자 등은 본 문서에 기재하지 않음
- 기능 변경 시 이 문서도 함께 갱신
