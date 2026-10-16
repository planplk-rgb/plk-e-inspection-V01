/* ตัวเชื่อมหลังบ้าน
 *  RemoteApi : Google Apps Script จริง (กำหนด API_URL ใน config.js)
 *  DemoApi   : โหมดทดลอง — รันโค้ดหลังบ้านตัวเดียวกัน (backend.js) กับ service จำลอง เก็บข้อมูลในเบราว์เซอร์ */
(function () {
  const TOKEN_KEY = 'plkInsp.token';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  class RemoteApi {
    constructor(url) { this.url = url; this.demo = false; this.token = store.get(TOKEN_KEY); }
    async call(action, payload = {}) {
      let res;
      try {
        const r = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action, token: this.token }, payload)) });
        res = await r.json();
      } catch (e) { throw new Error('เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่'); }
      if (res.auth === false) { this.setToken(null); const err = new Error(res.error); err.auth = false; throw err; }
      if (!res.ok) throw new Error(res.error || 'เกิดข้อผิดพลาด');
      return res;
    }
    setToken(t) { this.token = t; t ? store.set(TOKEN_KEY, t) : store.del(TOKEN_KEY); }
    async login(username, password) { const r = await this.call('login', { username, password }); this.setToken(r.token); return r; }
    async logout() { try { await this.call('logout'); } catch (e) {} this.setToken(null); }
  }

  /* ---------------- โหมดทดลอง ---------------- */
  const DEMO_KEY = 'plkInsp.demo.v1';
  const DEMO_PW = 'demo1234';

  class DemoApi {
    constructor() {
      this.demo = true;
      this.maxDemoBytes = 1.5 * 1024 * 1024;
      const gas = GasMock.createGas({
        load: () => { try { return JSON.parse(store.get(DEMO_KEY)); } catch (e) { return null; } },
        save: st => { if (!this._muted) store.set(DEMO_KEY, JSON.stringify(st)); },
        fileUrl: blob => 'data:' + (blob.mime || 'application/octet-stream') + ';base64,' + Utilities.base64Encode(blob.bytes),
      });
      Object.assign(window, gas.services);
      this.gas = gas;
      if (!gas.state.sheets.Users) this.seed();
      this.token = store.get(TOKEN_KEY + '.demo');
      if (this.token) gas.cache['s:' + this.token] = this.token.split(':')[0];
    }
    seed() {
      this._muted = true;
      setup();
      upsertUser_({ username: 'admin', name: 'ผู้ดูแลระบบ (ทดลอง)', role: 'admin', unit: 'กลุ่มงานพัฒนายุทธศาสตร์ฯ', active: 'TRUE' }, 'admin1234');
      DISTRICTS.forEach((d, i) => upsertUser_({ username: DISTRICT_USERS[i], name: 'คปสอ.' + d + ' (ทดลอง)', role: 'district', unit: d, active: 'TRUE' }, DEMO_PW));
      [['sso01', 'ผู้นิเทศ (ทดลอง) 1', 'กลุ่มงานพัฒนายุทธศาสตร์ฯ'], ['sso02', 'ผู้นิเทศ (ทดลอง) 2', 'กลุ่มงานควบคุมโรคไม่ติดต่อ']]
        .forEach(([u, n, g]) => upsertUser_({ username: u, name: n, role: 'supervisor', unit: g, active: 'TRUE' }, DEMO_PW));
      // ข้อมูลตัวอย่าง (สมมติ)
      const vs = table_('Visits');
      const more = [['นครไทย', '2026-11-05', 'online'], ['ชาติตระการ', '2026-11-12', 'onsite'], ['วัดโบสถ์', '2026-11-19', 'onsite'],
                    ['พรหมพิราม', '2026-11-26', 'onsite'], ['บางกระทุ่ม', '2026-12-03', 'onsite'], ['เนินมะปราง', '2026-12-10', 'onsite'],
                    ['เมืองพิษณุโลก', '2026-12-17', 'onsite']];
      more.forEach(([d, date, mode]) => vs.push({ id: uid_(), district: d, round: '1', date, start: '09:00', end: '12:00', mode,
        venue: mode === 'online' ? 'ประชุมออนไลน์' : 'ห้องประชุม โรงพยาบาล' + d.replace('เมืองพิษณุโลก', 'พุทธชินราช พิษณุโลก'), rpst: '',
        link: mode === 'online' ? 'https://meet.google.com/' : '', agenda: '[]', briefing: '(ตัวอย่าง) ข้อมูลที่ผู้นิเทศควรทราบ',
        status: 'planned', updatedBy: 'demo', updatedAt: now_() }));
      write_('Visits', vs);
      const br = vs.find(v => v.district === 'บางระกำ');
      write_('People', [
        { id: uid_(), visitId: br.id, kind: 'team', name: '(ตัวอย่าง) หัวหน้าคณะผู้นิเทศ', position: 'รองนายแพทย์สาธารณสุขจังหวัด', unit: 'สสจ.พิษณุโลก', role: 'หัวหน้าคณะ', phone: '', email: '', topic: 'ภาพรวม', createdBy: 'sso01', createdAt: now_() },
        { id: uid_(), visitId: br.id, kind: 'team', name: '(ตัวอย่าง) ผู้นิเทศ NCD', position: 'นักวิชาการสาธารณสุขชำนาญการ', unit: 'กลุ่มงานควบคุมโรคไม่ติดต่อ', role: 'ผู้นิเทศ', phone: '', email: '', topic: 'NCD', createdBy: 'sso02', createdAt: now_() },
        { id: uid_(), visitId: br.id, kind: 'exec', name: '(ตัวอย่าง) ผู้อำนวยการโรงพยาบาล', position: 'ผู้อำนวยการโรงพยาบาลบางระกำ', unit: '', role: '', phone: '', email: '', topic: '', createdBy: 'bangrakam', createdAt: now_() },
        { id: uid_(), visitId: br.id, kind: 'coord', name: '(ตัวอย่าง) ผู้ประสานงานหลัก', position: 'นักวิชาการสาธารณสุข', unit: 'สสอ.บางระกำ', role: '', phone: '08x-xxx-xxxx', email: '', topic: '', createdBy: 'bangrakam', createdAt: now_() },
      ]);
      write_('Files', [{ id: uid_(), visitId: br.id, side: 'supervisor', category: 'ไฟล์นำเสนอ', title: '(ตัวอย่าง) สรุปผลงาน คปสอ.บางระกำ', url: 'https://example.com/',
        driveId: '', mime: 'link', size: 0, unit: 'กลุ่มงานพัฒนายุทธศาสตร์ฯ', createdBy: 'sso01', createdAt: now_() }]);
      write_('News', [{ id: uid_(), title: 'ยินดีต้อนรับสู่โหมดทดลอง PLK e-Inspection', body: 'ข้อมูลทั้งหมดในโหมดนี้เป็นข้อมูลสมมติ เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ลองเข้าระบบด้วยบัญชีต่าง ๆ เพื่อดูมุมมองของแต่ละฝ่าย',
        pinned: 'TRUE', createdBy: 'admin', createdAt: now_() }]);
      this._muted = false;
      store.set(DEMO_KEY, JSON.stringify(this.gas.state));
    }
    reset() { store.del(DEMO_KEY); store.del(TOKEN_KEY + '.demo'); location.reload(); }
    raw(action, p) { return JSON.parse(doPost({ postData: { contents: JSON.stringify(Object.assign({ action, token: this.token }, p)) } }).getContent()); }
    async call(action, payload = {}) {
      if (action === 'uploadFile' && payload.data && payload.data.length * 0.75 > this.maxDemoBytes)
        throw new Error('โหมดทดลองรับไฟล์ไม่เกิน 1.5 MB (ระบบจริงรับได้ตามที่ตั้งค่า)');
      await new Promise(r => setTimeout(r, 80));
      const res = this.raw(action, payload);
      if (res.auth === false) { this.setToken(null); const err = new Error(res.error); err.auth = false; throw err; }
      if (!res.ok) throw new Error(res.error);
      return res;
    }
    setToken(t) { this.token = t; t ? store.set(TOKEN_KEY + '.demo', t) : store.del(TOKEN_KEY + '.demo'); }
    async login(username, password) {
      const r = this.raw('login', { username, password });
      if (!r.ok) throw new Error(r.error);
      // ใน demo ให้ token จำชื่อผู้ใช้ไว้ เพื่อให้รีเฟรชหน้าแล้วยังอยู่ในระบบ
      const t = String(username).trim().toLowerCase() + ':' + r.token;
      this.gas.cache['s:' + t] = String(username).trim().toLowerCase();
      this.setToken(t); return r;
    }
    async logout() { this.setToken(null); }
  }

  window.createApi = function () {
    const url = (window.APP_CONFIG && window.APP_CONFIG.API_URL || '').trim();
    return (/[?&]demo=1/.test(location.search) || !url) ? new DemoApi() : new RemoteApi(url);
  };
})();
