// ==UserScript==
// @name         Taobao + Momo Cargo → Import Tracker
// @namespace    import-tracker
// @version      1.0
// @description  ดึงออเดอร์ Taobao (เลขพัสดุจีน + สินค้า) และสถานะ Momo Cargo ส่งเข้า Import Tracker อัตโนมัติ · อ่านอย่างเดียว ไม่กดยืนยัน/ซื้อ/จ่าย
// @match        https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm*
// @match        https://www.momocargo.com/*
// @match        https://momocargo.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-start
// @updateURL    https://kengamp2555.github.io/packing-cam/taobao-momo.user.js
// @downloadURL  https://kengamp2555.github.io/packing-cam/taobao-momo.user.js
// ==/UserScript==

/*
 * ตั้งค่าครั้งแรก (ต่อเครื่อง): เมนู Tampermonkey → "⚙️ ตั้งค่า Import Tracker" → วาง URL /exec และ TOKEN
 * Taobao: เปิดหน้า 已买到的宝贝 ทิ้งไว้ → ดึงย้อนหลังเอง (ครั้งแรก 90 วัน, ต่อไป 30 วัน) ทุก 2 ชม.
 * Momo:   เปิดหน้า รายการนำเข้า (/import-order) → สคริปต์กดแท็บสถานะให้เอง ทุก 2 ชม.
 * ข้อมูลที่ส่ง: เลขออเดอร์ ร้าน สินค้า ราคา เลขพัสดุ สถานะ น้ำหนัก ค่าขนส่ง — ไม่ส่งชื่อ/ที่อยู่/เบอร์โทร และไม่อ่านรหัสผ่าน/โทเคนของเว็บ
 */
