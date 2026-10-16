/**
 * PLK e-Inspection — ระบบตรวจเยี่ยมและนิเทศงานระดับจังหวัด (คปสอ.) จังหวัดพิษณุโลก
 * หลังบ้าน Google Apps Script · กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข สสจ.พิษณุโลก
 *
 * ติดตั้ง (ดูรายละเอียดใน README.md):
 *   1) สร้าง Google Sheets ใหม่ → ส่วนขยาย → Apps Script → วางไฟล์นี้
 *   2) รัน setup() ครั้งเดียว → รหัสผ่าน admin อยู่ใน "บันทึกการดำเนินการ"
 *   3) ทำให้ใช้งานได้ → เว็บแอป → ดำเนินการในฐานะ: ฉัน · ผู้มีสิทธิ์เข้าถึง: ทุกคน → นำ URL (/exec) ไปใส่ docs/config.js
 *
 * ข้อมูลอยู่ในชีตของไฟล์นี้ · ไฟล์แนบอยู่ในโฟลเดอร์ Google Drive "PLK e-Inspection – ไฟล์แนบ"
 * รหัสผ่านเก็บแบบเข้ารหัสทางเดียว (SHA-256 + salt วนซ้ำ)
 */

const APP_NAME = 'PLK e-Inspection';
const DISTRICTS = ['เมืองพิษณุโลก', 'นครไทย', 'ชาติตระการ', 'บางระกำ', 'บางกระทุ่ม', 'พรหมพิราม', 'วัดโบสถ์', 'วังทอง', 'เนินมะปราง'];
const DISTRICT_USERS = ['mueang', 'nakhonthai', 'chattrakan', 'bangrakam', 'bangkrathum', 'phromphiram', 'watbot', 'wangthong', 'noenmaprang'];
const ROLES = ['admin', 'supervisor', 'district'];
const PEOPLE_KINDS = ['team', 'exec', 'coord'];          // ผู้ร่วมนิเทศ / ผู้บริหารอำเภอ / ผู้ประสานงานหลัก
const FILE_CATS = ['ไฟล์นำเสนอ', 'เอกสารประกอบ', 'รูปภาพกิจกรรม', 'อื่น ๆ'];
const FINDING_TYPES = ['ข้อค้นพบ', 'ข้อเสนอแนะ', 'ข้อสั่งการ'];
const VISIT_STATUS = ['planned', 'confirmed', 'done', 'postponed', 'cancelled'];
const SESSION_TTL = 6 * 60 * 60;
const HASH_ROUNDS = 300;
const MAX_FAIL = 5;

const SCHEMA = {
  Users:    ['username', 'name', 'role', 'unit', 'phone', 'salt', 'hash', 'active', 'updatedAt'],
  Visits:   ['id', 'district', 'round', 'date', 'start', 'end', 'mode', 'venue', 'rpst', 'link', 'agenda', 'briefing', 'status', 'updatedBy', 'updatedAt'],
  People:   ['id', 'visitId', 'kind', 'name', 'position', 'unit', 'role', 'phone', 'email', 'topic', 'createdBy', 'createdAt'],
  Sites:    ['visitId', 'venueName', 'address', 'mapUrl', 'rpstName', 'rpstAddress', 'rpstMapUrl', 'travel', 'notes', 'updatedBy', 'updatedAt'],
  Files:    ['id', 'visitId', 'side', 'category', 'title', 'url', 'driveId', 'mime', 'size', 'unit', 'createdBy', 'createdAt'],
  Findings: ['id', 'visitId', 'type', 'topic', 'text', 'owner', 'dueDate', 'status', 'response', 'respondedBy', 'respondedAt', 'createdBy', 'createdAt'],
  News:     ['id', 'title', 'body', 'pinned', 'createdBy', 'createdAt'],
  Settings: ['key', 'value'],
  Log:      ['time', 'user', 'action', 'detail'],
};

