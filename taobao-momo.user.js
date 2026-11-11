// ==UserScript==
// @name         Taobao + Momo Cargo → Import Tracker
// @namespace    import-tracker
// @version      1.2
// @description  ดึงออเดอร์ Taobao (เลขพัสดุจีน + สินค้า) และสถานะ Momo Cargo ส่งเข้า Import Tracker อัตโนมัติ · อ่านอย่างเดียว ไม่กดยืนยัน/ซื้อ/จ่าย
// @match        https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm*
// @match        https://www.momocargo.com/*
// @match        https://momocargo.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-start
// @updateURL    https://kengamp2555.github.io/packing-cam/taobao-momo.user.js
// @downloadURL  https://kengamp2555.github.io/packing-cam/taobao-momo.user.js
// ==/UserScript==

/*
 * ตั้งค่าครั้งแรก (ต่อเครื่อง): เมนู Tampermonkey → "⚙️ ตั้งค่า Import Tracker" → วาง URL /exec และ TOKEN
 * ใช้งาน: ในแอป Import Tracker กดปุ่ม "เปิดหน้า" Taobao / Momo → เมื่อแอปขึ้น "พร้อม" กด "ดึงทันที"
 *   Taobao: ดึงออเดอร์ย้อนหลัง 30 วัน · Momo: สคริปต์กดแท็บสถานะให้เอง (จัดส่งแล้ว: เฉพาะ PO 30 วัน)
 * ไม่มีการดึงอัตโนมัติตามเวลา — หน้าเว็บที่เปิดอยู่รายงานสถานะให้แอปทุก 15 วินาทีเท่านั้น
 * ข้อมูลที่ส่ง: เลขออเดอร์ ร้าน สินค้า ราคา เลขพัสดุ สถานะ น้ำหนัก ค่าขนส่ง — ไม่ส่งชื่อ/ที่อยู่/เบอร์โทร และไม่อ่านรหัสผ่าน/โทเคนของเว็บ
 */
