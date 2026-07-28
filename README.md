# 자재센터 출입 신청 앱 (Entry-Pass)

자재센터 출입 차량 기사가 **출입 전 안전수칙을 확인하고 사전 출입 승인을 신청**하면,
자재센터 직원이 **권한에 따라 확인 후 승인/반려**하는 모바일 웹앱입니다.
(아파트 방문차량 사전승인과 동일한 개념 — 경비실 구두 요청 대신 사전 승인)

## 차량 유형 (5종)

| 유형 | 설명 |
|---|---|
| 🚛 물자수송용역 차량 | 연간 물자수송 용역계약 차량 |
| 🏗️ 공사업체 차량 | 공사·정비 용역 수행 차량 |
| 🚚 기자재 납품차량 | 기자재·부품 납품 차량 |
| ♻️ 불용품 매각차량 | 불용·매각품 반출 차량 |
| ☣️ PCBs처리용역 차량 | PCBs 함유 폐기물 처리 용역 차량 |

유형을 선택하면 **안전수칙·차량동선·필요서류가 유형별로 자동으로** 달라집니다.

## 핵심 기능

- **로그인 / 회원가입**
  - 기사: 회원가입 시 이름·연락처·소속·주 차량번호·계약 유형을 저장 →
    반복 출입 시 신청 화면에 **자동으로 채워짐**
  - 직원: 아이디/비밀번호 로그인 + **권한(관리자/승인담당)**
- **안전수칙 2단계** — 필수 안전수칙(1/2, 동의 필수) → 기타 안전수칙(2/2) 각각 1페이지
- **차량 동선 안내** — 유형별 센터 내 이동 경로
- **필요 서류 업로드** — 유형별 필수/선택 서류
- **출입 신청 제출** → 승인번호 발급, 상태(대기/승인/반려) 조회, 내 신청 이력
- **직원 승인/반려** — 신규 신청이 5초 폴링으로 실시간 반영
- **기록 서버 보관** — 출입/승인 기록은 삭제하지 않고 서버에 보관하며,
  각 기록에 **보존 만료일(기본 신청일 + 3년)** 을 저장 (`RETENTION_YEARS` 로 조정)
- **관리자 CSV 내보내기** — 장기 보관·감사용 전체 기록 CSV 다운로드 (관리자 전용)
- **모바일 우선 UI + PWA** (홈 화면 추가 시 앱처럼, 다크모드 지원)

## 권한 구분

| 권한 | 대기 승인/반려 | 전체 이력 조회 | CSV 내보내기 |
|---|:---:|:---:|:---:|
| 승인담당 (approver) | ✅ | 승인/반려 탭 | ❌ |
| 관리자 (admin) | ✅ | ✅ (전체이력 탭) | ✅ |

## 실행 방법 (로컬 개발)

Cloudflare Workers 기반입니다. D1은 로컬 에뮬레이션으로 동작합니다.

```bash
npm install
npm run db:init:local   # 로컬 D1에 테이블 + 기본 직원 계정 생성
npm run dev             # http://localhost:8787
```

기본 직원 계정(스키마 시드):

- 관리자: `admin` / `admin1234`
- 승인담당: `staff` / `staff1234`

> ⚠️ 운영 배포 전 반드시 기본 비밀번호를 변경하세요. (변경 방법은 `DEPLOY.md`)

기사는 첫 화면 **운전기사 → 회원가입**으로 직접 계정을 만듭니다.

## 배포 (Cloudflare)

D1(DB+서류) · Workers(서버)를 Cloudflare 무료 티어로 배포합니다.
서류도 D1에 저장하므로 **R2·결제카드가 필요 없습니다.**

- **터미널 없이 브라우저로만 배포** → **[`DEPLOY-BROWSER.md`](DEPLOY-BROWSER.md)**
  (Cloudflare 대시보드 + GitHub 웹 연동, 이후 코드 수정 시 자동 재배포)
