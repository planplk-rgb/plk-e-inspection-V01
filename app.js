/* PLK e-Inspection — หน้าเว็บ */
(function () {
  'use strict';
  const api = window.createApi();
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  let S = null;
  const ui = { view: null, district: null, month: null, editVisit: null, editUser: null, editNews: null, created: null };

  const ROLE = { admin: 'ผู้ดูแลระบบ', supervisor: 'ผู้นิเทศ (สสจ.)', district: 'ผู้รับนิเทศ (คปสอ.)' };
  const STATUS = { planned: ['วางแผน', 's-plan'], confirmed: ['ยืนยันกำหนดการ', 's-conf'], done: ['นิเทศแล้ว', 's-done'],
                   postponed: ['เลื่อน', 's-post'], cancelled: ['ยกเลิก', 's-cancel'] };
  const MODE = { onsite: 'ลงพื้นที่ (Onsite)', online: 'ออนไลน์', hybrid: 'ผสม (Onsite + Online)' };
  const FSTATUS = { open: ['ยังไม่ดำเนินการ', 's-cancel'], inprogress: ['กำลังดำเนินการ', 's-post'], done: ['ดำเนินการแล้ว', 's-done'] };
  const GROUPS = ['กลุ่มงานพัฒนายุทธศาสตร์ฯ', 'กลุ่มงานส่งเสริมสุขภาพฯ', 'กลุ่มงานควบคุมโรคติดต่อ', 'กลุ่มงานควบคุมโรคไม่ติดต่อ',
    'กลุ่มงานอนามัยสิ่งแวดล้อมฯ', 'กลุ่มงานคุ้มครองผู้บริโภคฯ', 'กลุ่มงานทันตสาธารณสุข', 'กลุ่มงานประกันสุขภาพ', 'กลุ่มงานพัฒนาคุณภาพฯ',
    'กลุ่มงานทรัพยากรบุคคล', 'กลุ่มงานกฎหมาย', 'กลุ่มงานบริหารงานทั่วไป', 'กลุ่มงานภูมิปัญญาฯ', 'กลุ่มงานสุขภาพดิจิทัล', 'กลุ่มงานแพทย์แผนไทยฯ'];
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  /* ---------------- ตัวช่วย ---------------- */
  const pd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => ymd(new Date());
  const dLong = s => { const d = pd(s); return d ? d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '–'; };
  const dShort = s => { const d = pd(s); return d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '–'; };
  const tRange = v => v.start ? (v.start + (v.end ? '–' + v.end : '') + ' น.') : '';
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 0 ? Math.ceil(n / 1024) + ' KB' : '';
  const statusChip = s => { const x = STATUS[s] || STATUS.planned; return `<span class="chip ${x[1]}">${x[0]}</span>`; };
  const me = () => S.user;
  const isAdmin = () => me().role === 'admin';
  const canSup = () => ['admin', 'supervisor'].includes(me().role);
  const canDist = v => isAdmin() || (me().role === 'district' && me().unit === v.district);
  const own = row => isAdmin() || row.createdBy === me().username;
  const visitsOf = d => S.visits.filter(v => v.district === d);
  const peopleOf = (v, k) => S.people.filter(p => p.visitId === v.id && p.kind === k);
  const filesOf = (v, side) => S.files.filter(f => f.visitId === v.id && f.side === side);
  const siteOf = v => S.sites.find(s => s.visitId === v.id) || {};
  const findingsOf = v => S.findings.filter(f => f.visitId === v.id);
  const nextVisit = d => visitsOf(d).filter(v => v.date >= today() && v.status !== 'cancelled')[0] || null;
  const mainVisit = d => nextVisit(d) || visitsOf(d).slice(-1)[0] || null;

  function readiness(v) {
    const s = siteOf(v);
    return [
      { side: 'sup', label: 'ทีมผู้ร่วมนิเทศ', done: peopleOf(v, 'team').length > 0 },
      { side: 'sup', label: 'ไฟล์ สสจ.', done: filesOf(v, 'supervisor').length > 0 },
      { side: 'dist', label: 'ผู้บริหารอำเภอ', done: peopleOf(v, 'exec').length > 0 },
      { side: 'dist', label: 'สถานที่', done: !!(s.venueName || s.address) },
      { side: 'dist', label: 'ผู้ประสานงานหลัก', done: peopleOf(v, 'coord').length > 0 },
      { side: 'dist', label: 'ไฟล์อำเภอ', done: filesOf(v, 'district').length > 0 },
    ];
  }
  const readyPct = v => { const r = readiness(v); return Math.round(r.filter(x => x.done).length / r.length * 100); };

  function toast(msg, kind = 'ok') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5000 : 2500);
  }
  async function run(fn, okMsg) {
    document.body.classList.add('busy');
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { if (e.auth === false) { S = null; renderLogin(e.message); } else toast(e.message, 'err'); throw e; }
    finally { document.body.classList.remove('busy'); }
  }
  async function reload(keepScroll = true) {
    const y = window.scrollY;
    S = await run(() => api.call('bootstrap'));
    render();
    if (keepScroll) window.scrollTo(0, y);
  }
  const act = async (action, payload, msg) => { await run(() => api.call(action, payload), msg); await reload(); };

  /* ---------------- เข้าสู่ระบบ ---------------- */
  function renderLogin(msg) {
    app.innerHTML = `
    <div class="login-wrap">
      <div class="login-side">
        <div class="logo-big">PLK<br><b>e-Inspection</b></div>
        <p>ระบบตรวจเยี่ยมและนิเทศงาน<br>เครือข่ายบริการสุขภาพระดับอำเภอ (คปสอ.)<br>จังหวัดพิษณุโลก</p>
        <small>กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข<br>สำนักงานสาธารณสุขจังหวัดพิษณุโลก</small>
      </div>
      <div class="card login-card">
        <h1>เข้าสู่ระบบ</h1>
        ${api.demo ? `<div class="note">โหมดทดลอง — ข้อมูลสมมติ เก็บในเบราว์เซอร์นี้เท่านั้น<br>
          ผู้ดูแลระบบ <b>admin</b> / <b>admin1234</b> · ผู้นิเทศ <b>sso01</b> / <b>demo1234</b><br>
          คปสอ. เช่น <b>bangrakam</b>, <b>wangthong</b> / <b>demo1234</b></div>` : ''}
        <form data-form="login">
          <label>ชื่อผู้ใช้<input name="u" autocomplete="username" required autofocus></label>
          <label>รหัสผ่าน<input name="p" type="password" autocomplete="current-password" required></label>
          ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
          <button class="btn primary block">เข้าสู่ระบบ</button>
        </form>
        <p class="muted small">ยังไม่มีบัญชีหรือลืมรหัสผ่าน ติดต่อผู้ดูแลระบบ กลุ่มงานพัฒนายุทธศาสตร์ฯ</p>
      </div>
    </div>`;
  }

  /* ---------------- โครงหน้า ---------------- */
  function tabs() {
    const r = me().role, t = [['dash', 'แดชบอร์ด']];
    if (r === 'district') t.push(['mine', 'ข้อมูลรับการนิเทศ']);
    if (r !== 'district') t.push(['brief', 'สำหรับผู้นิเทศ']);
    if (r === 'admin') t.push(['schedule', 'จัดการกำหนดการ'], ['users', 'ผู้ใช้งาน'], ['news', 'ประกาศ'], ['settings', 'ตั้งค่า']);
    t.push(['account', 'บัญชี']);
    return t;
  }
  function render() {
    if (!S) return renderLogin();
    const t = tabs();
    if (!ui.view || (ui.view !== 'district' && !t.some(x => x[0] === ui.view))) ui.view = 'dash';
    app.innerHTML = `
      <header class="top">
        <div class="brand" data-act="go" data-view="dash"><div class="logo">PLK</div>
          <div><b>PLK e-Inspection</b><div class="sub">ตรวจเยี่ยมและนิเทศงาน คปสอ. · ปีงบประมาณ ${esc(S.settings.year)}</div></div></div>
        <div class="right">
          ${api.demo ? '<span class="chip s-post">โหมดทดลอง</span>' : ''}
          <span class="who"><b>${esc(me().name)}</b><small>${esc(ROLE[me().role])}${me().unit ? ' · ' + esc(me().unit) : ''}</small></span>
          <button class="btn ghost" data-act="logout">ออกจากระบบ</button>
        </div>
      </header>
      <nav class="tabs">${t.map(([k, l]) => `<button data-act="go" data-view="${k}" class="${k === ui.view || (ui.view === 'district' && k === (me().role === 'district' && ui.district === me().unit ? 'mine' : 'dash')) ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <main id="main"></main>
      <footer class="foot">${esc(S.settings.contact || 'กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข สสจ.พิษณุโลก')}</footer>`;
    const m = $('#main');
    ({ dash: vDash, mine: () => vDistrict(m, me().unit), brief: vBrief, district: () => vDistrict(m, ui.district),
       schedule: vSchedule, users: vUsers, news: vNews, settings: vSettings, account: vAccount })[ui.view](m);
  }

  /* ---------------- แดชบอร์ด ---------------- */
  function vDash(m) {
    const vs = S.visits.filter(v => v.status !== 'cancelled');
    const done = vs.filter(v => v.status === 'done').length;
    const up = vs.filter(v => v.date >= today()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const nx = up[0];
    const avg = vs.length ? Math.round(vs.reduce((a, v) => a + readyPct(v), 0) / vs.length) : 0;
    const openF = S.findings.filter(f => f.status !== 'done').length;
    m.innerHTML = `
      ${S.news.length ? `<section class="news">${S.news.slice(0, 3).map(n => `<div class="news-item ${n.pinned ? 'pin' : ''}">
        <b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}<small>${esc(n.createdAt.slice(0, 10))}</small></div>`).join('')}</section>` : ''}
      <div class="stats">
        <div class="stat"><b>${vs.length}</b><span>กำหนดการนิเทศ</span></div>
        <div class="stat"><b>${done}/${vs.length}</b><span>นิเทศแล้ว</span></div>
        <div class="stat wide"><b>${nx ? esc(nx.district) : '–'}</b><span>${nx ? 'ครั้งถัดไป · ' + esc(dShort(nx.date)) + ' ' + esc(tRange(nx)) : 'ไม่มีกำหนดการที่จะถึง'}</span></div>
        <div class="stat"><b>${avg}%</b><span>ความพร้อมข้อมูลเฉลี่ย</span></div>
        <div class="stat"><b>${openF}</b><span>ข้อเสนอแนะ/ข้อสั่งการที่ยังไม่ปิด</span></div>
      </div>
      <div class="dash-grid">
        <section class="card">${calendar()}</section>
        <section class="card"><h3>กำหนดการที่จะถึง</h3>
          ${up.slice(0, 6).map(v => `<button class="up-item" data-act="go" data-view="district" data-d="${esc(v.district)}">
            <span class="up-date"><b>${pd(v.date).getDate()}</b>${esc(MONTHS[pd(v.date).getMonth()].slice(0, 3))}</span>
            <span><b>อ.${esc(v.district)}</b><small>${esc(tRange(v))} · ${esc(MODE[v.mode] || '')}<br>${esc(v.venue || '')}</small></span>
            ${statusChip(v.status)}</button>`).join('') || '<p class="muted">ไม่มีกำหนดการที่จะถึง</p>'}
        </section>
      </div>
      <h2>อำเภอ (คปสอ.) ทั้ง 9 แห่ง</h2>
      <div class="dtiles">${S.districts.map(d => {
        const v = mainVisit(d), p = v ? readyPct(v) : 0;
        return `<button class="dtile" data-act="go" data-view="district" data-d="${esc(d)}">
          <span class="dname">${esc(d)}</span>
          ${v ? `<span class="small">${esc(dShort(v.date))} ${esc(tRange(v))}</span>${statusChip(v.status)}
            <span class="bar"><i style="width:${p}%"></i></span><span class="small muted">ความพร้อมข้อมูล ${p}%</span>`
            : '<span class="small muted">ยังไม่มีกำหนดการ</span>'}
        </button>`;
      }).join('')}</div>
      <h2>สถานะการเตรียมข้อมูลและเอกสาร</h2>
      <div class="card scroll"><table class="tbl status">
        <thead><tr><th>อำเภอ</th><th>วันที่</th><th>สถานะ</th>
          <th class="th-sup">ทีมผู้นิเทศ</th><th class="th-sup">ไฟล์ สสจ.</th>
          <th class="th-dist">ผู้บริหาร</th><th class="th-dist">สถานที่</th><th class="th-dist">ผู้ประสานงาน</th><th class="th-dist">ไฟล์อำเภอ</th>
          <th>ข้อเสนอแนะ</th><th>ความพร้อม</th></tr></thead>
        <tbody>${S.districts.map(d => {
          const v = mainVisit(d);
          if (!v) return `<tr><td><a data-act="go" data-view="district" data-d="${esc(d)}">${esc(d)}</a></td><td colspan="10" class="muted">ยังไม่มีกำหนดการ</td></tr>`;
          const r = readiness(v), f = findingsOf(v);
          return `<tr><td><a data-act="go" data-view="district" data-d="${esc(d)}">${esc(d)}</a></td><td class="nowrap">${esc(dShort(v.date))}</td><td>${statusChip(v.status)}</td>
            ${r.map(x => `<td class="ck ${x.done ? 'y' : 'n'}">${x.done ? '✓' : '–'}</td>`).join('')}
            <td>${f.length ? `${f.filter(x => x.status === 'done').length}/${f.length} ปิดแล้ว` : '–'}</td>
            <td><b>${readyPct(v)}%</b></td></tr>`;
        }).join('')}</tbody></table>
        <p class="muted small">✓ = มีข้อมูลแล้ว · คอลัมน์สีฟ้าเป็นของฝั่งผู้นิเทศ สีเขียวเป็นของฝั่ง คปสอ. · แสดงกำหนดการครั้งถัดไปของแต่ละอำเภอ (ถ้าไม่มี แสดงครั้งล่าสุด)</p>
      </div>`;
  }

  function calendar() {
    if (!ui.month) { const n = S.visits.find(v => v.date >= today()); const d = n ? pd(n.date) : new Date(); ui.month = [d.getFullYear(), d.getMonth()]; }
    const [y, mo] = ui.month, first = new Date(y, mo, 1), start = new Date(y, mo, 1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== mo) break;
      const key = ymd(d), ev = S.visits.filter(v => v.date === key);
      cells.push(`<div class="cal-cell ${d.getMonth() !== mo ? 'out' : ''} ${key === today() ? 'today' : ''}"><span class="cal-d">${d.getDate()}</span>
        ${ev.map(v => `<button class="cal-ev ${(STATUS[v.status] || STATUS.planned)[1]}" data-act="go" data-view="district" data-d="${esc(v.district)}"
          title="${esc(v.district + ' ' + tRange(v) + ' ' + (v.venue || ''))}">${esc(v.start || '')} ${esc(v.district)}</button>`).join('')}</div>`);
    }
    return `<div class="cal-head"><button class="btn sm" data-act="cal" data-dir="-1">‹</button>
      <h3>${MONTHS[mo]} ${y + 543}</h3><button class="btn sm" data-act="cal" data-dir="1">›</button>
      <button class="btn sm ghost2" data-act="cal" data-dir="0">วันนี้</button></div>
      <div class="cal">${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(x => `<div class="cal-wd">${x}</div>`).join('')}${cells.join('')}</div>
      <p class="legend">${Object.values(STATUS).map(s => `<span class="chip ${s[1]}">${s[0]}</span>`).join(' ')}</p>`;
  }

  /* ---------------- หน้าอำเภอ ---------------- */
  function vDistrict(m, d) {
    const vs = visitsOf(d);
    m.innerHTML = `
      <div class="bar">${me().role !== 'district' || d !== me().unit ? '<button class="btn sm" data-act="go" data-view="dash">‹ แดชบอร์ด</button>' : ''}
        <h2>คปสอ.${esc(d)}</h2>
        <select class="dsel" data-act-change="pick-district">${S.districts.map(x => `<option ${x === d ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      ${me().role === 'district' && d === me().unit ? `<p class="note info">กรุณาบันทึกข้อมูลฝั่งผู้รับนิเทศให้ครบ: <b>ผู้บริหารระดับอำเภอ</b> · <b>สถานที่รับการตรวจเยี่ยม</b> ·
        <b>ผู้ประสานงานหลัก</b> · <b>ไฟล์นำเสนอ</b> ก่อนวันนิเทศ</p>` : ''}
      ${vs.length ? vs.map(visitCard).join('') : '<div class="card"><p class="muted">ยังไม่มีกำหนดการนิเทศของอำเภอนี้</p></div>'}`;
  }

  function visitCard(v) {
    const r = readiness(v), sup = canSup(), dist = canDist(v), site = siteOf(v);
    return `<article class="card visit" id="v-${esc(v.id)}">
      <div class="visit-head">
        <div><h3>${esc(dLong(v.date))}${v.round ? ` <span class="muted small">· รอบที่ ${esc(v.round)}</span>` : ''}</h3>
          <p class="meta">${esc(tRange(v))} · ${esc(MODE[v.mode] || '')} ${statusChip(v.status)}</p></div>
        <div class="row-btns">
          <button class="btn sm" data-act="print" data-id="${esc(v.id)}">🖨 พิมพ์กำหนดการ</button>
          <button class="btn sm" data-act="ics" data-id="${esc(v.id)}">📅 เพิ่มลงปฏิทิน</button>
          ${isAdmin() ? `<button class="btn sm" data-act="edit-visit" data-id="${esc(v.id)}">แก้ไขกำหนดการ</button>` : ''}
        </div>
      </div>
      <div class="ready">${r.map(x => `<span class="rk ${x.side} ${x.done ? 'y' : 'n'}">${x.done ? '✓' : '○'} ${esc(x.label)}</span>`).join('')}
        <b>${readyPct(v)}%</b></div>

      <section class="sec info">
        <h4>ข้อมูลการนิเทศ</h4>
        <dl class="kv">
          <dt>สถานที่</dt><dd>${esc(v.venue || '–')}</dd>
          ${v.rpst ? `<dt>รพ.สต. ที่ตรวจเยี่ยม</dt><dd>${esc(v.rpst)}</dd>` : ''}
          ${v.link ? `<dt>ลิงก์ประชุมออนไลน์</dt><dd><a href="${esc(v.link)}" target="_blank" rel="noopener">${esc(v.link)}</a></dd>` : ''}
        </dl>
        ${v.agenda.length ? `<table class="tbl agenda"><thead><tr><th>เวลา</th><th>กิจกรรม</th></tr></thead>
          <tbody>${v.agenda.map(a => `<tr><td class="nowrap">${esc(a.time)}</td><td>${esc(a.activity)}</td></tr>`).join('')}</tbody></table>` : ''}
        ${v.briefing ? `<div class="brief"><b>สิ่งที่ผู้นิเทศควรทราบ</b><p>${esc(v.briefing)}</p></div>` : ''}
      </section>

      <div class="two">
        <section class="sec sup">
          <h4>ฝั่งผู้นิเทศ · สสจ.พิษณุโลก</h4>
          ${peopleTable(v, 'team', sup)}
          ${filesBlock(v, 'supervisor', sup)}
        </section>
        <section class="sec dist">
          <h4>ฝั่งผู้รับนิเทศ · คปสอ.${esc(v.district)}</h4>
          ${peopleTable(v, 'exec', dist)}
          <h5>สถานที่รับการตรวจเยี่ยม/นิเทศ</h5>
          ${site.venueName || site.address || site.rpstName ? `<dl class="kv">
            ${site.venueName ? `<dt>สถานที่</dt><dd>${esc(site.venueName)}${site.mapUrl ? ` · <a href="${esc(site.mapUrl)}" target="_blank" rel="noopener">แผนที่</a>` : ''}</dd>` : ''}
            ${site.address ? `<dt>ที่อยู่</dt><dd>${esc(site.address)}</dd>` : ''}
            ${site.rpstName ? `<dt>รพ.สต.</dt><dd>${esc(site.rpstName)}${site.rpstMapUrl ? ` · <a href="${esc(site.rpstMapUrl)}" target="_blank" rel="noopener">แผนที่</a>` : ''}${site.rpstAddress ? '<br>' + esc(site.rpstAddress) : ''}</dd>` : ''}
            ${site.travel ? `<dt>การเดินทาง/ที่จอดรถ</dt><dd>${esc(site.travel)}</dd>` : ''}
            ${site.notes ? `<dt>หมายเหตุ</dt><dd>${esc(site.notes)}</dd>` : ''}</dl>` : '<p class="muted small">ยังไม่ได้บันทึก</p>'}
          ${dist ? `<details><summary>${site.venueName ? 'แก้ไข' : 'บันทึก'}สถานที่</summary>
            <form data-form="site" data-visit="${esc(v.id)}" class="grid2">
              <label class="span2">สถานที่รับการนิเทศ (ห้องประชุม/อาคาร)<input name="venueName" value="${esc(site.venueName || '')}"></label>
              <label class="span2">ที่อยู่<input name="address" value="${esc(site.address || '')}"></label>
              <label class="span2">ลิงก์แผนที่ (Google Maps)<input name="mapUrl" type="url" placeholder="https://maps.app.goo.gl/…" value="${esc(site.mapUrl || '')}"></label>
              <label>รพ.สต. ที่รับการตรวจเยี่ยม<input name="rpstName" value="${esc(site.rpstName || '')}"></label>
              <label>ลิงก์แผนที่ รพ.สต.<input name="rpstMapUrl" type="url" value="${esc(site.rpstMapUrl || '')}"></label>
              <label class="span2">ที่อยู่ รพ.สต.<input name="rpstAddress" value="${esc(site.rpstAddress || '')}"></label>
              <label class="span2">การเดินทาง / ที่จอดรถ<textarea name="travel" rows="2">${esc(site.travel || '')}</textarea></label>
              <label class="span2">หมายเหตุ<textarea name="notes" rows="2">${esc(site.notes || '')}</textarea></label>
              <div class="span2"><button class="btn primary">บันทึกสถานที่</button></div></form></details>` : ''}
          ${peopleTable(v, 'coord', dist)}
          ${filesBlock(v, 'district', dist)}
        </section>
      </div>

      <section class="sec find">
        <h4>ผลการนิเทศ · ข้อเสนอแนะ · ข้อสั่งการ</h4>
        ${findingsBlock(v, sup, dist)}
      </section>
    </article>`;
  }

  const PEOPLE = {
    team: { title: 'ผู้ร่วมนิเทศ', cols: [['name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง'], ['unit', 'กลุ่มงาน/หน่วยงาน'], ['role', 'บทบาท'], ['topic', 'ประเด็นที่นิเทศ'], ['phone', 'โทร']],
            roles: ['ผู้นิเทศ', 'หัวหน้าคณะ', 'เลขานุการ', 'ผู้ติดตาม'] },
    exec: { title: 'ผู้บริหารระดับอำเภอที่รับการนิเทศ', cols: [['name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง'], ['unit', 'หน่วยงาน'], ['phone', 'โทร']] },
    coord: { title: 'ผู้ประสานงานหลัก', cols: [['name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง'], ['unit', 'หน่วยงาน'], ['phone', 'โทร'], ['email', 'อีเมล/LINE']] },
  };
  function peopleTable(v, kind, can) {
    const P = PEOPLE[kind], rows = peopleOf(v, kind);
    const delOk = p => can && (kind !== 'team' || own(p));
    return `<h5>${P.title} <span class="count">${rows.length}</span></h5>
      ${rows.length ? `<div class="scroll"><table class="tbl ppl"><thead><tr>${P.cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows.map(p => `<tr>${P.cols.map(c => `<td>${c[0] === 'phone' && p.phone ? `<a class="nowrap" href="tel:${esc(p.phone.replace(/[^0-9+]/g, ''))}">${esc(p.phone)}</a>` : esc(p[c[0]])}</td>`).join('')}
          <td>${delOk(p) ? `<button class="x" title="ลบ" data-act="del-person" data-id="${esc(p.id)}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted small">ยังไม่มีรายชื่อ</p>'}
      ${can ? `<details><summary>+ เพิ่ม${P.title}</summary>
        <form data-form="person" data-visit="${esc(v.id)}" data-kind="${kind}" class="grid2">
          <label>ชื่อ-สกุล<input name="name" required></label>
          <label>ตำแหน่ง<input name="position"></label>
          <label>${kind === 'team' ? 'กลุ่มงาน' : 'หน่วยงาน'}<input name="unit" ${kind === 'team' ? `list="groups" value="${esc(me().role === 'supervisor' ? me().unit : '')}"` : ''}></label>
          ${kind === 'team' ? `<label>บทบาท<select name="role">${P.roles.map(x => `<option>${x}</option>`).join('')}</select></label>
            <label class="span2">ประเด็นที่นิเทศ<input name="topic" placeholder="เช่น NCD, สุขภาพจิต, การเงินการคลัง"></label>` : ''}
          <label>โทรศัพท์<input name="phone" inputmode="tel"></label>
          ${kind === 'coord' ? '<label>อีเมล / LINE ID<input name="email"></label>' : ''}
          <div class="span2"><button class="btn primary">บันทึก</button></div>
        </form></details>` : ''}`;
  }

  function filesBlock(v, side, can) {
    const fs = filesOf(v, side);
    const icon = f => f.mime === 'link' ? '🔗' : /pdf/.test(f.mime) ? '📕' : /presentation|powerpoint/.test(f.mime) ? '📊' : /image/.test(f.mime) ? '🖼' : /sheet|excel/.test(f.mime) ? '📗' : /word|document/.test(f.mime) ? '📘' : '📄';
    return `<h5>เอกสาร/ไฟล์นำเสนอ${side === 'supervisor' ? ' (สสจ.)' : ' (คปสอ.)'} <span class="count">${fs.length}</span></h5>
      ${fs.length ? `<ul class="files">${fs.map(f => `<li>${icon(f)} <a href="${esc(f.url)}" target="_blank" rel="noopener" ${f.url.startsWith('data:') ? `download="${esc(f.title)}"` : ''}>${esc(f.title)}</a>
        <small>${esc(f.category)}${f.size ? ' · ' + kb(f.size) : ''} · ${esc(f.unit || f.createdBy)} · ${esc(f.createdAt.slice(0, 10))}</small>
        ${can && own(f) ? `<button class="x" title="ลบ" data-act="del-file" data-id="${esc(f.id)}">✕</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="muted small">ยังไม่มีไฟล์</p>'}
      ${can ? `<details><summary>+ แนบไฟล์ / ลิงก์</summary>
        <form data-form="upload" data-visit="${esc(v.id)}" data-side="${side}" class="grid2">
          <label>ประเภท<select name="category">${S.fileCats.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label>ชื่อเอกสาร (ไม่บังคับ)<input name="title"></label>
          <label class="span2">ไฟล์ (ไม่เกิน ${S.settings.maxUploadMB} MB)<input name="file" type="file"></label>
          <label class="span2">หรือวางลิงก์ (Google Drive / OneDrive ฯลฯ สำหรับไฟล์ขนาดใหญ่)<input name="url" type="url" placeholder="https://…"></label>
          <div class="span2"><button class="btn primary">แนบ</button></div>
        </form></details>` : ''}`;
  }

  function findingsBlock(v, sup, dist) {
    const fs = findingsOf(v);
    return `${fs.length ? fs.map(f => `<div class="finding">
        <div class="f-head"><span class="chip t">${esc(f.type)}</span>${f.topic ? `<b>${esc(f.topic)}</b>` : ''}
          <span class="muted small">${esc(f.owner)}${f.dueDate ? ' · กำหนด ' + esc(dShort(f.dueDate)) : ''}</span>
          ${(() => { const s = FSTATUS[f.status] || FSTATUS.open; return `<span class="chip ${s[1]}">${s[0]}</span>`; })()}
          ${sup && own(f) ? `<button class="x" title="ลบ" data-act="del-finding" data-id="${esc(f.id)}">✕</button>` : ''}</div>
        <p>${esc(f.text)}</p>
        ${f.response ? `<p class="resp"><b>คปสอ. ตอบกลับ:</b> ${esc(f.response)} <small class="muted">(${esc(f.respondedAt.slice(0, 10))})</small></p>` : ''}
        ${dist ? `<details><summary>อัปเดตความก้าวหน้า (คปสอ.)</summary>
          <form data-form="respond" data-id="${esc(f.id)}" class="grid2">
            <label>สถานะ<select name="status">${Object.entries(FSTATUS).map(([k, x]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${x[0]}</option>`).join('')}</select></label>
            <label class="span2">การดำเนินการ/คำชี้แจง<textarea name="response" rows="2">${esc(f.response || '')}</textarea></label>
            <div class="span2"><button class="btn primary">บันทึก</button></div></form></details>` : ''}
      </div>`).join('') : '<p class="muted small">ยังไม่มีการบันทึก</p>'}
      ${sup ? `<details><summary>+ บันทึกผลการนิเทศ</summary>
        <form data-form="finding" data-visit="${esc(v.id)}" class="grid2">
          <label>ประเภท<select name="type">${S.findingTypes.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
          <label>ประเด็น<input name="topic" placeholder="เช่น NCD, การเงินการคลัง"></label>
          <label class="span2">รายละเอียด<textarea name="text" rows="3" required></textarea></label>
          <label>ผู้รับผิดชอบติดตาม<input name="owner" list="groups" value="${esc(me().unit)}"></label>
          <label>กำหนดแล้วเสร็จ<input name="dueDate" type="date"></label>
          <div class="span2"><button class="btn primary">บันทึก</button></div></form></details>` : ''}`;
  }

  /* ---------------- สำหรับผู้นิเทศ ---------------- */
  function vBrief(m) {
    const vs = S.visits.filter(v => v.status !== 'cancelled');
    const up = vs.filter(v => v.date >= today()), past = vs.filter(v => v.date < today()).reverse();
    const mine = S.people.filter(p => p.kind === 'team' && p.createdBy === me().username).map(p => p.visitId);
    const card = v => {
      const coord = peopleOf(v, 'coord'), site = siteOf(v), team = peopleOf(v, 'team');
      return `<article class="card brief-card">
        <div class="visit-head"><div><h3>อ.${esc(v.district)} ${statusChip(v.status)} ${mine.includes(v.id) ? '<span class="chip s-done">ฉันลงชื่อแล้ว</span>' : ''}</h3>
          <p class="meta"><b>${esc(dLong(v.date))}</b> · ${esc(tRange(v))} · ${esc(MODE[v.mode] || '')}</p></div>
          <button class="btn primary sm" data-act="go" data-view="district" data-d="${esc(v.district)}">ลงชื่อ / แนบไฟล์ / บันทึกผล ›</button></div>
        <dl class="kv">
          <dt>สถานที่</dt><dd>${esc(site.venueName || v.venue || '–')}${site.mapUrl ? ` · <a href="${esc(site.mapUrl)}" target="_blank" rel="noopener">แผนที่</a>` : ''}</dd>
          ${v.rpst || site.rpstName ? `<dt>รพ.สต.</dt><dd>${esc(site.rpstName || v.rpst)}${site.rpstMapUrl ? ` · <a href="${esc(site.rpstMapUrl)}" target="_blank" rel="noopener">แผนที่</a>` : ''}</dd>` : ''}
          ${v.link ? `<dt>ลิงก์ประชุม</dt><dd><a href="${esc(v.link)}" target="_blank" rel="noopener">${esc(v.link)}</a></dd>` : ''}
          <dt>ผู้ประสานงานอำเภอ</dt><dd>${coord.length ? coord.map(c => `${esc(c.name)}${c.phone ? ` (<a href="tel:${esc(c.phone.replace(/[^0-9+]/g, ''))}">${esc(c.phone)}</a>)` : ''}`).join(', ') : '<span class="muted">ยังไม่ระบุ</span>'}</dd>
          <dt>ทีมผู้นิเทศ</dt><dd>${team.length ? team.length + ' คน: ' + team.map(t => esc(t.name)).join(', ') : '<span class="muted">ยังไม่มีผู้ลงชื่อ</span>'}</dd>
          ${site.travel ? `<dt>การเดินทาง</dt><dd>${esc(site.travel)}</dd>` : ''}
        </dl>
        ${v.briefing ? `<div class="brief"><b>สิ่งที่ผู้นิเทศควรทราบ</b><p>${esc(v.briefing)}</p></div>` : ''}
        ${v.agenda.length ? `<details><summary>กำหนดการ (${v.agenda.length} ช่วง)</summary><table class="tbl agenda"><tbody>${v.agenda.map(a => `<tr><td class="nowrap">${esc(a.time)}</td><td>${esc(a.activity)}</td></tr>`).join('')}</tbody></table></details>` : ''}
      </article>`;
    };
    m.innerHTML = `<h2>ข้อมูลสำหรับผู้นิเทศ</h2>
      <p class="muted">รายละเอียดการนิเทศงานทุกอำเภอ — ลงชื่อร่วมคณะ แนบไฟล์นำเสนอ และบันทึกผลการนิเทศได้ในหน้าของแต่ละอำเภอ</p>
      <h3 class="sect">กำหนดการที่จะถึง (${up.length})</h3>${up.map(card).join('') || '<div class="card muted">ไม่มี</div>'}
      ${past.length ? `<h3 class="sect">ที่ผ่านมา (${past.length})</h3>${past.map(card).join('')}` : ''}`;
  }

  /* ---------------- ผู้ดูแลระบบ: กำหนดการ ---------------- */
  function vSchedule(m) {
    const v = ui.editVisit;
    const ag = v ? (v.agenda.length ? v.agenda : [{ time: '', activity: '' }]) : [];
    m.innerHTML = `<div class="bar"><h2>จัดการกำหนดการนิเทศ</h2>${v ? '' : '<button class="btn primary" data-act="new-visit">+ เพิ่มกำหนดการ</button>'}</div>
      ${v ? `<form data-form="visit" class="card grid2">
        <h3 class="span2">${v.id ? 'แก้ไขกำหนดการ' : 'เพิ่มกำหนดการ'}</h3>
        <label>อำเภอ<select name="district" required>${S.districts.map(d => `<option ${d === v.district ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label>รอบที่<input name="round" value="${esc(v.round || '1')}"></label>
        <label>วันที่<input name="date" type="date" value="${esc(v.date || '')}" required></label>
        <label>สถานะ<select name="status">${Object.entries(STATUS).map(([k, x]) => `<option value="${k}" ${k === (v.status || 'planned') ? 'selected' : ''}>${x[0]}</option>`).join('')}</select></label>
        <label>เวลาเริ่ม<input name="start" type="time" value="${esc(v.start || '')}"></label>
        <label>เวลาสิ้นสุด<input name="end" type="time" value="${esc(v.end || '')}"></label>
        <label>รูปแบบ<select name="mode">${Object.entries(MODE).map(([k, x]) => `<option value="${k}" ${k === (v.mode || 'onsite') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>ลิงก์ประชุมออนไลน์<input name="link" type="url" value="${esc(v.link || '')}" placeholder="https://"></label>
        <label class="span2">สถานที่ (ตามหนังสือแจ้ง)<input name="venue" value="${esc(v.venue || '')}"></label>
        <label class="span2">รพ.สต. ที่ลงตรวจเยี่ยม<input name="rpst" value="${esc(v.rpst || '')}"></label>
        <div class="span2"><b>กำหนดการ (วาระ)</b>
          <table class="tbl agenda-edit"><tbody>${ag.map((a, i) => `<tr><td><input name="at${i}" value="${esc(a.time)}" placeholder="08:30–09:30"></td>
            <td><textarea name="aa${i}" rows="2">${esc(a.activity)}</textarea></td><td><button type="button" class="x" data-act="agenda-del" data-i="${i}">✕</button></td></tr>`).join('')}</tbody></table>
          <button type="button" class="btn sm" data-act="agenda-add">+ เพิ่มแถว</button></div>
        <label class="span2">สิ่งที่ผู้นิเทศควรทราบ<textarea name="briefing" rows="4">${esc(v.briefing || '')}</textarea></label>
        <div class="span2"><button class="btn primary">บันทึกกำหนดการ</button> <button type="button" class="btn ghost2" data-act="cancel-visit">ยกเลิก</button>
          ${v.id ? `<button type="button" class="btn danger right-float" data-act="del-visit" data-id="${esc(v.id)}">ลบกำหนดการนี้</button>` : ''}</div>
      </form>` : ''}
      <div class="card scroll"><table class="tbl"><thead><tr><th>วันที่</th><th>เวลา</th><th>อำเภอ</th><th>รูปแบบ</th><th>สถานที่</th><th>สถานะ</th><th>ความพร้อม</th><th></th></tr></thead>
        <tbody>${S.visits.map(x => `<tr><td class="nowrap">${esc(dShort(x.date))}</td><td class="nowrap">${esc(tRange(x))}</td>
          <td><a data-act="go" data-view="district" data-d="${esc(x.district)}">${esc(x.district)}</a></td><td>${esc(MODE[x.mode] || '')}</td>
          <td class="small">${esc(x.venue)}</td><td>${statusChip(x.status)}</td><td>${readyPct(x)}%</td>
          <td><button class="btn sm" data-act="edit-visit" data-id="${esc(x.id)}">แก้ไข</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">ยังไม่มีกำหนดการ</td></tr>'}</tbody></table></div>`;
  }
  function readAgenda(f) {
    const out = []; let i = 0;
    while (f.elements['at' + i] || f.elements['aa' + i]) { out.push({ time: f.elements['at' + i].value, activity: f.elements['aa' + i].value }); i++; }
    return out;
  }
  function formVisit(f) {
    return Object.assign({}, ui.editVisit, { district: f.district.value, round: f.round.value, date: f.date.value, status: f.status.value,
      start: f.start.value, end: f.end.value, mode: f.mode.value, link: f.link.value, venue: f.venue.value, rpst: f.rpst.value,
      briefing: f.briefing.value, agenda: readAgenda(f) });
  }

  /* ---------------- ผู้ดูแลระบบ: ผู้ใช้ ---------------- */
  function vUsers(m) {
    const u = ui.editUser;
    m.innerHTML = `<div class="bar"><h2>ผู้ใช้งาน</h2>
        <button class="btn" data-act="bulk-district">สร้างบัญชี คปสอ. ครบ 9 อำเภอ</button>
        <button class="btn primary" data-act="new-user">+ เพิ่มผู้ใช้</button></div>
      ${ui.created ? `<div class="card created"><h3>บัญชีที่สร้างใหม่ — คัดลอกส่งให้แต่ละอำเภอ (แสดงครั้งเดียว)</h3>
        ${ui.created.length ? `<table class="tbl"><thead><tr><th>อำเภอ</th><th>ชื่อผู้ใช้</th><th>รหัสผ่าน</th></tr></thead><tbody>
        ${ui.created.map(c => `<tr><td>${esc(c.district)}</td><td><code>${esc(c.username)}</code></td><td><code>${esc(c.password)}</code></td></tr>`).join('')}</tbody></table>
        <button class="btn" data-act="copy-created">คัดลอกทั้งหมด</button>` : '<p class="muted">ทุกอำเภอมีบัญชีอยู่แล้ว</p>'}
        <button class="btn ghost2" data-act="hide-created">ปิด</button></div>` : ''}
      ${u ? `<form data-form="user" class="card grid2"><h3 class="span2">${u.username ? 'แก้ไขผู้ใช้ ' + esc(u.username) : 'เพิ่มผู้ใช้'}</h3>
        <label>ชื่อผู้ใช้ <small class="muted">(a-z 0-9 . _ -)</small><input name="username" value="${esc(u.username || '')}" ${u.username ? 'readonly' : ''} required></label>
        <label>ชื่อ-สกุล / ชื่อที่แสดง<input name="name" value="${esc(u.name || '')}"></label>
        <label>สิทธิ์<select name="role">${Object.entries(ROLE).map(([k, x]) => `<option value="${k}" ${k === (u.role || 'supervisor') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>สังกัด (กลุ่มงาน หรืออำเภอสำหรับ คปสอ.)<input name="unit" list="units" value="${esc(u.unit || '')}"></label>
        <label>โทรศัพท์<input name="phone" value="${esc(u.phone || '')}"></label>
        <label>รหัสผ่าน${u.username ? ' <small class="muted">(เว้นว่าง = ไม่เปลี่ยน)</small>' : ''}<span class="row"><input name="password" minlength="8" ${u.username ? '' : 'required'}>
          <button type="button" class="btn sm" data-act="gen-pw">สุ่ม</button></span></label>
        <label class="inline"><input type="checkbox" name="active" ${u.active !== false ? 'checked' : ''}> เปิดใช้งาน</label>
        <p class="muted small span2">รหัสผ่านเก็บแบบเข้ารหัสทางเดียว ดูย้อนหลังไม่ได้ — คัดลอกส่งให้ผู้ใช้ก่อนกดบันทึก</p>
        <div class="span2"><button class="btn primary">บันทึก</button> <button type="button" class="btn ghost2" data-act="cancel-user">ยกเลิก</button></div>
      </form>` : ''}
      <datalist id="units">${S.districts.concat(GROUPS).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="card scroll"><table class="tbl"><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th>สังกัด</th><th>โทร</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${S.users.map(x => `<tr><td><code>${esc(x.username)}</code></td><td>${esc(x.name)}</td><td>${esc(ROLE[x.role])}</td><td>${esc(x.unit)}</td>
          <td>${esc(x.phone)}</td><td>${x.active ? 'ใช้งาน' : '<span class="muted">ปิด</span>'}</td>
          <td class="nowrap"><button class="btn sm" data-act="edit-user" data-u="${esc(x.username)}">แก้ไข/ตั้งรหัส</button>
          ${x.username !== me().username ? `<button class="x" title="ลบ" data-act="del-user" data-u="${esc(x.username)}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------------- ผู้ดูแลระบบ: ประกาศ / ตั้งค่า ---------------- */
  function vNews(m) {
    const n = ui.editNews || {};
    m.innerHTML = `<h2>ประกาศ / ข่าวสาร</h2>
      <form data-form="news" class="card grid2"><h3 class="span2">${n.id ? 'แก้ไขประกาศ' : 'เพิ่มประกาศ'}</h3>
        <label class="span2">หัวข้อ<input name="title" value="${esc(n.title || '')}" required></label>
        <label class="span2">รายละเอียด<textarea name="body" rows="3">${esc(n.body || '')}</textarea></label>
        <label class="inline"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}> ปักหมุดบนแดชบอร์ด</label>
        <div class="span2"><button class="btn primary">บันทึก</button>${n.id ? ' <button type="button" class="btn ghost2" data-act="cancel-news">ยกเลิก</button>' : ''}</div></form>
      <div class="card">${S.news.map(x => `<div class="news-row"><div><b>${x.pinned ? '📌 ' : ''}${esc(x.title)}</b><p>${esc(x.body)}</p>
        <small class="muted">${esc(x.createdAt)}</small></div><div class="nowrap"><button class="btn sm" data-act="edit-news" data-id="${esc(x.id)}">แก้ไข</button>
        <button class="x" data-act="del-news" data-id="${esc(x.id)}">✕</button></div></div>`).join('') || '<p class="muted">ยังไม่มีประกาศ</p>'}</div>`;
  }

  async function vSettings(m) {
    const st = S.settings;
    m.innerHTML = `<h2>ตั้งค่าระบบ</h2>
      <form data-form="settings" class="card grid2">
        <label>ปีงบประมาณ<input name="year" value="${esc(st.year)}"></label>
        <label>ขนาดไฟล์แนบสูงสุด (MB, 1–30)<input name="maxUploadMB" type="number" min="1" max="30" value="${esc(st.maxUploadMB)}"></label>
        <label class="span2">ชื่อภารกิจ<input name="title" value="${esc(st.title)}"></label>
        <label class="span2">ผู้ดูแล/ติดต่อ (แสดงท้ายหน้า)<input name="contact" value="${esc(st.contact)}"></label>
        <div class="span2"><button class="btn primary">บันทึก</button></div></form>
      ${api.demo ? '<div class="card"><button class="btn danger" data-act="demo-reset">ล้างข้อมูลโหมดทดลอง</button></div>' : ''}
      <h3>ประวัติการใช้งาน</h3><div class="card scroll" id="logbox"><p class="muted">กำลังโหลด…</p></div>`;
    const r = await run(() => api.call('getLog'));
    const box = $('#logbox'); if (!box) return;
    box.innerHTML = `<table class="tbl"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead><tbody>
      ${r.log.slice(0, 300).map(x => `<tr><td class="nowrap small">${esc(x.time)}</td><td>${esc(x.user)}</td><td>${esc(x.action)}</td><td class="small">${esc(x.detail)}</td></tr>`).join('')}</tbody></table>`;
  }

  function vAccount(m) {
    m.innerHTML = `<h2>บัญชีผู้ใช้</h2><form data-form="password" class="card grid2 narrow">
      <p class="span2">ชื่อผู้ใช้ <b>${esc(me().username)}</b> · ${esc(me().name)} · ${esc(ROLE[me().role])}${me().unit ? ' · ' + esc(me().unit) : ''}</p>
      <label class="span2">รหัสผ่านเดิม<input type="password" name="o" required autocomplete="current-password"></label>
      <label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)<input type="password" name="n" minlength="8" required autocomplete="new-password"></label>
      <label>ยืนยันรหัสผ่านใหม่<input type="password" name="c" minlength="8" required autocomplete="new-password"></label>
      <div class="span2"><button class="btn primary">เปลี่ยนรหัสผ่าน</button></div></form>`;
  }

  /* ---------------- พิมพ์ / ปฏิทิน ---------------- */
  function printVisit(v) {
    const site = siteOf(v), row = (k) => peopleOf(v, k);
    const list = (k, cols) => row(k).length ? `<table><thead><tr><th>ที่</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${row(k).map((p, i) => `<tr><td>${i + 1}</td>${cols.map(c => `<td>${esc(p[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>–</p>';
    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>กำหนดการนิเทศ อ.${esc(v.district)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
      <style>@page{size:A4;margin:18mm}body{font-family:'Sarabun',sans-serif;font-size:15px;color:#000}h1,h2{text-align:center;margin:2px 0;font-size:18px}
      h3{font-size:16px;margin:16px 0 6px}table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#eee}.c{text-align:center}p{margin:4px 0}.foot{margin-top:24px;font-size:12px;color:#555}</style></head><body>
      <h1>กำหนดการ${esc(String(S.settings.title || 'ตรวจเยี่ยมและนิเทศงาน').replace(/^การ/, ''))}</h1><h2>ประจำปีงบประมาณ ${esc(S.settings.year)}</h2>
      <h2>เครือข่ายบริการสุขภาพอำเภอ${esc(v.district)}</h2><h2>${esc(dLong(v.date))} ${esc(tRange(v))}</h2>
      <p class="c">ณ ${esc(site.venueName || v.venue || '–')}${v.rpst || site.rpstName ? ' · รพ.สต. ' + esc(site.rpstName || v.rpst) : ''}</p>
      ${v.agenda.length ? `<h3>กำหนดการ</h3><table><thead><tr><th style="width:24%">เวลา</th><th>กิจกรรม</th></tr></thead><tbody>
        ${v.agenda.map(a => `<tr><td>${esc(a.time)}</td><td>${esc(a.activity)}</td></tr>`).join('')}</tbody></table>` : ''}
      <h3>คณะผู้นิเทศ สสจ.พิษณุโลก</h3>${list('team', [['name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง'], ['unit', 'กลุ่มงาน'], ['topic', 'ประเด็น']])}
      <h3>ผู้บริหารระดับอำเภอที่รับการนิเทศ</h3>${list('exec', [['name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง']])}
      <h3>ผู้ประสานงานหลัก</h3>${list('coord', [['name', 'ชื่อ-สกุล'], ['position', 'ตำแหน่ง'], ['phone', 'โทร']])}
      <p class="foot">หมายเหตุ: กำหนดการอาจมีการเปลี่ยนแปลงได้ตามความเหมาะสม · พิมพ์จากระบบ PLK e-Inspection เมื่อ ${esc(new Date().toLocaleString('th-TH'))}</p>
      <script>window.onload=()=>setTimeout(()=>print(),400)<\/script></body></html>`;
    const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
    if (!w) toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาต pop-up', 'err');
  }
  function icsVisit(v) {
    const p = (t, def) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || def); return [+m[1], +m[2]]; };
    const d = pd(v.date), [sh, sm] = p(v.start, '08:30'), [eh, em] = p(v.end || '', v.start ? `${Math.min(p(v.start)[0] + 3, 23)}:${String(p(v.start)[1]).padStart(2, '0')}` : '12:00');
    const utc = (h, mi) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 7, mi)); return x.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; };
    const t = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const site = siteOf(v);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PLK e-Inspection//TH', 'BEGIN:VEVENT', `UID:${v.id}@plk-e-inspection`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${utc(sh, sm)}`, `DTEND:${utc(eh, em)}`,
      `SUMMARY:${t('นิเทศงาน คปสอ.' + v.district)}`, `LOCATION:${t(site.venueName || v.venue)}`,
      `DESCRIPTION:${t(v.agenda.map(a => a.time + ' ' + a.activity).join('\n') + (v.link ? '\n' + v.link : ''))}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `นิเทศ_${v.district}_${v.date}.ics`; a.click();
  }
  function genPw() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', a = new Uint32Array(12); crypto.getRandomValues(a); return [...a].map(x => c[x % c.length]).join(''); }
  const fileB64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
  const fv = (f, k) => (f.elements[k] ? f.elements[k].value : '');

  /* ---------------- เหตุการณ์ ---------------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || !S && b.dataset.act !== 'logout') return;
    const a = b.dataset.act, id = b.dataset.id, find = (arr) => arr.find(x => x.id === id);
    switch (a) {
      case 'go': ui.view = b.dataset.view; if (b.dataset.d) ui.district = b.dataset.d; render(); window.scrollTo(0, 0); break;
      case 'logout': await api.logout(); S = null; ui.view = null; renderLogin(); break;
      case 'cal': { const d = +b.dataset.dir; if (!d) { const n = new Date(); ui.month = [n.getFullYear(), n.getMonth()]; } else { const x = new Date(ui.month[0], ui.month[1] + d, 1); ui.month = [x.getFullYear(), x.getMonth()]; } render(); break; }
      case 'del-person': if (confirm('ลบรายชื่อนี้?')) await act('deletePerson', { id }, 'ลบแล้ว'); break;
      case 'del-file': if (confirm('ลบไฟล์นี้?')) await act('deleteFile', { id }, 'ลบแล้ว'); break;
      case 'del-finding': if (confirm('ลบรายการนี้?')) await act('deleteFinding', { id }, 'ลบแล้ว'); break;
      case 'print': printVisit(find(S.visits)); break;
      case 'ics': icsVisit(find(S.visits)); break;
      case 'new-visit': ui.editVisit = { agenda: [], status: 'planned', mode: 'onsite', round: '1' }; ui.view = 'schedule'; render(); break;
      case 'edit-visit': ui.editVisit = JSON.parse(JSON.stringify(find(S.visits))); ui.view = 'schedule'; render(); window.scrollTo(0, 0); break;
      case 'cancel-visit': ui.editVisit = null; render(); break;
      case 'agenda-add': case 'agenda-del': {
        const f = b.closest('form'); ui.editVisit = formVisit(f);
        if (a === 'agenda-add') ui.editVisit.agenda.push({ time: '', activity: '' }); else ui.editVisit.agenda.splice(+b.dataset.i, 1);
        render(); break;
      }
      case 'del-visit':
        if (confirm('ลบกำหนดการนี้ รวมทั้งรายชื่อ ไฟล์ และผลการนิเทศที่เกี่ยวข้องทั้งหมด?')) { ui.editVisit = null; await act('deleteVisit', { id }, 'ลบแล้ว'); }
        break;
      case 'new-user': ui.editUser = { role: 'supervisor', active: true }; render(); break;
      case 'edit-user': ui.editUser = S.users.find(u => u.username === b.dataset.u); render(); window.scrollTo(0, 0); break;
      case 'cancel-user': ui.editUser = null; render(); break;
      case 'del-user': if (confirm('ลบผู้ใช้ ' + b.dataset.u + '?')) await act('deleteUser', { username: b.dataset.u }, 'ลบแล้ว'); break;
      case 'gen-pw': { const i = b.closest('form').elements.password; i.value = genPw(); i.type = 'text'; i.select(); break; }
      case 'bulk-district': {
        if (!confirm('สร้างบัญชีให้ คปสอ. ที่ยังไม่มีบัญชี (สุ่มรหัสผ่านให้)?')) break;
        const r = await run(() => api.call('createDistrictUsers')); ui.created = r.created; await reload(false); break;
      }
      case 'copy-created': {
        const txt = ui.created.map(c => `คปสอ.${c.district}\tชื่อผู้ใช้: ${c.username}\tรหัสผ่าน: ${c.password}`).join('\n');
        try { await navigator.clipboard.writeText(txt); toast('คัดลอกแล้ว'); } catch (err) { prompt('คัดลอกข้อความนี้', txt); } break;
      }
      case 'hide-created': ui.created = null; render(); break;
      case 'edit-news': ui.editNews = find(S.news); render(); break;
      case 'cancel-news': ui.editNews = null; render(); break;
      case 'del-news': if (confirm('ลบประกาศนี้?')) await act('deleteNews', { id }, 'ลบแล้ว'); break;
      case 'demo-reset': if (confirm('ล้างข้อมูลทดลองทั้งหมด?')) api.reset(); break;
    }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-act-change="pick-district"]')) { ui.view = 'district'; ui.district = e.target.value; render(); }
  });

  document.addEventListener('submit', async e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const k = f.dataset.form, vid = f.dataset.visit;
    try {
      switch (k) {
        case 'login':
          try { await run(() => api.login(f.u.value, f.p.value)); ui.view = null; await reload(false); }
          catch (err) { if (err.auth !== false) renderLogin(err.message); }
          break;
        case 'person': {
          const person = { visitId: vid, kind: f.dataset.kind };
          ['name', 'position', 'unit', 'role', 'topic', 'phone', 'email'].forEach(x => { if (f.elements[x]) person[x] = f.elements[x].value; });
          await act('savePerson', { person }, 'บันทึกแล้ว'); break;
        }
        case 'site': {
          const site = { visitId: vid };
          ['venueName', 'address', 'mapUrl', 'rpstName', 'rpstAddress', 'rpstMapUrl', 'travel', 'notes'].forEach(x => site[x] = fv(f, x));
          await act('saveSite', { site }, 'บันทึกสถานที่แล้ว'); break;
        }
        case 'upload': {
          const file = f.elements.file.files[0], url = f.url.value.trim();
          const base = { visitId: vid, side: f.dataset.side, category: f.category.value, title: f.title.value };
          if (file) {
            if (file.size > S.settings.maxUploadMB * 1048576) return toast(`ไฟล์ใหญ่เกิน ${S.settings.maxUploadMB} MB — กรุณาแนบเป็นลิงก์แทน`, 'err');
            toast('กำลังอัปโหลด ' + file.name + ' …');
            const data = await fileB64(file);
            await act('uploadFile', Object.assign(base, { name: file.name, mime: file.type, data, title: base.title || file.name }), 'แนบไฟล์แล้ว');
          } else if (url) await act('addLink', Object.assign(base, { url }), 'แนบลิงก์แล้ว');
          else toast('กรุณาเลือกไฟล์ หรือวางลิงก์', 'err');
          break;
        }
        case 'finding':
          await act('saveFinding', { finding: { visitId: vid, type: f.type.value, topic: f.topic.value, text: f.text.value, owner: f.owner.value, dueDate: f.dueDate.value } }, 'บันทึกแล้ว'); break;
        case 'respond': await act('respondFinding', { id: f.dataset.id, status: f.status.value, response: f.response.value }, 'บันทึกแล้ว'); break;
        case 'visit': { const visit = formVisit(f); await run(() => api.call('saveVisit', { visit }), 'บันทึกกำหนดการแล้ว'); ui.editVisit = null; await reload(false); break; }
        case 'user': {
          const user = { username: f.username.value, name: f.name.value, role: f.role.value, unit: f.unit.value, phone: f.phone.value, active: f.active.checked };
          await run(() => api.call('saveUser', { user, password: f.password.value || null }), 'บันทึกผู้ใช้แล้ว'); ui.editUser = null; await reload(false); break;
        }
        case 'news':
          await run(() => api.call('saveNews', { news: { id: (ui.editNews || {}).id, title: f.title.value, body: f.body.value, pinned: f.pinned.checked } }), 'บันทึกแล้ว');
          ui.editNews = null; await reload(false); break;
        case 'settings':
          await act('saveSettings', { settings: { year: f.year.value, maxUploadMB: f.maxUploadMB.value, title: f.title.value, contact: f.contact.value } }, 'บันทึกแล้ว'); break;
        case 'password':
          if (f.n.value !== f.c.value) return toast('รหัสผ่านใหม่ไม่ตรงกัน', 'err');
          await run(() => api.call('changePassword', { oldPassword: f.o.value, newPassword: f.n.value }), 'เปลี่ยนรหัสผ่านแล้ว'); f.reset(); break;
      }
    } catch (err) { /* แจ้งผ่าน toast แล้ว */ }
  });

  // datalist กลุ่มงาน (ใช้ร่วมทุกหน้า)
  const dl = document.createElement('datalist'); dl.id = 'groups'; dl.innerHTML = GROUPS.map(g => `<option value="${esc(g)}">`).join(''); document.body.appendChild(dl);

  if (api.token) reload(false).catch(() => {}); else renderLogin();
})();
