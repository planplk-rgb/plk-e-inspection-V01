/* จำลอง Google Apps Script services สำหรับ "โหมดทดลอง" (ในเบราว์เซอร์) และชุดทดสอบ (node)
 * ทำให้รันโค้ดหลังบ้านตัวจริง (Code.gs) ได้โดยไม่ต้องมี Google — ผลลัพธ์ตรงกับระบบจริง */
(function (root) {
  /* ---------- SHA-256 (sync) ---------- */
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
    0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,
    0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,
    0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,
    0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256(bytes) {
    const l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(withPad);
    m.set(bytes); m[l] = 0x80;
    const bits = l * 8; for (let i = 0; i < 8; i++) m[withPad - 1 - i] = Math.floor(bits / Math.pow(2, 8 * i)) & 0xff;
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < withPad; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = []; H.forEach(x => out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255));
    return out;
  }
  const utf8 = s => Array.from(new TextEncoder().encode(String(s)));
  const toSigned = arr => arr.map(b => b > 127 ? b - 256 : b);
  const toUnsigned = arr => Uint8Array.from(arr, b => (b + 256) % 256);
  function b64enc(bytes) {
    const u = toUnsigned(bytes);
    if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64dec(s) {
    if (typeof Buffer !== 'undefined') return toSigned(Array.from(Buffer.from(s, 'base64')));
    const bin = atob(s); const out = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) { const b = bin.charCodeAt(i); out[i] = b > 127 ? b - 256 : b; }
    return out;
  }
  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  /**
   * สร้างชุด service จำลอง
   * @param {object} opt  { load(): state|null, save(state), logs: [] }
   */
  function createGas(opt = {}) {
    const state = (opt.load && opt.load()) || { sheets: {}, drive: { folders: {}, files: {} } };
    const save = () => opt.save && opt.save(state);
    const logs = opt.logs || [];

    function sheet(name) {
      const data = state.sheets[name];
      const trim = () => { while (data.length && !(data[data.length - 1] || []).some(x => x !== '' && x !== undefined && x !== null)) data.pop(); };
      const range = (r, c, nr, nc) => ({
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (data[r - 1 + i] = data[r - 1 + i] || [])[c - 1 + j] = String(x); })); save(); return this; },
        getDisplayValues() {
          const out = [];
          for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { let x = ((data[r - 1 + i] || [])[c - 1 + j]); x = x === undefined || x === null ? '' : String(x); row.push(x.charAt(0) === "'" ? x.slice(1) : x); } out.push(row); }
          return out;
        },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ''; trim(); save(); return this; },
        setNumberFormat() { return this; }, setFontWeight() { return this; },
      });
      return {
        getName: () => name,
        getRange(a, b, c, d) { return typeof a === 'string' ? range(1, 1, 1, 1) : range(a, b, c || 1, d || 1); },
        getLastRow() { trim(); return data.length; },
        getLastColumn() { return Math.max(0, ...data.map(r => { let n = r.length; while (n && (r[n - 1] === '' || r[n - 1] === undefined || r[n - 1] === null)) n--; return n; })); },
        setFrozenRows() {},
        appendRow(row) { data.push(row.map(String)); if (name === 'Log' && data.length > 2000) data.splice(1, data.length - 2000); save(); },
      };
    }
    const ss = {
      getSheetByName: n => state.sheets[n] ? sheet(n) : null,
      insertSheet: n => { state.sheets[n] = state.sheets[n] || []; save(); return sheet(n); },
    };

    function folderObj(id) {
      return {
        getId: () => id,
        getFoldersByName(name) {
          const ids = Object.keys(state.drive.folders).filter(k => state.drive.folders[k].parent === id && state.drive.folders[k].name === name);
          let i = 0; return { hasNext: () => i < ids.length, next: () => folderObj(ids[i++]) };
        },
        createFolder(name) { const fid = 'fld_' + uuid().slice(0, 8); state.drive.folders[fid] = { name, parent: id }; save(); return folderObj(fid); },
        createFile(blob) {
          const fid = 'file_' + uuid().replace(/-/g, '').slice(0, 12);
          const url = opt.fileUrl ? opt.fileUrl(blob) : 'https://drive.example/' + fid;
          state.drive.files[fid] = { name: blob.name, mime: blob.mime, size: blob.bytes.length, folder: id, url, trashed: false };
          save(); return fileObj(fid);
        },
      };
    }
    function fileObj(id) {
      return { getId: () => id, getUrl: () => state.drive.files[id].url, setSharing() {}, setTrashed(t) { state.drive.files[id].trashed = !!t; save(); } };
    }

    const cache = {};
    const services = {
      SpreadsheetApp: { getActive: () => ss },
      DriveApp: {
        createFolder(name) { const id = 'fld_' + uuid().slice(0, 8); state.drive.folders[id] = { name, parent: null }; save(); return folderObj(id); },
        getFolderById(id) { if (!state.drive.folders[id]) throw new Error('ไม่พบโฟลเดอร์'); return folderObj(id); },
        getFileById(id) { if (!state.drive.files[id]) throw new Error('ไม่พบไฟล์'); return fileObj(id); },
        Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      },
      Utilities: {
        getUuid: uuid, sleep() {},
        computeDigest: (alg, s) => toSigned(sha256(utf8(s))),
        base64Encode: b64enc, base64Decode: b64dec,
        newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
        DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
        formatDate(d) {
          const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d);
          const g = t => (p.find(x => x.type === t) || {}).value;
          return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
        },
      },
      CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      ContentService: {
        createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }),
        MimeType: { JSON: 'JSON' },
      },
      Logger: { log: m => logs.push(String(m)) },
    };
    return { services, state, logs, cache };
  }

  const api = { createGas, sha256 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GasMock = api;
})(typeof window !== 'undefined' ? window : globalThis);
