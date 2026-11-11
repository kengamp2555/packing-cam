// ==UserScript==
// @name         Taobao + Momo Cargo → Import Tracker
// @namespace    import-tracker
// @version      1.9
// @description  ดึงออเดอร์ Taobao (เลขพัสดุจีน + สินค้า) และสถานะ Momo Cargo ส่งเข้า Import Tracker อัตโนมัติ · อ่านอย่างเดียว ไม่กดยืนยัน/ซื้อ/จ่าย
// @match        https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm*
// @match        https://market.m.taobao.com/app/dinamic/pc-trade-logistics/*
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
  if (/momocargo/.test(location.hostname)) GM_registerMenuCommand('💱 อ่านเรทหยวนจากหน้านี้', () => { const v = readRate(); v ? sendRate(v, 'momo-manual', true) : say('ไม่พบข้อความ "เรทเงินหยวนวันนี้ ฿x/¥1" ในหน้านี้', 1); });

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
      tracks: [].concat.apply([], (o.cn_tracks || []).map(t => [].concat.apply([], (t.vendor_tracks || []).map(v => String(v.tracking || '').split(/[\s,;/]+/).filter((x, i, a) => x.replace(/[^0-9A-Z]/gi, '').length >= 6 && a.indexOf(x) === i).map(trk => ({
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
  const RECENT_DONE_DAYS = 45; // สถานะ "จัดส่งให้แล้ว" มีเป็นพันรายการ → ส่งเฉพาะ PO ที่สร้างใน 45 วัน (เผื่อออเดอร์ Taobao 30 วัน ที่เข้าโกดังทีหลัง)
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
      else if (/momocargo\.com/.test(this.__itU)) this.addEventListener('load', () => { try { if (P.lfWant && String(this.responseText || '').toUpperCase().indexOf(P.lfWant.toUpperCase()) >= 0) P.lfHit = true; } catch (e) { } });
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
    const went = await momoLostFound();
    const went2 = await momoRateFromMenu();
    if (went || went2) { await sleep(1200); location.href = '/import-order'; }
    } finally { P.busy = false; }
  }

  /* ---------- ศูนย์ตามหาสินค้า: ค้นเลขที่ตกหล่น (ร้านปิดรหัส S00*** → Momo ไม่รู้เจ้าของ) ---------- */
  const visible = e => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  // หา element ที่ข้อความตรง (เลือกตัวในสุด เช่น <a> ไม่ใช่ <div> ที่ห่อมันไว้)
  const byText = (sel, re) => { const c = [...document.querySelectorAll(sel)].filter(e => visible(e) && re.test((e.innerText || e.textContent || '').trim()));
    return c.find(e => !c.some(o => o !== e && e.contains(o))) || null; };
  function setInput(el, v) {
    const set = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set;
    set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pressEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));
    const f = el.closest('form'); if (f) { try { f.requestSubmit ? f.requestSubmit() : f.submit(); } catch (e) { } }
  }
  const lfInput = () => [...document.querySelectorAll('input')].filter(visible).find(i => !/taobao|tmall|1688|ลิงก์/i.test(i.placeholder || '') && /^(text|search|)$/.test(i.type || ''));
  async function momoLostFound() {
    let list = [];
    try { list = (await post({ action: 'missing' })).list || []; } catch (e) { return; }
    if (!list.length) { say('Momo: ดึงเสร็จ · ไม่มีเลขตกหล่นต้องค้น'); return false; }
    // ไปหน้า ค้นหา/ตามสินค้า ผ่านเมนูด้านซ้าย (ไม่เดา URL)
    let link = byText('a,li,span,div', /^ค้นหา\s*\/\s*ตามสินค้า$/);
    if (!link) { const g = byText('a,li,span,div', /^ศูนย์ตามหาสินค้า$/); if (g) { g.click(); await sleep(800); link = byText('a,li,span,div', /^ค้นหา\s*\/\s*ตามสินค้า$/); } }
    if (!link) { say('Momo: หาเมนู "ค้นหา/ตามสินค้า" ไม่เจอ – ข้ามการค้นศูนย์ตามหาสินค้า', 1); return false; }
    link.click(); await sleep(3000);
    const results = [];
    for (const trk of list) {
      const inp = lfInput(); if (!inp) { say('Momo: หาช่องค้นหาในศูนย์ตามหาสินค้าไม่เจอ', 1); break; }
      say('Momo: ค้นศูนย์ตามหาสินค้า ' + trk + ' (' + (results.length + 1) + '/' + list.length + ')…');
      P.lfHit = false; P.lfWant = trk;
      setInput(inp, trk); await sleep(300); pressEnter(inp);
      // รอจนหน้าผลค้นหาแสดงเลขที่ค้น (หัวผลค้นหาจะมีเลขนั้น) · ถ้าไม่ขึ้น ลองกดปุ่มค้นหาข้างช่อง
      const shown = () => (document.body.innerText || '').indexOf(trk) >= 0;
      let ok = false; for (let t = 0; t < 20 && !(ok = shown()); t++) await sleep(300);
      if (!ok) {
        const box = inp.closest('div,form'), btn = box && [...(box.parentElement || box).querySelectorAll('button,[role=button]')].filter(visible)[0];
        if (btn) { btn.click(); for (let t = 0; t < 20 && !(ok = shown()); t++) await sleep(300); }
      }
      await sleep(1500);
      const m = (document.body.innerText || '').match(/ผลการค้นหา\s*:?\s*(\d+)/);
      const n = ok && m ? +m[1] : null;
      if (n === null) { say('Momo: ค้นในศูนย์ตามหาสินค้าไม่สำเร็จ (หน้าไม่แสดงผล) – ข้าม', 1); break; }
      results.push({ tracking: trk, found: n > 0 });
      await sleep(1200 + Math.random() * 800);
    }
    P.lfWant = '';
    if (results.length) {
      try { await post({ action: 'momolf', results }); } catch (e) { }
      const f = results.filter(r => r.found).length;
      say('Momo: ดึงเสร็จ · ค้นศูนย์ตามหาสินค้า ' + results.length + ' เลข' + (f ? ' · 📍 พบ ' + f + ' กล่อง ดูในแอป' : ' · ไม่พบ'));
    }
    return true;
  }

  /* ---------- เรทหยวนวันนี้ของ Momo ("เรทเงินหยวนวันนี้: ฿5.22/¥1") ---------- */
  // อ่านแบบยืดหยุ่น: "เรทเงินหยวนวันนี้: แสดงกราฟ ฿5.22/¥1" · ขึ้นบรรทัดใหม่ได้ · ฿/THB/บาท · ¥/￥/หยวน
  function readRate() {
    const t = ((document.body && document.body.innerText) || '').replace(/\u00a0/g, ' ');
    const pats = [
      /เรท\s*(?:เงิน)?\s*หยวน[\s\S]{0,120}?(?:฿|THB|บาท)\s*([3-9](?:[.,]\d{1,4})?)\s*(?:\/|ต่อ)\s*(?:¥|￥|CNY|หยวน)?\s*1?/i,
      /(?:฿|THB)\s*([3-9][.,]\d{1,4})\s*\/\s*(?:¥|￥|CNY)\s*1/i,
      /(?:¥|￥)\s*1\s*=\s*(?:฿|THB)?\s*([3-9][.,]\d{1,4})/i
    ];
    for (const re of pats) { const m = t.match(re); if (m) { const v = +String(m[1]).replace(',', '.'); if (v > 3 && v < 10) return v; } }
    return 0;
  }
  async function sendRate(v, src, loud) {
    if (!v) return false;
    const k = new Date().toISOString().slice(0, 10) + ':' + v;
    if (GM_getValue('rate_sent', '') === k) { if (loud) say('Momo: เรทหยวนวันนี้ ฿' + v + '/¥ (บันทึกไว้แล้ว ✅)'); return true; }
    try { await post({ action: 'rate', rate: v, source: src }); GM_setValue('rate_sent', k); say('Momo: บันทึกเรทหยวนวันนี้ ฿' + v + '/¥ ✅'); return true; }
    catch (e) { say('Momo: บันทึกเรทไม่สำเร็จ – ' + e.message + (/unknown action/.test(e.message) ? ' (Apps Script ยังไม่ได้ทำให้ใช้งานได้เวอร์ชันใหม่)' : ''), 1); return false; }
  }
  // ตอนกดดึงทันที: เปิดหน้า "บริการ Alipay" ผ่านเมนู แล้วอ่านเรท
  async function momoRateFromMenu() {
    let v = readRate(); if (v) { await sendRate(v, 'momo-page', true); return false; }
    let link = byText('a,li,span,div', /^บริการ\s*Alipay$/);
    if (!link) { const g = byText('a,li,span,div', /^(บริการ\s*\/\s*)?ธุรกรรมฝั่งจีน$/); if (g) { g.click(); await sleep(800); link = byText('a,li,span,div', /^บริการ\s*Alipay$/); } }
    if (!link) { say('Momo: หาเมนู "บริการ Alipay" ไม่เจอ – ไม่ได้อ่านเรทหยวน', 1); return false; }
    say('Momo: อ่านเรทหยวนวันนี้…'); link.click();
    for (let t = 0; t < 20 && !(v = readRate()); t++) await sleep(400);
    if (v) await sendRate(v, 'momo-alipay', true);
    else say('Momo: เปิดหน้า Alipay แล้วแต่อ่านเรทหยวนไม่ได้ – กรอกเรทเองในแอป ⚙️ ได้', 1);
    return true;
  }

  /* ---------- หน้า 查看物流 (คุณเปิดเอง): อ่านเลขพัสดุที่หน้าแสดง → ผูกกับเลขออเดอร์ ---------- */
  if (/pc-trade-logistics/.test(location.pathname)) {
    const orderId = new URLSearchParams(location.search).get('orderId') || '';
    const readPkgs = () => {
      const lines = (document.body && document.body.innerText || '').split('\n').map(x => x.trim()).filter(Boolean), out = [];
      lines.forEach((l, i) => {
        if (l !== '复制' || i < 1) return;
        const parts = lines[i - 1].split(/\s+/), no = parts[parts.length - 1];
        if (/^[A-Z0-9-]{8,}$/i.test(no) && !out.some(p => p.mailNo === no)) out.push({ mailNo: no, cp: parts.length > 1 ? parts.slice(0, -1).join(' ') : (lines[i - 2] || '').slice(0, 20) });
      });
      return out;
    };
    (async () => {
      for (let t = 0; t < 40; t++) { await sleep(500); const pk = readPkgs(); if (pk.length) {
        try { const r = await post({ action: 'tbpkg', orderId, pkgs: pk }); say('Import Tracker: ผูกเลขพัสดุ ' + pk.map(p => p.mailNo).join(', ') + (r.saved ? ' ✅' : ' (มีอยู่แล้ว)')); }
        catch (e) { say(e.message, 1); }
        return; } }
      say('ไม่พบเลขพัสดุในหน้านี้', 1);
    })();
    return;
  }

  /* ---------- เริ่ม: รายงานสถานะให้แอปทุก 15 วิ · แอปกด "ดึงทันที" → ดึง ---------- */
  function run() { return /taobao/.test(HOST) ? runTaobao() : runMomo(); }
  function readiness() {
    if (/taobao/.test(HOST)) {
      if (/login/.test(location.hostname + location.pathname)) return [false, 'ยังไม่ได้ล็อกอิน Taobao'];
      if (/route_to=tm1/.test(location.search) || /旧版/.test((document.body && document.body.innerText || '').slice(0, 3000)) && !document.querySelector('.ant-pagination'))
        return [false, 'เป็นหน้า Taobao แบบเก่า → กดปุ่มส้ม 切换新版 ที่หน้า Taobao ครั้งเดียว'];
      return tbReady() ? [true, 'พร้อม'] : [false, 'หน้ายังโหลดไม่เสร็จ / ยังไม่ล็อกอิน'];
    }
    if (!/\/import-order/.test(location.pathname)) return [false, 'ไม่ได้อยู่หน้า รายการนำเข้า'];
    if (!momoTab('ถึงโกดังจีน')) return [false, 'หน้ายังโหลดไม่เสร็จ / ยังไม่ล็อกอิน'];
    return [true, 'พร้อม'];
  }
  async function beat() {
    if (!cfg().url || !cfg().token) return say('ยังไม่ได้ตั้งค่า: เมนู Tampermonkey → ⚙️ ตั้งค่า Import Tracker', 1);
    const [ready, why] = readiness();
    if (site() === 'momo' && !P.busy) { const v = readRate(); if (v) sendRate(v, 'momo-page'); }
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
