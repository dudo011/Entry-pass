-- 자재센터 출입 앱 D1 스키마
-- 적용: wrangler d1 execute entry-pass-db --file schema.sql        (원격)
--       wrangler d1 execute entry-pass-db --local --file schema.sql (로컬 개발)

-- 기존 차량기사 계정과 직원 계정 호환용 users.
-- 신규 계약업체 계정은 company_accounts를 사용하고, 업체별로 여러 차량을 등록합니다.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,                    -- legacy 'driver' | 'staff'
  staff_role TEXT,                       -- 'admin' | 'approver' (직원)
  login_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  company TEXT DEFAULT '',
  default_vehicle_number TEXT DEFAULT '',
  default_vehicle_type_id TEXT DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 업체별 공동계정. 초기 시범운영에서는 가입 즉시 active 처리합니다.
CREATE TABLE IF NOT EXISTS company_accounts (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL,
  login_id_norm TEXT NOT NULL UNIQUE,    -- 영문 대소문자 구분 없는 중복검사용
  company_name TEXT NOT NULL,
  business_no TEXT NOT NULL,
  business_no_norm TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL DEFAULT '', -- 레거시 호환용. 현재 회원가입에서는 수집하지 않음
  phone TEXT NOT NULL,                   -- 업체 연락처
  contract_type_id TEXT NOT NULL DEFAULT '', -- construction | transport | delivery | scrap | pcbs
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'active', -- 향후 pending/active/rejected 승인제로 확장 가능
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_sessions (
  token TEXT PRIMARY KEY,
  company_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 한 업체 계정에서 여러 차량과 기본 운전자를 관리합니다.
CREATE TABLE IF NOT EXISTS company_vehicles (
  id TEXT PRIMARY KEY,
  company_account_id TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  default_vehicle_type_id TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_account_id, vehicle_number)
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  pass_no TEXT NOT NULL,
  driver_user_id TEXT NOT NULL,           -- legacy 호환. 신규 신청은 company_account_id와 같은 값 저장
  vehicle_type_id TEXT NOT NULL,
  vehicle_type_name TEXT NOT NULL,
  driver_name TEXT NOT NULL,              -- 해당 신청 당시 실제 운전자 스냅샷
  phone TEXT NOT NULL,                    -- 해당 신청 당시 실제 운전자 연락처 스냅샷
  vehicle_number TEXT NOT NULL,
  company TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  visit_at TEXT DEFAULT '',
  agreed_required INTEGER DEFAULT 0,
  agreed_other INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- legacy UI: pending | approved | rejected
  workflow_status TEXT NOT NULL DEFAULT 'pending', -- pending | safety_pending | photo_pending | completed | rejected
  reject_reason TEXT DEFAULT '',
  reviewed_by TEXT DEFAULT '',
  reviewed_at TEXT DEFAULT '',
  history TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  retain_until TEXT NOT NULL,
  company_account_id TEXT DEFAULT '',
  company_vehicle_id TEXT DEFAULT '',
  is_temporary_vehicle INTEGER NOT NULL DEFAULT 0,
  driver_access_token TEXT DEFAULT '',
  driver_access_expires_at TEXT DEFAULT '',
  safety_confirmed_at TEXT DEFAULT '',
  photo_uploaded_at TEXT DEFAULT '',
  completed_at TEXT DEFAULT ''
);

-- 신청에 첨부된 사전 작업서류와 기사 현장사진을 함께 보관합니다.
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
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT DEFAULT '',
  reviewed_at TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_disabled (
  user_id TEXT PRIMARY KEY,
  disabled_at TEXT NOT NULL,
  disabled_by TEXT NOT NULL
);

-- 기존 차량기사 계정 관리 이력(레거시 호환).
CREATE TABLE IF NOT EXISTS driver_account_events (
  id TEXT PRIMARY KEY,
  driver_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_driver ON requests(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_requests_company_account ON requests(company_account_id);
CREATE INDEX IF NOT EXISTS idx_requests_workflow ON requests(workflow_status);
CREATE INDEX IF NOT EXISTS idx_documents_request ON documents(request_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_company_sessions_account ON company_sessions(company_account_id);
CREATE INDEX IF NOT EXISTS idx_company_vehicles_account ON company_vehicles(company_account_id);
CREATE INDEX IF NOT EXISTS idx_staff_app_status ON staff_applications(status);
CREATE INDEX IF NOT EXISTS idx_driver_account_events_user ON driver_account_events(driver_user_id);

-- 직원 계정은 앱에서 본인이 가입 신청하고, 기존 관리자가 승인하여 생성합니다.
-- 업체 계정은 현재 시범운영 단계에서 별도 승인 없이 즉시 활성화됩니다.
-- 운영 비밀번호/토큰 등 비밀값은 저장소에 두지 않습니다.