- **PC에서 명령어로 배포** → **[`DEPLOY.md`](DEPLOY.md)**

```bash
# PC(터미널) 방식 요약
npx wrangler login
npx wrangler d1 create entry-pass-db     # 출력된 database_id 를 wrangler.toml 에 입력
npm run db:init                          # 원격 D1에 스키마 적용
npm run deploy
```

## 실제 내용으로 교체하기

차량 유형·안전수칙(필수/기타)·동선·서류 목록은 모두 아래 한 파일에 모여 있습니다.

- **`data/vehicleTypes.js`** — 유형 추가/수정 시 이 배열만 편집
  - `requiredSafetyRules` (필수), `otherSafetyRules` (기타)
  - `route` (동선), `requiredDocuments` (서류, `required: true` 는 필수)

## 구조

```
src/worker.js          백엔드 (Cloudflare Workers + Hono) — 인증/권한/신청/승인/CSV
schema.sql             D1 스키마 (users/sessions/requests/documents) + 직원 시드
wrangler.toml          Cloudflare 설정 (D1·정적자산 바인딩)
data/vehicleTypes.js   차량 유형별 안전수칙·동선·서류 설정
public/                모바일 웹 프런트엔드 (빌드 불필요)
  index.html / css/styles.css / js/app.js
DEPLOY.md              Cloudflare 배포 가이드
```

- **D1 (SQLite)** — 사용자·세션·출입신청 + **첨부 서류(base64)** 저장
  (신청 기록과 함께 보존기간까지 유지, R2 불필요)
- **Workers** — API 서버 + 정적 프런트엔드 서빙
- 업로드 시 이미지 자동 압축(긴 변 1600px·JPEG)으로 용량 절감
- 비밀번호는 Web Crypto **PBKDF2-SHA256** 으로 해시 저장

## API 요약

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/auth/register` | - | 기사 회원가입 |
| POST | `/api/auth/login` | - | 로그인 |
| POST | `/api/auth/logout` | 로그인 | 로그아웃 |
| GET | `/api/auth/me` | 로그인 | 내 정보 |
| PUT | `/api/auth/profile` | 기사 | 기본정보 수정 |
| GET | `/api/vehicle-types` | - | 차량 유형별 설정 |
| POST | `/api/requests` | 기사 | 출입 신청 생성(서류 첨부) |
| GET | `/api/my/requests` | 기사 | 내 신청 이력 |
| GET | `/api/requests` | 직원 | 신청 목록 |
| GET | `/api/requests/:id` | 본인/직원 | 신청 단건 |
| POST | `/api/requests/:id/approve` | 직원 | 승인 |
| POST | `/api/requests/:id/reject` | 직원 | 반려(사유) |
| GET | `/api/requests/export.csv` | 관리자 | 전체 기록 CSV |
| GET | `/api/retention` | - | 보존 기간(년) |

## 데이터 보존 (3년 이상)

- **기록과 서류를 자동 삭제하지 않습니다.** 신청 기록과 각 서류에
  `retain_until`(신청일 + 3년)이 저장됩니다. 보존기간은 `src/worker.js` 의
  `RETENTION_YEARS` 로 조정합니다.
- **기록(D1)** 은 Cloudflare 관리형으로 보관되며,
  `wrangler d1 export` 로 정기 백업을 권장합니다.
- **서류** 도 D1에 함께 저장되어 삭제하지 않는 한 유지됩니다. 관리자 CSV 내보내기와
  `wrangler d1 export` 백업으로 이중 보관하세요. (자세한 내용은 `DEPLOY.md`)

## 다음 단계 (확장 후보)

- 관리자용 직원 계정 관리 / 비밀번호 변경 화면
- 서류 보안 강화 (접근권한·암호화·보존기간 경과 후 자동 파기)
- 승인 시 기사에게 문자/푸시 알림
- QR 출입증 발급 및 정문 스캔 연동
