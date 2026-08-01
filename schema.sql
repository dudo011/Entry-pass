-- 자재센터 출입 앱 D1 스키마
-- 적용: wrangler d1 execute entry-pass-db --file schema.sql        (원격)
--       wrangler d1 execute entry-pass-db --local --file schema.sql (로컬 개발)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,                    -- 'driver' | 'staff'
  staff_role TEXT,                       -- 'admin' | 'approver' (직원)
  login_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  company TEXT DEFAULT '',
  default_vehicle_number TEXT DEFAULT '',
  default_vehicle_type_id TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  pass_no TEXT NOT NULL,
  driver_user_id TEXT NOT NULL,
  vehicle_type_id TEXT NOT NULL,
  vehicle_type_name TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  company TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  visit_at TEXT DEFAULT '',
  agreed_required INTEGER DEFAULT 0,
  agreed_other INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reject_reason TEXT DEFAULT '',
  reviewed_by TEXT DEFAULT '',
  reviewed_at TEXT DEFAULT '',
  history TEXT DEFAULT '[]',                -- JSON 배열
  created_at TEXT NOT NULL,
  retain_until TEXT NOT NULL               -- 보존 만료일 (신청일 + 보존기간)
);

-- 출입 신청에 첨부된 서류. 파일(이미지/PDF)을 base64 로 D1에 직접 저장 (R2 미사용).
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  label TEXT NOT NULL,
  content_type TEXT DEFAULT 'application/octet-stream',
  data TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  retain_until TEXT NOT NULL
);

-- 직원이 사번으로 직접 가입 신청하고 관리자가 승인하기 전까지 보관하는 테이블.
CREATE TABLE IF NOT EXISTS staff_applications (
  id TEXT PRIMARY KEY,
  employee_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by TEXT DEFAULT '',
  reviewed_at TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- 퇴직·전보 등으로 사용 중지된 직원 계정. 계정과 이력은 보존하고 로그인만 차단한다.
CREATE TABLE IF NOT EXISTS staff_disabled (
  user_id TEXT PRIMARY KEY,
  disabled_at TEXT NOT NULL,
  disabled_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_driver ON requests(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_documents_request ON documents(request_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_app_status ON staff_applications(status);

-- 기존 운영 접근을 유지하기 위한 초기 직원 계정입니다.
-- 직원별 계정 전환을 완료한 뒤 공개 기본 계정은 다음 보안 단계에서 제거합니다.
INSERT OR IGNORE INTO users (id, role, staff_role, login_id, name, salt, hash, created_at) VALUES
  ('seed-admin', 'staff', 'admin', 'admin', '관리자',
   'b06ceafd1991e424115f83c6e75f010a',
   '63a225a2e5fdd5b600b08f7bc5ca3b7615e3ac77ade9a256e078f140f8d27012',
   '2024-01-01T00:00:00.000Z'),
  ('seed-staff', 'staff', 'approver', 'staff', '승인담당자',
   '85d87261b675e88c11fc9a6028674cb0',
   '9cfdfe4e74898a92b07b3932bae0028220d6d5cb42ae164d1778187a6f4526fe',
   '2024-01-01T00:00:00.000Z');
