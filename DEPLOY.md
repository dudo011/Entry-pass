# Cloudflare 배포 가이드 (D1 + Workers)

이 앱은 Cloudflare 한 곳에서 **DB + 서류 저장(D1) · 서버(Workers)** 를 모두
무료 티어로 운영하도록 구성되어 있습니다. 서류는 D1에 저장하므로 **R2·결제카드가
필요 없습니다.**

## 0. 준비물

- Cloudflare 계정 (무료)
- Node.js 18+ 설치된 PC
- 저장소 클론 후 의존성 설치:
  ```bash
  npm install
  ```

## 1. Cloudflare 로그인

```bash
npx wrangler login
```
브라우저가 열리면 계정 인증을 완료합니다.

## 2. D1 데이터베이스 생성

```bash
npx wrangler d1 create entry-pass-db
```
출력에 나오는 `database_id` 값을 복사해서 **`wrangler.toml`** 의
`REPLACE_WITH_YOUR_D1_DATABASE_ID` 자리에 붙여넣습니다.

## 3. 스키마 적용 (테이블 생성 + 기본 직원 계정)

```bash
# 운영(원격) DB에 적용
npm run db:init

# 로컬 개발용으로 적용하려면
npm run db:init:local
```

기본 직원 계정이 함께 생성됩니다:
- 관리자: `admin` / `admin1234`
- 승인담당: `staff` / `staff1234`

> ⚠️ **배포 후 반드시 비밀번호를 변경**하세요. (아래 "비밀번호 변경" 참고)

## 4. 로컬에서 실행/확인

```bash
npm run dev
```
`http://localhost:8787` 에서 D1이 로컬 에뮬레이션으로 동작합니다.

## 5. 배포

```bash
npm run deploy
```
배포되면 `https://entry-pass.<your-subdomain>.workers.dev` 주소가 출력됩니다.
이 주소(또는 연결한 커스텀 도메인)를 기사·직원에게 링크/QR로 공유하면 됩니다.

---

## 비밀번호 변경 / 계정 관리

현재 MVP에는 비밀번호 변경 화면이 없어, D1에 직접 반영합니다.
새 해시는 아래로 생성합니다(로컬 Node):

```bash
node -e 'const c=require("crypto");const s=c.randomBytes(16);const h=c.pbkdf2Sync(process.argv[1],s,100000,32,"sha256");console.log("salt=",s.toString("hex"));console.log("hash=",h.toString("hex"))' "새비밀번호"
```

출력된 salt/hash로 계정을 갱신:

```bash
npx wrangler d1 execute entry-pass-db --command \
  "UPDATE users SET salt='<salt>', hash='<hash>' WHERE login_id='admin'"
```

새 직원 계정 추가도 같은 방식으로 `INSERT` 하면 됩니다
(`role='staff'`, `staff_role='admin'|'approver'`).

> 필요하시면 관리자용 **계정 관리/비밀번호 변경 화면**을 앱에 추가해 드릴 수 있습니다.

## 데이터 보존 (3년+)

- 앱은 신청 기록·서류를 **자동 삭제하지 않습니다.** 각 레코드에 `retain_until`
  (신청일 + 3년)이 저장됩니다. 보존기간은 `src/worker.js` 의 `RETENTION_YEARS` 로 조정.
- **기록·서류(D1)**: Cloudflare가 관리형으로 보관. 서류는 D1에 함께 저장됩니다.
  정기적으로 `npx wrangler d1 export entry-pass-db --output backup.sql` 로
  백업하면 기록과 서류가 함께 백업됩니다.
- 관리자 화면의 **CSV 내보내기** 로 기록 목록을 별도 보관할 수 있습니다.

## 비용 관련

- D1 무료: 약 5GB 저장 / 일일 읽기·쓰기 한도 (서류 자동 압축 시 수천~1만여 건 3년 보관 가능)
- Workers 무료: 하루 10만 요청
- 서류는 D1에 저장하므로 **R2·결제카드 불필요**. 용량이 부족해지면 R2(10GB)로 전환 가능.
- 무료 한도를 넘지 않으면 비용이 청구되지 않습니다. 사용량은 Cloudflare
  대시보드에서 확인할 수 있습니다.

> 공공기관/공기업은 외부 클라우드(해외 리전) 사용에 대한 내부 규정
> (망분리·데이터 국내보관 등)을 먼저 확인하세요. 제약이 있으면 사내 서버
> 자체 설치(별도 구성)로 전환할 수 있습니다.
