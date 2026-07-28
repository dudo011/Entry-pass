/**
 * 자재센터 출입 사전승인 앱 - 백엔드 (MVP)
 *
 * 흐름: 기사가 출입 신청을 생성 → 직원이 목록에서 확인 후 승인/반려.
 * 데이터는 data/db.json 파일에, 업로드 서류는 uploads/ 폴더에 저장됩니다.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const vehicleTypes = require('./data/vehicleTypes');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- 아주 단순한 파일 기반 저장소 (MVP용) ---------------------------------
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { requests: [] };
  }
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
if (!fs.existsSync(DB_PATH)) writeDB({ requests: [] });

// --- 업로드 설정 ----------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const safeExt = path.extname(file.originalname).replace(/[^.\w]/g, '').slice(0, 10);
    cb(null, `${Date.now()}-${id}${safeExt}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 파일당 10MB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- API ------------------------------------------------------------------

// 차량 유형별 안전수칙/동선/서류 설정
app.get('/api/vehicle-types', (req, res) => {
  res.json(vehicleTypes);
});

// 출입 신청 생성 (기사)
app.post('/api/requests', upload.array('documents', 10), (req, res) => {
  const b = req.body || {};
  const vType = vehicleTypes.find((v) => v.id === b.vehicleTypeId);
  if (!vType) {
    return res.status(400).json({ error: '유효하지 않은 차량 유형입니다.' });
  }
  if (!b.driverName || !b.phone || !b.vehicleNumber) {
    return res.status(400).json({ error: '기사명, 연락처, 차량번호는 필수입니다.' });
  }
  if (String(b.agreedRules) !== 'true') {
    return res.status(400).json({ error: '안전수칙 동의가 필요합니다.' });
  }

  const files = (req.files || []).map((f) => ({
    label: f.originalname,
    url: `/uploads/${f.filename}`,
    size: f.size,
  }));

  const db = readDB();
  const request = {
    id: crypto.randomBytes(6).toString('hex'),
    passNo: 'EP-' + Date.now().toString().slice(-8),
    vehicleTypeId: vType.id,
    vehicleTypeName: vType.name,
    driverName: b.driverName,
    phone: b.phone,
    vehicleNumber: b.vehicleNumber,
    company: b.company || '',
    purpose: b.purpose || '',
    visitAt: b.visitAt || '',
    agreedRules: true,
    documents: files,
    status: 'pending', // pending | approved | rejected
    rejectReason: '',
    reviewedBy: '',
    createdAt: new Date().toISOString(),
    reviewedAt: '',
  };
  db.requests.unshift(request);
  writeDB(db);
  res.status(201).json(request);
});

// 출입 신청 목록 (직원) - status 로 필터
app.get('/api/requests', (req, res) => {
  const db = readDB();
  const { status } = req.query;
  let list = db.requests;
  if (status) list = list.filter((r) => r.status === status);
  res.json(list);
});

// 단건 조회 (기사가 본인 신청 상태 확인)
app.get('/api/requests/:id', (req, res) => {
  const db = readDB();
  const r = db.requests.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
  res.json(r);
});

// 승인 (직원)
app.post('/api/requests/:id/approve', (req, res) => {
  const db = readDB();
  const r = db.requests.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
  r.status = 'approved';
  r.reviewedBy = (req.body && req.body.reviewer) || '자재센터 직원';
  r.reviewedAt = new Date().toISOString();
  r.rejectReason = '';
  writeDB(db);
  res.json(r);
});

// 반려 (직원)
app.post('/api/requests/:id/reject', (req, res) => {
  const db = readDB();
  const r = db.requests.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
  r.status = 'rejected';
  r.reviewedBy = (req.body && req.body.reviewer) || '자재센터 직원';
  r.reviewedAt = new Date().toISOString();
  r.rejectReason = (req.body && req.body.reason) || '';
  writeDB(db);
  res.json(r);
});

app.listen(PORT, () => {
  console.log(`자재센터 출입 앱이 http://localhost:${PORT} 에서 실행 중입니다.`);
});
