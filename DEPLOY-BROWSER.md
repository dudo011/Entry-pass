# 터미널 없이 브라우저로만 배포하기

PC의 명령어 창(터미널) 없이, **Cloudflare 대시보드 + GitHub 웹**만으로 배포하는
방법입니다. 인터넷 브라우저만 있으면 됩니다.

> 준비물: 이메일(가입용), 인터넷 브라우저.
> 참고: **R2(서류 저장)** 를 처음 켤 때 결제수단(카드) 등록을 요구할 수 있습니다.
> 무료 한도(10GB) 내에서는 요금이 청구되지 않지만, 회사 규정상 카드 등록이
> 어려우면 미리 알려주세요. (서류 저장 방식을 D1에 담는 대안으로 바꿀 수 있습니다.)

핵심은 **최초 1회 배포**입니다. 한 번 해두면 진짜 주소(`...workers.dev`)가 생기고,
이후 제가 코드를 수정해 GitHub에 올리면 **자동으로 다시 배포**됩니다.

전체 순서: ① Cloudflare 가입 → ② D1 만들기 → ③ 저장소에 ID 넣기 →
④ R2 만들기 → ⑤ D1에 표 만들기(스키마) → ⑥ 저장소 연결해 배포.

각 단계는 모두 화면에서 클릭/붙여넣기로 됩니다. 막히면 그 단계에서 멈추고
저에게 알려주세요 — 같이 해결합니다.

---

## ① Cloudflare 가입

1. 브라우저에서 **dash.cloudflare.com** 접속 → 이메일로 회원가입/로그인.

## ② D1 데이터베이스 만들기 (기록 저장소)

1. 왼쪽 메뉴 **Storage & Databases → D1 SQL Database** (또는 검색창에 "D1").
2. **Create** → 이름에 `entry-pass-db` 입력 → 생성.
3. 생성된 데이터베이스 화면에서 **Database ID** 값을 복사해 둡니다. (다음 단계에 사용)

## ③ 저장소(wrangler.toml)에 ID 넣기

1. 브라우저에서 GitHub 저장소 **github.com/dudo011/entry-pass** 접속
   (배포에 연결할 브랜치: **claude/session-1-7a2uxy** — 화면 좌상단에서 이 브랜치 선택).
2. 파일 목록에서 **`wrangler.toml`** 클릭 → 오른쪽 위 **연필(Edit)** 아이콘.
3. `REPLACE_WITH_YOUR_D1_DATABASE_ID` 를 ②에서 복사한 **Database ID** 로 교체.
4. **Commit changes** (브랜치는 그대로 `claude/session-1-7a2uxy` 로 커밋).

## ④ R2 버킷 만들기 (서류 파일 저장소)

1. 대시보드 왼쪽 **R2 Object Storage** → 필요 시 R2 활성화(카드 등록 요구될 수 있음).
2. **Create bucket** → 이름 `entry-pass-docs` → 생성.

## ⑤ D1에 표 만들기 (스키마 적용)

1. 대시보드 **Storage & Databases → D1 → `entry-pass-db`** 클릭.
2. 상단 **Console**(콘솔) 탭 선택.
3. GitHub 저장소의 **`schema.sql`** 파일을 열어 **전체 내용을 복사**.
4. 콘솔 입력창에 붙여넣고 **실행(Execute)**.
   - 표(users/sessions/requests/documents)와 기본 직원 계정이 생성됩니다.
   - 한 번에 실행이 안 되면, 문장 단위(각 `CREATE ...;`, `INSERT ...;`)로
     나눠서 실행해도 됩니다.

## ⑥ 저장소 연결해서 배포

1. 대시보드 **Workers & Pages → Create → Import a repository**
   (또는 "Connect to Git" / "Workers Builds").
2. **GitHub 연결/승인** → 저장소 **dudo011/entry-pass** 선택.
3. 배포할 브랜치를 **claude/session-1-7a2uxy** 로 지정.
4. 설정 화면에 `wrangler.toml` 이 자동 인식됩니다(빌드/배포 명령 기본값 그대로).
   - Deploy command 기본값: `npx wrangler deploy`
5. **Deploy(배포)** 클릭 → 잠시 후 배포 완료.
6. 완료 화면 또는 **Workers & Pages → entry-pass** 에서
   **`https://entry-pass.<서브도메인>.workers.dev`** 주소를 확인.

## ⑦ 확인

1. 그 주소를 폰/PC 브라우저에서 열기.
2. **자재센터 직원 → `admin` / `admin1234`** 로그인 → 관리 화면이 뜨면 성공.
3. **운전기사 → 회원가입** 으로 기사 계정을 만들어 출입 신청까지 체험.

> ⚠️ 배포 후 반드시 기본 직원 비밀번호(`admin1234`, `staff1234`)를 변경하세요.
> 변경은 D1 콘솔에서 하며, 필요할 때 방법을 안내해 드립니다.

---

## 이후 수정 반영 (피드백 루프)

⑥에서 GitHub 저장소를 연결해두면, 제가 화면·문구·안전수칙 등을 수정해
`claude/session-1-7a2uxy` 브랜치에 올리는 순간 Cloudflare가 **자동으로 다시 배포**합니다.
즉, 여러분은 배포판을 쓰며 피드백만 주시면 되고, 반영은 자동으로 이어집니다.

## (선택) 더 간단한 시도 — Deploy 버튼

경우에 따라 아래 버튼으로 자원(D1·R2) 생성과 배포가 한 번에 될 수 있습니다.
잘 되면 ⑤ 스키마 적용(콘솔 붙여넣기)만 따로 해주면 됩니다. 안 되면 위 ①~⑥으로 진행하세요.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dudo011/entry-pass)