(function () {
  'use strict';
  const W = unsafeWindow;
  const HB_MS = 15000;
  const HOST = location.hostname;
  const P = { momoQ: {}, momoT: 0, busy: false, msg: '', tbLast: null, tbSeq: 0, tbLoadedAt: 0 };
  const cfg = () => ({ url: GM_getValue('it_url', ''), token: GM_getValue('it_token', '') });

  GM_registerMenuCommand('⚙️ ตั้งค่า Import Tracker', () => {
    const u = prompt('URL ของเว็บแอป (ลงท้าย /exec)', cfg().url); if (u === null) return;
    const t = prompt('TOKEN (จาก setup() ใน Apps Script)', cfg().token); if (t === null) return;
    GM_setValue('it_url', u.trim()); GM_setValue('it_token', t.trim());
    post({ action: 'ping' }).then(() => alert('✅ เชื่อมต่อได้')).catch(e => alert('❌ ' + e.message));
  });
  GM_registerMenuCommand('🔄 ดึงข้อมูลตอนนี้', () => run());

  /* ---------- ส่งเข้า Apps Script ---------- */
  function post(body) {
    const c = cfg();
    if (!c.url || !c.token) return Promise.reject(new Error('ยังไม่ได้ตั้งค่า URL/TOKEN (เมนู Tampermonkey)'));
    return new Promise((res, rej) => GM_xmlhttpRequest({
      method: 'POST', url: c.url, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, timeout: 120000,
      data: JSON.stringify(Object.assign({ token: c.token }, body)),
      onload: r => { try { const j = JSON.parse(r.responseText); j.ok ? res(j) : rej(new Error(j.error || 'error')); } catch (e) { rej(new Error('ตอบกลับไม่ใช่ JSON (' + r.status + ')')); } },
      onerror: () => rej(new Error('เชื่อมต่อไม่ได้')), ontimeout: () => rej(new Error('หมดเวลา'))
    }));
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const site = () => /taobao/.test(HOST) ? 'tb' : 'momo';

  /* ---------- กล่องสถานะเล็กๆ ---------- */
  let box;
  function say(t, err) {
    P.msg = (err ? '❌ ' : '') + t;
    if (!document.body) return document.addEventListener('DOMContentLoaded', () => say(t, err), { once: true });
    if (!box) {
      const st = document.createElement('style'); st.textContent = '@media print{#itBox{display:none!important}}'; document.head.appendChild(st);
      box = document.createElement('div'); box.id = 'itBox';
      box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#1f2328;color:#fff;font:13px/1.4 sans-serif;padding:7px 11px;border-radius:8px;max-width:320px;opacity:.92;cursor:pointer';
      box.title = 'Import Tracker (คลิกเพื่อซ่อน)'; box.onclick = () => { box.style.display = 'none'; };
      document.body.appendChild(box);
    }
    box.style.display = 'block'; box.style.background = err ? '#b42318' : '#1f2328';
    box.textContent = '📦 ' + t;
  }

  /* ======================= Taobao ======================= */
  /* ===INLINE parsers.js=== */
  const yuan_ = s => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : 0; };
  function tbParse(d) {
    const comp = (d && d.data) || {}, by = {};
    const o = id => by[id] || (by[id] = { id, created: '', shop: '', trade: '', total: 0, post: 0, items: [], pkgs: [], lgTitle: '', lgText: '' });
    Object.keys(comp).forEach(k => {
      const c = comp[k], tag = k.split('_')[0], f = c.fields || {};
      if (tag === 'shopInfo' && f.orderId) Object.assign(o(f.orderId), { created: f.createTime || f.createDay || '', shop: f.shopName || f.sellerName || '', trade: f.tradeTitle || '' });
      else if (tag === 'orderPayment' && c.id) { const x = o(c.id); x.total = yuan_(f.actualFee && f.actualFee.value); x.post = yuan_(f.pcPostFee && f.pcPostFee.value); }
      else if (tag === 'orderItemInfo' && f.item) {
        const [oid, sid] = String(c.id).split('_'), it = f.item, p = it.priceInfo || {};
        o(f.orderId || oid).items.push({ sub: sid || it.itemId, title: String(it.title || '').slice(0, 120), sku: String(it.skuText || '').slice(0, 80),
          qty: +it.quantity || 1, price: yuan_(p.actualTotalFee || p.promotion || p.original), pic: it.pic ? (String(it.pic).startsWith('//') ? 'https:' + it.pic : it.pic) : '', itemId: it.itemId || '' });
      } else if (tag === 'orderLogistics' && c.id) {
        const pv = (f.packagePreview && f.packagePreview.packageViewList) || [];
        pv.forEach(p => { if (p.mailNo) o(c.id).pkgs.push({ mailNo: String(p.mailNo), cp: p.cpName || p.cpCode || '', subs: (p.subOrderList || []).map(String) }); });
      } else if (tag === 'orderStatus' && c.id) {
        const x = o(c.id); x.lgTitle = f.title || ''; x.lgText = String(f.subTitle || '').slice(0, 160);
        if (f.mailNo && !x.pkgs.some(p => p.mailNo === String(f.mailNo))) x.pkgs.push({ mailNo: String(f.mailNo), cp: f.cpCode || '', subs: [] });
      }
    });
    const pg = Object.keys(comp).map(k => comp[k]).find(c => c.tag === 'pagination');
    return { orders: Object.keys(by).map(k => by[k]).filter(x => x.created || x.items.length), page: pg ? pg.fields : null };
  }
  function momoParse(j) {
    const list = (j && j.data && (j.data.data || j.data)) || [];
    return (Array.isArray(list) ? list : []).map(o => ({
      po: o.qr_code || '', status: (o.status && o.status.status) || '', statusText: (o.status && o.status.description) || '',
      created: o.created_date || '', updated: o.updated_date || '', type: o.type || '', shipBy: o.ship_by || '',
      tracks: [].concat.apply([], (o.cn_tracks || []).map(t => [].concat.apply([], (t.vendor_tracks || []).map(v => String(v.tracking || '').split(/[\s,;/]+/).filter((x, i, a) => x && a.indexOf(x) === i).map(trk => ({
        tracking: trk, kg: +v.kg || 0, cbm: +v.cbm || 0, qty: +v.quantity || 1,
        freightCn: +(v.freight_cn || 0), freightTh: +(v.freight_th || 0), rate: +(v.calculate_rate || t.calculate_rate || 0), calc: v.calculate_type || t.calculate_type || '',
        extra: +(v.extra_cost || 0) + +(v.wooden_cost || 0), container: v.container_name || '', thTrack: v.th_track || '', thBy: v.ship_by_destination_text || '',
        dates: v.status_date || {}, img: (v.cn_image && v.cn_image[0]) || v.image || '', vstatus: v.status || 0,
        trackFreightCn: +(t.freight_cn || 0), trackFreightTh: +(t.freight_th || 0)
      }))))))
    }));
  }
  /* ===END parsers=== */

  /* หน้า 已买到的宝贝 ส่งคำขอ mtop.taobao.order.queryboughtlistv2 เอง (เซ็นคำขอด้วยตัวของมันเอง)
     → สคริปต์ไม่สร้างคำขอเอง แค่อ่านผลที่หน้าเว็บได้รับ และเวลาดึงจะกดปุ่ม "หน้าถัดไป" ของหน้าเว็บเหมือนคนกด */
  const TB_DAYS = 30, TB_MAX_PAGES = 6;
  function tbCapture(text) {
    let j; try { j = JSON.parse(text); } catch (e) { return; }
    if (!j || !/SUCCESS/.test(String(j.ret && j.ret[0]))) return;
    const x = tbParse(j.data); if (!x.orders.length) return;
    P.tbLast = x; P.tbSeq++;
    if (!P.busy) post({ action: 'tb', orders: x.orders }).then(r => say('Taobao: บันทึก ' + r.saved + ' ออเดอร์ (หน้านี้)')).catch(e => say(e.message, 1));
  }
  function hookTbXhr() {
    const X = W.XMLHttpRequest && W.XMLHttpRequest.prototype; if (!X || X.__it) return; X.__it = 1;
    const open = X.open, send = X.send;
    X.open = function (m, u) { this.__itU = String(u || ''); return open.apply(this, arguments); };
    X.send = function () {
      if (/queryboughtlistv2/i.test(this.__itU)) this.addEventListener('load', () => { try { tbCapture(this.responseText); } catch (e) { } });
      return send.apply(this, arguments);
    };
  }
  const tbReady = () => !!document.querySelector('.ant-pagination') || !!P.tbLast;
  async function tbWaitNew(seq, ms) { for (let t = 0; t < ms; t += 300) { if (P.tbSeq > seq) return true; await sleep(300); } return false; }
  async function runTaobao() {
    if (P.busy) return;
    const cut = new Date(Date.now() - TB_DAYS * 864e5).toISOString().slice(0, 10);
    // หน้าเปิดค้างไว้นาน → โหลดหน้าใหม่ก่อน (ได้ข้อมูลล่าสุด) แล้วดึงต่อหลังโหลดเสร็จ
    const act = document.querySelector('.ant-pagination-item-active'), onFirst = !act || act.textContent.trim() === '1';
    if (!P.tbLast || !onFirst || Date.now() - P.tbLoadedAt > 3 * 60e3) {
      GM_setValue('tb_resume', Date.now()); say('Taobao: โหลดหน้าใหม่ก่อนดึง…'); location.reload(); return;
    }
    P.busy = true; let total = 0;
    try {
      for (let page = 1; page <= TB_MAX_PAGES; page++) {
        const x = P.tbLast;
        say('Taobao: บันทึกหน้า ' + page + ' (ย้อนหลัง ' + TB_DAYS + ' วัน)…');
        const keep = x.orders.filter(o => !o.created || String(o.created).slice(0, 10) >= cut);
        if (keep.length) total += (await post({ action: 'tb', orders: keep })).saved;
        if (keep.length < x.orders.length) break;
        const next = document.querySelector('.ant-pagination-next');
        if (!next || next.classList.contains('ant-pagination-disabled') || next.getAttribute('aria-disabled') === 'true') break;
        await sleep(2000 + Math.random() * 1500);
        const seq = P.tbSeq;
        (next.querySelector('button,a') || next).click();
        if (!(await tbWaitNew(seq, 15000))) throw new Error('กดหน้าถัดไปแล้วไม่มีข้อมูลตอบกลับ (มีหน้ายืนยันตัวตนขึ้นมาหรือเปล่า?)');
      }
      await post({ action: 'tb', orders: [], full: 1 });
      say('Taobao: บันทึกแล้ว ' + total + ' ออเดอร์ · ' + new Date().toLocaleTimeString('th-TH').slice(0, 5));
    } catch (e) { say('Taobao: ' + e.message, 1); }
    finally { P.busy = false; }
  }

  /* ======================= Momo Cargo ======================= */
  const RECENT_DONE_DAYS = 30; // สถานะ "จัดส่งให้แล้ว" มีเป็นพันรายการ → ส่งเฉพาะ PO ที่สร้างใน 30 วัน
  function momoCapture(url, text) {
    if (!/\/order\/list\/v2\//.test(url)) return;
    let j; try { j = JSON.parse(text); } catch (e) { return; }
    const cut = new Date(Date.now() - RECENT_DONE_DAYS * 864e5).toISOString().slice(0, 10);
    momoParse(j).forEach(o => {
      if (!o.po || !o.tracks.length) return;
      if (/^(success|cancel)$/.test(o.status) && String(o.created).slice(0, 10) < cut) return;
      P.momoQ[o.po] = o;
    });
    clearTimeout(P.momoT); P.momoT = setTimeout(flushMomo, 3000);
  }
  async function flushMomo(full) {
    const list = Object.keys(P.momoQ).map(k => P.momoQ[k]); P.momoQ = {};
    if (!list.length) { if (full) post({ action: 'momo', orders: [], full: 1 }).catch(() => { }); return; }
    try {
      let n = 0; for (let i = 0; i < list.length; i += 150) n += (await post({ action: 'momo', orders: list.slice(i, i + 150), full: full && i + 150 >= list.length ? 1 : 0 })).saved;
      say('Momo: บันทึก ' + n + ' พัสดุ (' + list.length + ' PO)');
    } catch (e) { say('Momo: ' + e.message, 1); }
  }
  function hookXhr() {
    const X = W.XMLHttpRequest && W.XMLHttpRequest.prototype; if (!X || X.__it) return; X.__it = 1;
    const open = X.open, send = X.send;
    X.open = function (m, u) { this.__itU = String(u || ''); return open.apply(this, arguments); };
    X.send = function () {
      if (/momocargo\.com.*\/order\/list\/v2\//.test(this.__itU)) this.addEventListener('load', () => { try { momoCapture(this.__itU, this.responseText); } catch (e) { } });
      return send.apply(this, arguments);
    };
    const f = W.fetch;
    if (f) W.fetch = function (u) { const p = f.apply(this, arguments); const url = String((u && u.url) || u || '');
      if (/\/order\/list\/v2\//.test(url)) p.then(r => r.clone().text()).then(t => momoCapture(url, t)).catch(() => { }); return p; };
  }
  const MOMO_TABS = ['รอเข้าโกดังจีน', 'ถึงโกดังจีน', 'กำลังส่งมาไทย', 'รอชำระค่าขนส่ง', 'กำลังนำส่ง', 'จัดส่งให้แล้ว'];
  const momoTab = lab => [...document.querySelectorAll('a')].find(e => (e.innerText || '').trim().replace(/\s+/g, ' ').replace(/\s*[\d.,]+K?$/, '') === lab);
  async function runMomo() {
    if (P.busy) return;
    if (!/\/import-order/.test(location.pathname)) return say('Momo: ไปที่หน้า รายการนำเข้า ก่อน', 1);
    P.busy = true;
    try {
    for (const lab of MOMO_TABS) {
      const a = momoTab(lab);
      if (!a) continue;
      say('Momo: กำลังอ่าน "' + lab + '"…');
      a.click();
      await sleep(lab === 'จัดส่งให้แล้ว' ? 9000 : 5000);
    }
    await sleep(3500); clearTimeout(P.momoT); await flushMomo(true);
    } finally { P.busy = false; }
  }

  /* ---------- เริ่ม: รายงานสถานะให้แอปทุก 15 วิ · แอปกด "ดึงทันที" → ดึง ---------- */
  function run() { return /taobao/.test(HOST) ? runTaobao() : runMomo(); }
  function readiness() {
    if (/taobao/.test(HOST)) {
      if (/login/.test(location.hostname + location.pathname)) return [false, 'ยังไม่ได้ล็อกอิน Taobao'];
      return tbReady() ? [true, 'พร้อม'] : [false, 'หน้ายังโหลดไม่เสร็จ / ยังไม่ล็อกอิน'];
    }
    if (!/\/import-order/.test(location.pathname)) return [false, 'ไม่ได้อยู่หน้า รายการนำเข้า'];
    if (!momoTab('ถึงโกดังจีน')) return [false, 'หน้ายังโหลดไม่เสร็จ / ยังไม่ล็อกอิน'];
    return [true, 'พร้อม'];
  }
  async function beat() {
    if (!cfg().url || !cfg().token) return say('ยังไม่ได้ตั้งค่า: เมนู Tampermonkey → ⚙️ ตั้งค่า Import Tracker', 1);
    const [ready, why] = readiness();
    try {
      const r = await post({ action: 'hb', site: site(), ready, busy: P.busy, msg: P.busy || ready ? (P.msg || 'พร้อม') : why, ver: GM_info.script.version });
      if (r.pull && ready && !P.busy) { say((site() === 'tb' ? 'Taobao' : 'Momo') + ': แอปสั่งดึง – เริ่ม…'); run().then(() => setTimeout(beat, 500)); }
    } catch (e) { /* เน็ตหลุดชั่วคราว: รอบหน้าลองใหม่ */ }
  }
  if (/momocargo/.test(HOST)) hookXhr();
  else {
    hookTbXhr(); P.tbLoadedAt = Date.now();
    // เพิ่งโหลดหน้าใหม่เพราะแอปสั่งดึง → ดึงต่อเมื่อข้อมูลหน้าแรกมาถึง
    if (Date.now() - +GM_getValue('tb_resume', 0) < 2 * 60e3) {
      GM_setValue('tb_resume', 0);
      (async () => { for (let i = 0; i < 60 && !P.tbLast; i++) await sleep(500); if (P.tbLast) runTaobao(); else say('Taobao: หน้าไม่โหลดรายการ (ล็อกอินหรือยัง?)', 1); })();
    }
  }
  const start = () => { setTimeout(beat, 3000); setInterval(beat, HB_MS); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start();
})();