/* ============================== ติดตั้ง ============================== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SCHEMA).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange('A:Z').setNumberFormat('@');
      sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  const st = settings_();
  if (!st.folderId) {
    const folder = DriveApp.createFolder(APP_NAME + ' – ไฟล์แนบ');
    st.folderId = folder.getId();
  }
  Object.assign(st, Object.assign({ year: '2570', title: 'การตรวจเยี่ยมและนิเทศงานเครือข่ายบริการสุขภาพระดับอำเภอ',
    maxUploadMB: '20', contact: 'กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข สสจ.พิษณุโลก' }, st));
  saveSettingsRows_(st);
  if (!table_('Visits').length) seedVisits_();
  if (!table_('Users').some(u => u.role === 'admin')) {
    const pw = randomPassword_();
    upsertUser_({ username: 'admin', name: 'ผู้ดูแลระบบ', role: 'admin', unit: 'กลุ่มงานพัฒนายุทธศาสตร์ฯ', active: 'TRUE' }, pw);
    Logger.log('สร้างผู้ดูแลระบบแล้ว  ชื่อผู้ใช้: admin   รหัสผ่าน: ' + pw + '   (เปลี่ยนรหัสผ่านหลังเข้าระบบครั้งแรก)');
  } else {
    Logger.log('มีผู้ดูแลระบบอยู่แล้ว — ไม่ได้สร้างใหม่');
  }
  Logger.log('โฟลเดอร์ไฟล์แนบ: https://drive.google.com/drive/folders/' + st.folderId);
}

/** กำหนดการตั้งต้น ปีงบประมาณ 2570 (ตามหนังสือแจ้งการนิเทศงาน ต.ค. 2569) — แก้ไขได้ในหน้าเว็บ */
function seedVisits_() {
  const ag = (rows) => JSON.stringify(rows.map(r => ({ time: r[0], activity: r[1] })));
  const present = 'คปสอ. นำเสนอภาพรวม (ไม่เกิน 30 นาที): ข้อมูลทั่วไปและสถานการณ์สุขภาพ · ผลการดำเนินงาน ปีงบประมาณ 2569 · ทิศทางการพัฒนา ปีงบประมาณ 2570 รวมถึงปัญหาและความต้องการสนับสนุนจากจังหวัด';
  const team = 'ผู้บริหาร และคณะผู้นิเทศจังหวัดฯ นำเสนอประเด็นปัญหาสำคัญของอำเภอ พร้อมแนวทางการแก้ไขปัญหา และแนวทางการดำเนินงานตามนโยบายกระทรวงสาธารณสุขและตัวชี้วัดสำคัญ';
  const rows = [
    { district: 'บางระกำ', date: '2026-10-16', start: '13:30', end: '16:30', venue: 'ห้องประชุม โรงพยาบาลบางระกำ (รอยืนยัน)',
      agenda: ag([['12:30–13:30', 'ทีมผู้บริหาร และคณะผู้นิเทศ ออกเดินทางจาก สสจ.พิษณุโลก'], ['13:30–14:30', present],
                  ['14:30–15:30', team], ['15:30–16:30', 'แลกเปลี่ยนข้อคิดเห็น ข้อเสนอแนะ พร้อมข้อสั่งการ / ปิดการประชุม']]) },
    { district: 'วังทอง', date: '2026-10-27', start: '08:30', end: '12:00', venue: 'ห้องประชุม โรงพยาบาลวังทอง (รอยืนยัน)',
      agenda: ag([['08:00–08:30', 'ทีมผู้บริหาร และคณะผู้นิเทศ ออกเดินทางจาก สสจ.พิษณุโลก'], ['08:30–09:30', present],
                  ['09:30–11:00', team], ['11:00–12:00', 'แลกเปลี่ยนข้อคิดเห็น ข้อเสนอแนะ พร้อมข้อสั่งการ / ปิดการประชุม'],
                  ['12:00–13:00', 'พักรับประทานอาหารกลางวัน']]) },
  ];
  write_('Visits', rows.map(r => Object.assign({ id: uid_(), round: '1', mode: 'onsite', rpst: '', link: '', status: 'confirmed',
    briefing: 'โปรดเตรียมข้อมูลประเด็นปัญหาสำคัญของอำเภอตามกลุ่มงานที่รับผิดชอบ และแนบไฟล์นำเสนอก่อนวันนิเทศอย่างน้อย 2 วัน',
    updatedBy: 'seed', updatedAt: now_() }, r)));
}