(function () {
  'use strict';
  const W = unsafeWindow;
  const EVERY_MS = 2 * 3600e3;
  const HOST = location.hostname;
  const cfg = () => ({ url: GM_getValue('it_url', ''), token: GM_getValue('it_token', '') });

  GM_registerMenuCommand('⚙️ ตั้งค่า Import Tracker', () => {
    const u = prompt('URL ของเว็บแอป (ลงท้าย /exec)', cfg().url); if (u === null) return;
    const t = prompt('TOKEN (จาก setup() ใน Apps Script)', cfg().token); if (t === null) return;
    GM_setValue('it_url', u.trim()); GM_setValue('it_token', t.trim());
    post({ action: 'ping' }).then(() => alert('✅ เชื่อมต่อได้')).catch(e => alert('❌ ' + e.message));
  });
  GM_registerMenuCommand('🔄 ดึงข้อมูลตอนนี้', () => { GM_setValue('run_' + site(), 0); run(true); });

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
    if (!document.body) return document.addEventListener('DOMContentLoaded', () => say(t, err), { once: true });
    if (!box) {
      const st = document.createElement('style'); st.textContent = '@media print{#itBox{display:none!important}}'; document.head.appendChild(st);
      box = document.createElement('div'); box.id = 'itBox';
      box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#1f2328;color:#fff;font:13px/1.4 sans-serif;padding:7px 11px;border-radius:8px;max-width:320px;opacity:.92;cursor:pointer';
      box.title = 'Import Tracker (คลิกเพื่อซ่อน)'; box.onclick = () => box.remove();
      document.body.appendChild(box);
    }
    box.style.background = err ? '#b42318' : '#1f2328';
    box.textContent = '📦 ' + t;
  }

  /* ---------- ถึงรอบหรือยัง (ดูจากเซิร์ฟเวอร์ ทุกเครื่องเห็นเหมือนกัน) ---------- */
  async function due(force) {
    const k = 'run_' + site(), last = +GM_getValue(k, 0);
    if (!force && Date.now() - last < 20 * 60e3) return null; // กันหลายแท็บในเครื่องเดียว
    let st = {}; try { st = (await post({ action: 'state' })).state || {}; } catch (e) { say(e.message, 1); return null; }
    const ts = st[site() + 'Full'], at = ts ? new Date(ts.replace(' ', 'T')).getTime() : 0;
    if (!force && at && Date.now() - at < EVERY_MS) return null;
    GM_setValue(k, Date.now());
    return { first: !at };
  }

  /* ======================= Taobao ======================= */
  const P = { tbTpl: null, tbOrig: null, momoQ: {}, momoT: 0 };
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

  const isTbList = o => o && /queryboughtlist/i.test(String(o.api || ''));
  // ห่อ lib.mtop.request ของหน้าเว็บ: จำรูปแบบคำขอที่หน้าเว็บใช้ + เก็บผลที่หน้าเว็บโหลดเอง
  function hookMtop() {
    const lib = W.lib, m = lib && lib.mtop;
    if (!m || !m.request || m.request.__it) return !!(m && m.request);
    const orig = m.request;
    const wrapped = function (opt) {
      const p = orig.apply(this, arguments);
      try {
        if (isTbList(opt)) {
          P.tbTpl = JSON.parse(JSON.stringify(opt));
          if (!P.busy && p && p.then) p.then(r => { const x = tbParse(r && r.data); if (x.orders.length) post({ action: 'tb', orders: x.orders }).then(j => say('Taobao: บันทึก ' + j.saved + ' ออเดอร์ (หน้านี้)')).catch(e => say(e.message, 1)); }, () => { });
        }
      } catch (e) { }
      return p;
    };
    wrapped.__it = 1; m.request = wrapped; P.tbOrig = orig;
    return true;
  }
  function tbRequest(page) {
    const t = P.tbTpl || { api: 'mtop.taobao.order.queryboughtlistV2', v: '1.0', type: 'post', dataType: 'json', ecode: 0,
      data: { tabCode: 'all', page: 1, OrderType: 'OrderList', appName: 'tborder', appVersion: '3.0', condition: '{"directRouteToTm2Scene":"1"}', __needlessClearProtocol__: true } };
    const o = JSON.parse(JSON.stringify(t));
    if (typeof o.data === 'string') { const d = JSON.parse(o.data); d.page = page; o.data = JSON.stringify(d); } else { o.data = Object.assign({}, o.data, { page }); }
    if (/^get$/i.test(o.type || '')) o.type = 'post';
    const fn = P.tbOrig || W.lib.mtop.request;
    return fn.call(W.lib.mtop, o);
  }
  async function runTaobao(force) {
    for (let i = 0; i < 60 && !hookMtop(); i++) await sleep(500);
    if (!W.lib || !W.lib.mtop) return say('ไม่พบ mtop ของ Taobao', 1);
    const d = await due(force); if (!d) return;
    await sleep(4000); // รอหน้าเว็บโหลดหน้าแรกก่อน (จะได้รูปแบบคำขอจริง)
    const days = d.first ? 90 : 30, cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    P.busy = true; let total = 0;
    try {
      for (let page = 1; page <= 40; page++) {
        say('Taobao: กำลังดึงหน้า ' + page + ' (ย้อนหลัง ' + days + ' วัน)…');
        let r; try { r = await tbRequest(page); } catch (e) { say('Taobao: ดึงไม่ได้ – ' + ((e && e.ret && e.ret[0]) || e), 1); GM_setValue('run_tb', 0); return; }
        const x = tbParse(r && r.data);
        if (!x.orders.length) break;
        const keep = x.orders.filter(o => !o.created || String(o.created).slice(0, 10) >= cut);
        if (keep.length) total += (await post({ action: 'tb', orders: keep })).saved;
        if (keep.length < x.orders.length) break;
        await sleep(2000 + Math.random() * 1500);
      }
      await post({ action: 'tb', orders: [], full: 1 });
      say('Taobao: บันทึกแล้ว ' + total + ' ออเดอร์ · ' + new Date().toLocaleTimeString('th-TH').slice(0, 5));
    } catch (e) { say('Taobao: ' + e.message, 1); GM_setValue('run_tb', 0); }
    finally { P.busy = false; }
  }

  /* ======================= Momo Cargo ======================= */
  const RECENT_DONE_DAYS = 60; // สถานะ "จัดส่งให้แล้ว" มีเป็นพันรายการ → ส่งเฉพาะ PO ที่สร้างใน 60 วัน
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
  async function runMomo(force) {
    if (!/\/import-order/.test(location.pathname)) return;
    const d = await due(force); if (!d) return;
    await sleep(3000);
    for (const lab of MOMO_TABS) {
      const a = [...document.querySelectorAll('a')].find(e => (e.innerText || '').trim().replace(/\s+/g, ' ').replace(/\s*[\d.,]+K?$/, '') === lab);
      if (!a) continue;
      say('Momo: กำลังอ่าน "' + lab + '"…');
      a.click();
      await sleep(lab === 'จัดส่งให้แล้ว' ? 9000 : 5000);
    }
    await sleep(3500); clearTimeout(P.momoT); await flushMomo(true);
  }

  /* ---------- เริ่ม ---------- */
  function run(force) {
    if (/taobao/.test(HOST)) runTaobao(force); else runMomo(force);
  }
  if (/momocargo/.test(HOST)) {
    hookXhr();
    // แอป Momo เปลี่ยนหน้าแบบ SPA → เช็กทุก 10 นาที
    const start = () => { run(false); setInterval(() => run(false), 10 * 60e3); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start();
  } else {
    const iv = setInterval(() => { if (hookMtop()) clearInterval(iv); }, 30);
    setTimeout(() => clearInterval(iv), 30000);
    const start = () => { run(false); setInterval(() => run(false), 15 * 60e3); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start();
  }
})();
