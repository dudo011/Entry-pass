/**
 * 자재센터 출입 사전승인 앱 - 백엔드
 *
 * 기능:
 *  - 기사/직원 로그인 (비밀번호 scrypt 해시, 토큰 세션)
 *  - 기사: 기본정보 저장(반복 출입 대비), 출입 신청, 내 신청 이력
 *  - 직원: 권한(approver/admin)에 따라 승인/반려, 전체 이력, CSV 내보내기
 *  - 출입/승인 기록은 삭제하지 않고 서버에 보관 (기본 3년 이상 보존)
 *
 * 저장: data/db.json (신청/사용자/세션), uploads/ (첨부 서류)
 * ※ 운영 배포 시에는 영구 볼륨 또는 DB(PostgreSQL 등)로 전환 권장 (README 참고)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const vehicleTypes = require('./data/vehicleTypes');

const app = express();
const PORT = process.env.PORT || 3000;

// 기록 보존 기간 (년). 이 기간 내 기록은 어떤 경우에도 삭제 대상에서 제외됩니다.
const RETENTION_YEARS = Number(process.env.RETENTION_YEARS || 3);

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- 파일 기반 저장소 ------------------------------------------------------
function readDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    db.requests ||= [];
    db.users ||= [];
    db.sessions ||= {};
    return db;
  } catch {
    return { requests: [], users: [], sessions: {} };
  }
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// --- 비밀번호 해시 (내장 crypto scrypt, 외부 의존성 없음) ------------------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const newId = (n = 6) => crypto.randomBytes(n).toString('hex');

// --- 최초 실행 시 직원 계정 시드 ------------------------------------------
function seedStaff() {
  const db = readDB();
  if (!db.users.some((u) => u.role === 'staff')) {
    const mk = (loginId, password, name, staffRole) => {
      const { salt, hash } = hashPassword(password);
      return {
        id: newId(), role: 'staff', staffRole, loginId, name, salt, hash,
        createdAt: new Date().toISOString(),
      };
    };
    db.users.push(mk('admin', 'admin1234', '관리자', 'admin'));
    db.users.push(mk('staff', 'staff1234', '승인담당자', 'approver'));
    writeDB(db);
    console.log('▶ 기본 직원 계정 생성: admin/admin1234 (관리자), staff/staff1234 (승인담당자)');
  }
}
if (!fs.existsSync(DB_PATH)) writeDB({ requests: [], users: [], sessions: {} });
seedStaff();

// --- 업로드 설정 ----------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).replace(/[^.\w]/g, '').slice(0, 10);
    cb(null, `${Date.now()}-${newId(8)}${safeExt}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 10 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- 인증 미들웨어 --------------------------------------------------------
function currentUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const db = readDB();
  const sess = db.sessions[token];
  if (!sess) return null;
  const user = db.users.find((u) => u.id === sess.userId);
  return user ? { ...user, token } : null;
}
function requireAuth(role) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (role && user.role !== role) return res.status(403).json({ error: '권한이 없습니다.' });
    req.user = user;
    next();
  };
}
function requireStaff(minRole) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (user.role !== 'staff') return res.status(403).json({ error: '직원 전용 기능입니다.' });
    if (minRole === 'admin' && user.staffRole !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    req.user = user;
    next();
  };
}
const publicUser = (u) => ({
  id: u.id, role: u.role, staffRole: u.staffRole, loginId: u.loginId, name: u.name,
  phone: u.phone, company: u.company, defaultVehicleNumber: u.defaultVehicleNumber,
  defaultVehicleTypeId: u.defaultVehicleTypeId,
});

// ==========================================================================
// 인증 API
// ==========================================================================

// 기사 회원가입 (직원 계정은 관리자 시드/생성)
app.post('/api/auth/register', (req, res) => {
  const b = req.body || {};
  if (!b.loginId || !b.password || !b.name || !b.phone) {
    return res.status(400).json({ error: '아이디·비밀번호·이름·연락처는 필수입니다.' });
  }
  if (String(b.password).length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  }
  const db = readDB();
  if (db.users.some((u) => u.loginId === b.loginId)) {
    return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  }
  const { salt, hash } = hashPassword(b.password);
  const user = {
    id: newId(), role: 'driver', loginId: b.loginId, name: b.name, salt, hash,
    phone: b.phone, company: b.company || '',
    defaultVehicleNumber: b.defaultVehicleNumber || '',
    defaultVehicleTypeId: b.defaultVehicleTypeId || '',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  const token = newId(24);
  db.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
  writeDB(db);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const b = req.body || {};
  const db = readDB();
  const user = db.users.find((u) => u.loginId === b.loginId);
  if (!user || !verifyPassword(b.password || '', user.salt, user.hash)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  const token = newId(24);
  db.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
  writeDB(db);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', requireAuth(), (req, res) => {
  const db = readDB();
  delete db.sessions[req.user.token];
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// 기사 기본정보 수정 (반복 출입 시 재사용)
app.put('/api/auth/profile', requireAuth('driver'), (req, res) => {
  const b = req.body || {};
  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);
  ['name', 'phone', 'company', 'defaultVehicleNumber', 'defaultVehicleTypeId'].forEach((k) => {
    if (b[k] !== undefined) user[k] = b[k];
  });
  writeDB(db);
  res.json({ user: publicUser(user) });
});

// ==========================================================================
// 차량 유형 / 출입 신청 API
// ==========================================================================
app.get('/api/vehicle-types', (req, res) => res.json(vehicleTypes));

// 출입 신청 생성 (기사)
app.post('/api/requests', requireAuth('driver'), upload.array('documents', 10), (req, res) => {
  const b = req.body || {};
  const vType = vehicleTypes.find((v) => v.id === b.vehicleTypeId);
  if (!vType) return res.status(400).json({ error: '유효하지 않은 차량 유형입니다.' });
  if (!b.driverName || !b.phone || !b.vehicleNumber) {
    return res.status(400).json({ error: '기사명, 연락처, 차량번호는 필수입니다.' });
  }
  if (String(b.agreedRequired) !== 'true') {
    return res.status(400).json({ error: '필수 안전수칙 동의가 필요합니다.' });
  }
  const files = (req.files || []).map((f) => ({
    label: f.originalname, url: `/uploads/${f.filename}`, size: f.size,
  }));
  const now = new Date();
  const retainUntil = new Date(now);
  retainUntil.setFullYear(retainUntil.getFullYear() + RETENTION_YEARS);

  const db = readDB();
  const request = {
    id: newId(), passNo: 'EP-' + Date.now().toString().slice(-8),
    driverUserId: req.user.id,
    vehicleTypeId: vType.id, vehicleTypeName: vType.name,
    driverName: b.driverName, phone: b.phone, vehicleNumber: b.vehicleNumber,
    company: b.company || '', purpose: b.purpose || '', visitAt: b.visitAt || '',
    agreedRequired: true, agreedOther: String(b.agreedOther) === 'true',
    documents: files,
    status: 'pending', rejectReason: '', reviewedBy: '', reviewedAt: '',
    createdAt: now.toISOString(),
    retainUntil: retainUntil.toISOString(),
    history: [{ at: now.toISOString(), action: 'created', by: req.user.name }],
  };
  db.requests.unshift(request);
  writeDB(db);
  res.status(201).json(request);
});

// 내 신청 이력 (기사)
app.get('/api/my/requests', requireAuth('driver'), (req, res) => {
  const db = readDB();
  res.json(db.requests.filter((r) => r.driverUserId === req.user.id));
});

// 전체 이력 CSV 내보내기 (관리자 전용) — 장기 보관/감사용
// ※ '/:id' 라우트보다 먼저 선언해야 'export.csv'가 id로 해석되지 않습니다.
app.get('/api/requests/export.csv', requireStaff('admin'), (req, res) => {
  const db = readDB();
  const cols = ['passNo', 'createdAt', 'vehicleTypeName', 'driverName', 'phone',
    'vehicleNumber', 'company', 'purpose', 'visitAt', 'status', 'reviewedBy',
    'reviewedAt', 'rejectReason', 'retainUntil'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = db.requests.map((r) => cols.map((c) => esc(r[c])).join(','));
  const csv = '﻿' + cols.join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="entry-records.csv"');
  res.send(csv);
});

// 단건 조회 (기사 본인 또는 직원)
app.get('/api/requests/:id', requireAuth(), (req, res) => {
  const db = readDB();
  const r = db.requests.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
  if (req.user.role === 'driver' && r.driverUserId !== req.user.id) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }
  res.json(r);
});

// 신청 목록 (직원: approver 이상)
app.get('/api/requests', requireStaff(), (req, res) => {
  const db = readDB();
  const { status } = req.query;
  let list = db.requests;
  if (status) list = list.filter((r) => r.status === status);
  res.json(list);
});

function review(req, res, status) {
  const db = readDB();
  const r = db.requests.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
  const at = new Date().toISOString();
  r.status = status;
  r.reviewedBy = req.user.name;
  r.reviewedAt = at;
  r.rejectReason = status === 'rejected' ? ((req.body && req.body.reason) || '') : '';
  r.history = r.history || [];
  r.history.push({ at, action: status, by: req.user.name, reason: r.rejectReason });
  writeDB(db);
  res.json(r);
}
app.post('/api/requests/:id/approve', requireStaff(), (req, res) => review(req, res, 'approved'));
app.post('/api/requests/:id/reject', requireStaff(), (req, res) => review(req, res, 'rejected'));

// 보관 정책 안내
app.get('/api/retention', (req, res) => {
  res.json({ retentionYears: RETENTION_YEARS });
});

app.listen(PORT, () => {
  console.log(`자재센터 출입 앱: http://localhost:${PORT}  (기록 보존 ${RETENTION_YEARS}년)`);
});