function resetAdminPassword() {
  const pw = randomPassword_();
  const u = table_('Users').find(x => x.username === 'admin');
  upsertUser_(Object.assign({}, u || { username: 'admin', name: 'ผู้ดูแลระบบ', role: 'admin', unit: '' }, { active: 'TRUE' }), pw);
  Logger.log('รหัสผ่านใหม่ของ admin: ' + pw);
}

/* ============================== API ============================== */

function doGet() { return json_({ ok: true, service: 'plk-e-inspection', time: now_() }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' }); }
  try {
    const action = String(req.action || '');
    if (action === 'login') return json_(login_(req));
    if (action === 'publicDash') return json_(Object.assign({ ok: true }, publicDash_()));
    const me = session_(req.token);
    if (!me) return json_({ ok: false, error: 'กรุณาเข้าสู่ระบบใหม่', auth: false });
    const H = {
      bootstrap: bootstrap_, logout: logout_, changePassword: changePassword_,
      savePerson: savePerson_, deletePerson: deletePerson_, saveSite: saveSite_,
      uploadFile: uploadFile_, addLink: addLink_, deleteFile: deleteFile_,
      saveFinding: saveFinding_, deleteFinding: deleteFinding_, respondFinding: respondFinding_,
      saveVisit: admin_(saveVisit_), deleteVisit: admin_(deleteVisit_),
      saveNews: admin_(saveNews_), deleteNews: admin_(deleteNews_),
      saveUser: admin_(saveUser_), deleteUser: admin_(deleteUser_), createDistrictUsers: admin_(createDistrictUsers_),
      saveSettings: admin_(saveSettings_), getLog: admin_(getLog_),
    };
    if (!H[action]) return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง ' + action });
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try { return json_(Object.assign({ ok: true }, H[action](req, me))); }
    finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------- เข้าสู่ระบบ ---------- */

function login_(req) {
  const username = String(req.username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache(), failKey = 'fail:' + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAIL) return { ok: false, error: 'ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ 15 นาที' };
  const u = table_('Users').find(x => x.username === username && isOn_(x.active));
  if (!u || hash_(u.salt, String(req.password || '')) !== u.hash) {
    cache.put(failKey, String(fails + 1), 900);
    Utilities.sleep(400);
    return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  cache.put('s:' + token, username, SESSION_TTL);
  log_(username, 'login', '');
  return { ok: true, token, user: publicUser_(u) };
}

function session_(token) {
  if (!token) return null;
  const username = CacheService.getScriptCache().get('s:' + token);
  if (!username) return null;
  const u = table_('Users').find(x => x.username === username && isOn_(x.active));
  return u ? Object.assign(publicUser_(u), { token }) : null;
}

function logout_(req, me) { CacheService.getScriptCache().remove('s:' + me.token); return {}; }

function changePassword_(req, me) {
  const u = table_('Users').find(x => x.username === me.username);
  if (hash_(u.salt, String(req.oldPassword || '')) !== u.hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  checkPassword_(req.newPassword);
  upsertUser_(u, req.newPassword);
  log_(me.username, 'changePassword', '');
  return {};
}

function bootstrap_(req, me) {
  const st = settings_();
  const out = {
    user: me, districts: DISTRICTS, fileCats: FILE_CATS, findingTypes: FINDING_TYPES,
    settings: { year: st.year, title: st.title, maxUploadMB: Number(st.maxUploadMB) || 20, contact: st.contact || '' },
    visits: table_('Visits').map(parseVisit_).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    people: table_('People'), sites: table_('Sites'),
    files: table_('Files').map(f => Object.assign(f, { size: Number(f.size) || 0 })),
    findings: table_('Findings'),
    news: table_('News').map(n => Object.assign(n, { pinned: isOn_(n.pinned) }))
      .sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt)),
  };
  if (me.role === 'admin') out.users = table_('Users').map(publicUser_);
  return out;
}

/** แดชบอร์ดสาธารณะ (ไม่ต้องเข้าสู่ระบบ) — ส่งเฉพาะภาพรวม ไม่มีชื่อบุคคล เบอร์โทร ไฟล์ ลิงก์ประชุม หรือเนื้อหาข้อเสนอแนะ */
function publicDash_() {
  const st = settings_();
  const people = table_('People'), sites = table_('Sites'), files = table_('Files'), findings = table_('Findings');
  const visits = table_('Visits').map(v => {
    const has = (arr, f) => arr.some(x => x.visitId === v.id && f(x));
    const s = sites.find(x => x.visitId === v.id) || {};
    const fs = findings.filter(f => f.visitId === v.id);
    return {
      id: v.id, district: v.district, round: v.round, date: v.date, start: v.start, end: v.end, mode: v.mode,
      venue: s.venueName || v.venue, status: v.status,
      ready: [has(people, p => p.kind === 'team'), has(files, f => f.side === 'supervisor'), has(people, p => p.kind === 'exec'),
              !!(s.venueName || s.address), has(people, p => p.kind === 'coord'), has(files, f => f.side === 'district')],
      fTotal: fs.length, fDone: fs.filter(f => f.status === 'done').length,
    };
  }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return {
    public: true, districts: DISTRICTS,
    settings: { year: st.year, title: st.title, contact: st.contact || '' },
    visits,
    news: table_('News').map(n => ({ id: n.id, title: n.title, body: n.body, pinned: isOn_(n.pinned), createdAt: n.createdAt }))
      .sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt)),
  };
}

/* ---------- สิทธิ์ ---------- */

function visit_(id) {
  const v = table_('Visits').find(x => x.id === id);
  if (!v) throw new Error('ไม่พบกำหนดการนิเทศ');
  return v;
}
/** side: 'supervisor' (ฝั่งผู้นิเทศ) | 'district' (ฝั่งผู้รับนิเทศ) */
function canSide_(me, v, side) {
  if (me.role === 'admin') return;
  if (side === 'supervisor' && me.role === 'supervisor') return;
  if (side === 'district' && me.role === 'district' && me.unit === v.district) return;
  throw new Error(side === 'district' ? 'แก้ไขได้เฉพาะ คปสอ. ของตนเอง' : 'เฉพาะทีมผู้นิเทศ');
}
function canOwn_(me, row) {
  if (me.role === 'admin' || row.createdBy === me.username) return;
  throw new Error('แก้ไขหรือลบได้เฉพาะรายการที่ตนเองบันทึก');
}

/* ---------- ผู้ร่วมนิเทศ / ผู้บริหารอำเภอ / ผู้ประสานงานหลัก ---------- */

function savePerson_(req, me) {
  const p = req.person || {};
  const kind = String(p.kind);
  if (PEOPLE_KINDS.indexOf(kind) < 0) throw new Error('ประเภทบุคคลไม่ถูกต้อง');
  const v = visit_(p.visitId);
  canSide_(me, v, kind === 'team' ? 'supervisor' : 'district');
  const name = String(p.name || '').trim();
  if (!name) throw new Error('กรุณาระบุชื่อ-สกุล');
  const rows = table_('People');
  let row = p.id ? rows.find(r => r.id === p.id) : null;
  if (row) canOwn_(me, row);
  else { row = { id: uid_(), visitId: v.id, kind, createdBy: me.username, createdAt: now_() }; rows.push(row); }
  ['position', 'unit', 'role', 'phone', 'email', 'topic'].forEach(k => row[k] = clip_(p[k], 300));
  row.name = clip_(name, 200);
  if (kind === 'team' && !row.unit && me.role === 'supervisor') row.unit = me.unit;
  write_('People', rows);
  log_(me.username, 'savePerson', v.district + ' ' + kind + ' ' + name);
  return { person: row };
}

function deletePerson_(req, me) {
  const rows = table_('People');
  const row = rows.find(r => r.id === req.id);
  if (!row) throw new Error('ไม่พบรายการ');
  canSide_(me, visit_(row.visitId), row.kind === 'team' ? 'supervisor' : 'district');
  if (row.kind === 'team') canOwn_(me, row);
  write_('People', rows.filter(r => r.id !== req.id));
  log_(me.username, 'deletePerson', row.name);
  return {};
}

/* ---------- สถานที่รับการตรวจเยี่ยม ---------- */

function saveSite_(req, me) {
  const s = req.site || {};
  const v = visit_(s.visitId);
  canSide_(me, v, 'district');
  const rows = table_('Sites');
  let row = rows.find(r => r.visitId === v.id);
  if (!row) { row = { visitId: v.id }; rows.push(row); }
  ['venueName', 'address', 'rpstName', 'rpstAddress', 'travel', 'notes'].forEach(k => row[k] = clip_(s[k], 1000));
  ['mapUrl', 'rpstMapUrl'].forEach(k => row[k] = safeUrl_(s[k]));
  Object.assign(row, { updatedBy: me.username, updatedAt: now_() });
  write_('Sites', rows);
  log_(me.username, 'saveSite', v.district);
  return { site: row };
}

/* ---------- ไฟล์ ---------- */

function sideFor_(me, req) {
  if (me.role === 'admin') return req.side === 'district' ? 'district' : 'supervisor';
  return me.role === 'district' ? 'district' : 'supervisor';
}

function uploadFile_(req, me) {
  const v = visit_(req.visitId);
  const side = sideFor_(me, req);
  canSide_(me, v, side);
  const st = settings_();
  const bytes = Utilities.base64Decode(String(req.data || ''));
  const maxMB = Number(st.maxUploadMB) || 20;
  if (!bytes.length) throw new Error('ไฟล์ว่าง');
  if (bytes.length > maxMB * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน ' + maxMB + ' MB — กรุณาแนบเป็นลิงก์แทน');
  const name = clip_(req.name || 'file', 200).replace(/[\\/:*?"<>|]/g, '_');
  const folder = subFolder_(st.folderId, v.district);
  const file = folder.createFile(Utilities.newBlob(bytes, String(req.mime || 'application/octet-stream'), name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* โดเมนอาจไม่อนุญาต */ }
  const row = { id: uid_(), visitId: v.id, side, category: cat_(req.category), title: clip_(req.title || name, 200),
                url: file.getUrl(), driveId: file.getId(), mime: String(req.mime || ''), size: bytes.length,
                unit: me.unit, createdBy: me.username, createdAt: now_() };
  const rows = table_('Files'); rows.push(row); write_('Files', rows);
  log_(me.username, 'uploadFile', v.district + ' ' + row.title);
  return { file: row };
}

function addLink_(req, me) {
  const v = visit_(req.visitId);
  const side = sideFor_(me, req);
  canSide_(me, v, side);
  const url = safeUrl_(req.url);
  if (!url) throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://');
  const row = { id: uid_(), visitId: v.id, side, category: cat_(req.category), title: clip_(req.title || url, 200),
                url, driveId: '', mime: 'link', size: 0, unit: me.unit, createdBy: me.username, createdAt: now_() };
  const rows = table_('Files'); rows.push(row); write_('Files', rows);
  log_(me.username, 'addLink', v.district + ' ' + row.title);
  return { file: row };
}

function deleteFile_(req, me) {
  const rows = table_('Files');
  const row = rows.find(r => r.id === req.id);
  if (!row) throw new Error('ไม่พบไฟล์');
  canSide_(me, visit_(row.visitId), row.side);
  canOwn_(me, row);
  if (row.driveId) { try { DriveApp.getFileById(row.driveId).setTrashed(true); } catch (e) {} }
  write_('Files', rows.filter(r => r.id !== req.id));
  log_(me.username, 'deleteFile', row.title);
  return {};
}

function subFolder_(rootId, name) {
  const root = DriveApp.getFolderById(rootId);
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
function cat_(c) { return FILE_CATS.indexOf(c) >= 0 ? c : FILE_CATS[0]; }

/* ---------- ผลการนิเทศ / ข้อเสนอแนะ / ข้อสั่งการ ---------- */

function saveFinding_(req, me) {
  const f = req.finding || {};
  const v = visit_(f.visitId);
  canSide_(me, v, 'supervisor');
  const text = clip_(f.text, 3000).trim();
  if (!text) throw new Error('กรุณาระบุรายละเอียด');
  const rows = table_('Findings');
  let row = f.id ? rows.find(r => r.id === f.id) : null;
  if (row) canOwn_(me, row);
  else { row = { id: uid_(), visitId: v.id, status: 'open', response: '', createdBy: me.username, createdAt: now_() }; rows.push(row); }
  Object.assign(row, { type: FINDING_TYPES.indexOf(f.type) >= 0 ? f.type : FINDING_TYPES[0], topic: clip_(f.topic, 200),
                       text, owner: clip_(f.owner || me.unit, 200), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(f.dueDate || '') ? f.dueDate : '' });
  write_('Findings', rows);
  log_(me.username, 'saveFinding', v.district + ' ' + row.type);
  return { finding: row };
}

function deleteFinding_(req, me) {
  const rows = table_('Findings');
  const row = rows.find(r => r.id === req.id);
  if (!row) throw new Error('ไม่พบรายการ');
  canSide_(me, visit_(row.visitId), 'supervisor');
  canOwn_(me, row);
  write_('Findings', rows.filter(r => r.id !== req.id));
  log_(me.username, 'deleteFinding', row.type);
  return {};
}

function respondFinding_(req, me) {
  const rows = table_('Findings');
  const row = rows.find(r => r.id === req.id);
  if (!row) throw new Error('ไม่พบรายการ');
  canSide_(me, visit_(row.visitId), 'district');
  if (['open', 'inprogress', 'done'].indexOf(req.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  Object.assign(row, { status: req.status, response: clip_(req.response, 3000), respondedBy: me.username, respondedAt: now_() });
  write_('Findings', rows);
  log_(me.username, 'respondFinding', row.type + ' → ' + req.status);
  return { finding: row };
}

/* ---------- ผู้ดูแลระบบ ---------- */

function admin_(fn) { return (req, me) => { if (me.role !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ'); return fn(req, me); }; }

function saveVisit_(req, me) {
  const v = req.visit || {};
  if (DISTRICTS.indexOf(v.district) < 0) throw new Error('กรุณาเลือกอำเภอ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) throw new Error('กรุณาระบุวันที่');
  const agenda = (Array.isArray(v.agenda) ? v.agenda : []).filter(a => a && (a.time || a.activity))
    .map(a => ({ time: clip_(a.time, 40), activity: clip_(a.activity, 600) }));
  const rows = table_('Visits');
  let row = v.id ? rows.find(r => r.id === v.id) : null;
  if (!row) { row = { id: uid_() }; rows.push(row); }
  Object.assign(row, {
    district: v.district, round: clip_(v.round || '1', 20), date: v.date,
    start: /^\d{1,2}:\d{2}$/.test(v.start || '') ? v.start : '', end: /^\d{1,2}:\d{2}$/.test(v.end || '') ? v.end : '',
    mode: ['onsite', 'online', 'hybrid'].indexOf(v.mode) >= 0 ? v.mode : 'onsite',
    venue: clip_(v.venue, 300), rpst: clip_(v.rpst, 500), link: safeUrl_(v.link), agenda: JSON.stringify(agenda),
    briefing: clip_(v.briefing, 4000), status: VISIT_STATUS.indexOf(v.status) >= 0 ? v.status : 'planned',
    updatedBy: me.username, updatedAt: now_(),
  });
  write_('Visits', rows);
  log_(me.username, 'saveVisit', row.district + ' ' + row.date);
  return { visit: parseVisit_(row) };
}

function deleteVisit_(req, me) {
  const v = visit_(req.id);
  const files = table_('Files');
  files.filter(f => f.visitId === v.id && f.driveId).forEach(f => { try { DriveApp.getFileById(f.driveId).setTrashed(true); } catch (e) {} });
  write_('Files', files.filter(f => f.visitId !== v.id));
  ['People', 'Findings'].forEach(t => write_(t, table_(t).filter(r => r.visitId !== v.id)));
  write_('Sites', table_('Sites').filter(r => r.visitId !== v.id));
  write_('Visits', table_('Visits').filter(r => r.id !== v.id));
  log_(me.username, 'deleteVisit', v.district + ' ' + v.date);
  return {};
}

function saveNews_(req, me) {
  const n = req.news || {};
  const title = clip_(n.title, 200).trim();
  if (!title) throw new Error('กรุณาระบุหัวข้อ');
  const rows = table_('News');
  let row = n.id ? rows.find(r => r.id === n.id) : null;
  if (!row) { row = { id: uid_(), createdBy: me.username, createdAt: now_() }; rows.push(row); }
  Object.assign(row, { title, body: clip_(n.body, 3000), pinned: n.pinned ? 'TRUE' : 'FALSE' });
  write_('News', rows);
  log_(me.username, 'saveNews', title);
  return {};
}
function deleteNews_(req, me) { write_('News', table_('News').filter(r => r.id !== req.id)); log_(me.username, 'deleteNews', ''); return {}; }

function saveUser_(req, me) {
  const u = req.user || {};
  const username = String(u.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (3–30 ตัว)');
  const role = ROLES.indexOf(u.role) >= 0 ? u.role : 'supervisor';
  if (role === 'district' && DISTRICTS.indexOf(u.unit) < 0) throw new Error('บัญชี คปสอ. ต้องเลือกอำเภอ');
  const existing = table_('Users').find(x => x.username === username);
  if (!existing && !req.password) throw new Error('ผู้ใช้ใหม่ต้องกำหนดรหัสผ่าน');
  if (req.password) checkPassword_(req.password);
  const admins = table_('Users').filter(x => x.role === 'admin' && isOn_(x.active));
  if (existing && existing.role === 'admin' && (role !== 'admin' || u.active === false) && admins.length <= 1)
    throw new Error('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');
  upsertUser_({ username, name: clip_(u.name || username, 200), role, unit: clip_(u.unit, 200), phone: clip_(u.phone, 50),
                active: u.active === false ? 'FALSE' : 'TRUE' }, req.password || null);
  log_(me.username, 'saveUser', username);
  return { users: table_('Users').map(publicUser_) };
}

function deleteUser_(req, me) {
  if (req.username === me.username) throw new Error('ลบบัญชีของตนเองไม่ได้');
  write_('Users', table_('Users').filter(u => u.username !== req.username));
  log_(me.username, 'deleteUser', req.username);
  return { users: table_('Users').map(publicUser_) };
}

/** สร้างบัญชี คปสอ. ครบ 9 อำเภอในครั้งเดียว (ข้ามอำเภอที่มีบัญชีแล้ว) — คืนรหัสผ่านให้เห็นครั้งเดียว */
function createDistrictUsers_(req, me) {
  const users = table_('Users');
  const created = [];
  DISTRICTS.forEach((d, i) => {
    if (users.some(u => u.role === 'district' && u.unit === d) || users.some(u => u.username === DISTRICT_USERS[i])) return;
    const pw = randomPassword_();
    upsertUser_({ username: DISTRICT_USERS[i], name: 'คปสอ.' + d, role: 'district', unit: d, phone: '', active: 'TRUE' }, pw);
    created.push({ district: d, username: DISTRICT_USERS[i], password: pw });
  });
  log_(me.username, 'createDistrictUsers', created.length + ' บัญชี');
  return { created, users: table_('Users').map(publicUser_) };
}

function saveSettings_(req, me) {
  const st = settings_(), s = req.settings || {};
  ['year', 'title', 'contact'].forEach(k => { if (s[k] !== undefined) st[k] = clip_(s[k], 300); });
  if (s.maxUploadMB !== undefined) st.maxUploadMB = String(Math.min(Math.max(Number(s.maxUploadMB) || 20, 1), 30));
  saveSettingsRows_(st);
  log_(me.username, 'saveSettings', '');
  return {};
}

function getLog_(req) { return { log: table_('Log').slice(-500).reverse() }; }

/* ============================== ตัวช่วย ============================== */

function parseVisit_(r) {
  let agenda = [];
  try { agenda = JSON.parse(r.agenda || '[]'); } catch (e) {}
  return Object.assign({}, r, { agenda });
}
function settings_() { const o = {}; table_('Settings').forEach(r => o[r.key] = r.value); return o; }
function saveSettingsRows_(st) { write_('Settings', Object.keys(st).map(k => ({ key: k, value: st[k] }))); }
function publicUser_(u) { return { username: u.username, name: u.name, role: u.role, unit: u.unit || '', phone: u.phone || '', active: isOn_(u.active) }; }
function isOn_(v) { return String(v).toUpperCase() !== 'FALSE'; }
function clip_(v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n); }
function safeUrl_(v) { const s = String(v || '').trim(); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s.slice(0, 1000) : ''; }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

function upsertUser_(u, password) {
  const rows = table_('Users');
  let row = rows.find(r => r.username === u.username);
  if (!row) { row = { username: u.username }; rows.push(row); }
  Object.assign(row, { name: u.name, role: u.role, unit: u.unit || '', phone: u.phone || row.phone || '', active: u.active, updatedAt: now_() });
  if (password) { row.salt = Utilities.getUuid(); row.hash = hash_(row.salt, password); }
  write_('Users', rows);
}

function checkPassword_(pw) { if (String(pw || '').length < 8) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'); }

function hash_(salt, pw) {
  let h = salt + '|' + pw;
  for (let i = 0; i < HASH_ROUNDS; i++)
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  return h;
}

function randomPassword_() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}

function table_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  const head = v[0];
  return v.slice(1).filter(r => r.some(x => x !== '')).map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i]); return o; });
}

/** เขียนทั้งตาราง (ข้อความล้วน กันสูตร: ค่าที่ขึ้นต้นด้วย = + - @ จะถูกเติม ' นำหน้า) */
function write_(name, rows) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  const head = SCHEMA[name];
  const cell = v => { const s = (v === undefined || v === null) ? '' : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const data = [head].concat(rows.map(r => head.map(h => cell(r[h]))));
  sh.getRange('A:Z').setNumberFormat('@');
  if (sh.getLastRow() > 0) sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), head.length)).clearContent();
  sh.getRange(1, 1, data.length, head.length).setValues(data);
}

function log_(user, action, detail) {
  SpreadsheetApp.getActive().getSheetByName('Log').appendRow([now_(), user, action, String(detail).slice(0, 300)]);
}
function now_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
