// ==UserScript==
// @name         Taobao + Momo Cargo → Import Tracker
// @namespace    import-tracker
// @version      3.4
// @description  ดึงออเดอร์ Taobao (เลขพัสดุจีน + สินค้า) และสถานะ Momo Cargo ส่งเข้า Import Tracker อัตโนมัติ · อ่านอย่างเดียว ไม่กดยืนยัน/ซื้อ/จ่าย
// @match        https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm*
// @match        https://market.m.taobao.com/app/dinamic/pc-trade-logistics/*
// @match        https://www.momocargo.com/*
// @match        https://momocargo.com/*
// @match        https://item.taobao.com/*
// @match        https://detail.tmall.com/*
// @match        https://*.taobao.com/*
// @match        https://*.tmall.com/*
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
  const LOADED = Date.now();   // แท็บเบื้องหลังที่เปิดนาน Chrome จะหน่วงตัวจับเวลา → ดึงอัตโนมัติจะโหลดหน้าใหม่ก่อนเสมอ (ดึงเร็ว)
  const cfg = () => ({ url: GM_getValue('it_url', ''), token: GM_getValue('it_token', '') });

  GM_registerMenuCommand('⚙️ ตั้งค่า Import Tracker', () => {
    const u = prompt('URL ของเว็บแอป (ลงท้าย /exec)', cfg().url); if (u === null) return;
    const t = prompt('TOKEN (จาก setup() ใน Apps Script)', cfg().token); if (t === null) return;
    GM_setValue('it_url', u.trim()); GM_setValue('it_token', t.trim());
    post({ action: 'ping' }).then(() => alert('✅ เชื่อมต่อได้')).catch(e => alert('❌ ' + e.message));
  });
  GM_registerMenuCommand('🔄 ดึงข้อมูลตอนนี้', () => run());
  if (/taobao/.test(location.hostname)) GM_registerMenuCommand('📚 Taobao: ดึงเต็ม 30 วัน (ไม่หยุดกลางทาง)', () => runTaobao(true));
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

  /* ================= 🏪 หน้าสินค้า / หน้าร้าน Taobao: ปุ่ม "เพิ่มร้านนี้เข้าระบบ" =================
   * อ่านอย่างเดียว: ชื่อร้าน (จีน) · ลิงก์ร้าน · โลโก้ · (หน้าสินค้า) รหัส/ชื่อ/ราคาสินค้า → ส่งให้ Import Tracker เพิ่มลงชีต Dealer + DealerList ของ POS
   * ไม่กดซื้อ ไม่ใส่ตะกร้า ไม่ส่งข้อความหาร้าน */
  const ORIG_PAGE = /buyertrade\.taobao\.com\/trade\/itemlist\/list_bought_items|market\.m\.taobao\.com\/app\/dinamic\/pc-trade-logistics|momocargo\.com/;
  if (!ORIG_PAGE.test(location.href)) {
    const isItem = /^(item\.taobao\.com|detail\.tmall\.com)$/.test(HOST) && /[?&]id=\d+/.test(location.search);
    // หน้าร้าน: shopNNNN.taobao.com · โดเมนร้าน เช่น dgwxdz.taobao.com (ร้านเดียวกัน) · xxx.world.taobao.com · xxx.tmall.com
    const SVC = /^(www|s|buyertrade|trade|cart|buy|login|i|h5|m|market|favorite|item|detail|pages|list|world|rate|refund\d*|consumeprod|ai|guang|huodong|pub|wuliu|myseller|seller|fuwu|ishop|uland|tb|g|gw|img|gtms\d*|o|tbc|qn|sell|scm)\./;
    const isShop = /^shop\d+\.taobao\.com$/.test(HOST) || /\.world\.taobao\.com$/.test(HOST) || (/\.tmall\.com$/.test(HOST) && !/^(detail|buy|cart|www|login|pages|list|s)\./.test(HOST))
      || (/^[a-z0-9-]+\.taobao\.com$/.test(HOST) && !SVC.test(HOST));
    if (HOST === 'cart.taobao.com' || isItem) dupGuard(isItem);
    if (isItem || isShop) shopCapture(isItem);
    return;
  }
  /* 🛒 กันสั่งซ้ำ: หน้าตะกร้า + หน้าสินค้า → เทียบรุ่นสินค้า (เช่น L7812CV, IRFP150N) กับที่สั่งไปแล้วใน 60 วัน (Import Tracker) → ป้ายเตือนสีแดง
   * อ่านอย่างเดียว ไม่แตะตะกร้า/คำสั่งซื้อ */
  function dupGuard(isItem) {
    const esc2 = t => String(t || '').replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
    const NOISE = /^(TO\d+[A-Z]?|DIP\d+|SOP\d+|SOT\d+|SMD\d*|QFN\d+|88VIP|TH\d*|\d+(\.\d+)?(V|A|MA|W|KW|K|R|UF|NF|PF|MM|CM|M|MAH|HZ|KHZ|MHZ|PCS|PIN|P|G|KG|C|DB|CH|X|AWG|OHM)|\d+X\d+.*|20\d\d|\d+)$/;
    const toks = t => {
      const out = new Set();
      String(t || '').toUpperCase().replace(/[（(【\[\]）)】,，、\/|+]/g, ' ').split(/\s+/).forEach(w => {
        (w.match(/[A-Z0-9][A-Z0-9.\-_]{2,}/g) || []).forEach(x => {
          [x].concat(/-/.test(x) ? [x.split('-')[0]] : []).forEach(y => {   // L7808CV-DG → L7808CVDG + L7808CV
            const k = y.replace(/[.\-_]/g, ''); if (k.length < 5 || !/[A-Z]/.test(k) || !/\d/.test(k) || NOISE.test(k)) return; out.add(k);
          });
        });
      });
      return out;
    };
    let idx = null;
    const load = async () => {
      const key = 'itBought', c = (() => { try { return JSON.parse(GM_getValue(key, '') || 'null'); } catch (e) { return null; } })();
      if (c && Date.now() - c.at < 15 * 60000) return c.items;
      try { const r = await post({ action: 'bought' }); GM_setValue(key, JSON.stringify({ at: Date.now(), items: r.items || [] })); return r.items || []; }
      catch (e) { return c ? c.items : []; }
    };
    const build = items => { const m = {}; items.forEach(it => toks(it.t + ' ' + it.s).forEach(k => (m[k] = m[k] || []).push(it))); return m; };
    const css = 'display:block;margin:4px 0;padding:4px 8px;border-radius:6px;background:#fff1f0;border:1px solid #f5222d;color:#a8071a;font:600 12px/1.45 system-ui,sans-serif;white-space:normal';
    const badge = hits => {
      const seen = {}, rows = hits.filter(h => { const k = h.o + h.t; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 4);
      const d = document.createElement('div'); d.className = 'it-dup'; d.style.cssText = css;
      d.innerHTML = '⚠️ สั่งแล้ว (กันสั่งซ้ำ): ' + rows.map(h => '<div style="font-weight:500;color:#5c0011">• ' + esc2(h.d.slice(5)) + ' · ' + esc2(h.shop) + ' · ×' + h.q + ' · ¥' + h.p + ' · ' + esc2(h.st) +
        '<br><span style="color:#888">' + esc2(h.t.slice(0, 60)) + (h.s ? ' 【' + esc2(h.s.slice(0, 30)) + '】' : '') + '</span></div>').join('');
      return d;
    };
    const match = title => { const hits = []; toks(title).forEach(k => (idx[k] || []).forEach(h => hits.push(h))); return hits; };
    const scan = () => {
      if (!idx) return;
      if (isItem) {
        if (document.querySelector('.it-dup')) return;
        const h1 = document.querySelector('h1') || document.querySelector('[class*="mainTitle"]'), title = (h1 && h1.textContent) || document.title;
        const hits = match(title); if (!hits.length) return;
        const b = badge(hits); b.style.cssText += ';position:fixed;left:12px;bottom:12px;z-index:2147483646;max-width:420px;box-shadow:0 4px 14px rgba(0,0,0,.2)';
        document.body.appendChild(b); return;
      }
      document.querySelectorAll('a[href*="item.htm"], a[href*="detail.tmall"]').forEach(a => {
        if (a.dataset.itDup) return; const t = (a.textContent || '').trim(); if (t.length < 8) return;
        a.dataset.itDup = '1'; const hits = match(t); if (!hits.length) return;
        a.insertAdjacentElement('afterend', badge(hits));
      });
    };
    load().then(items => { idx = build(items); scan(); let tm = 0; new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(scan, 600); }).observe(document.documentElement, { childList: true, subtree: true }); });
  }
  function shopCapture(isItem) {
    const uni = s => { try { return JSON.parse('"' + String(s).replace(/"/g, '\\"') + '"'); } catch (e) { return String(s); } };
    const abs = u => { u = String(u || '').trim(); if (!u) return ''; if (u.startsWith('//')) u = 'https:' + u; return /^https?:\/\//.test(u) ? u.replace(/^http:/, 'https:') : ''; };
    const shopRoot = u => { const m = /^https?:\/\/([^\/?#]+)/i.exec(abs(u)); return m && /taobao\.com$|tmall\.com$/.test(m[1]) && !/^(item|detail|s|www|buy|cart|login)\./.test(m[1]) ? 'https://' + m[1].replace(/^www\./, '') + '/' : ''; };
    function read() {
      const html = document.documentElement.innerHTML.slice(0, 3e6), pick = re => { const m = re.exec(html); return m ? uni(m[1]) : ''; };
      const x = { cn: pick(/"shopName"\s*:\s*"([^"]{1,80})"/), url: shopRoot(pick(/"shopUrl"\s*:\s*"([^"]+)"/)), logo: abs(pick(/"shopIcon"\s*:\s*"([^"]+)"/) || pick(/"shopLogo"\s*:\s*"([^"]+)"/)) };
      // DOM: ลิงก์ไปหน้าร้าน (shopNNN.taobao.com / xxx.world.taobao.com / xxx.tmall.com) ที่มีชื่อร้าน + รูปโลโก้
      if (!x.url || !x.cn) {
        const as = Array.from(document.querySelectorAll('a[href]')).filter(a => shopRoot(a.href) && !/item\.htm|search|category/.test(a.href));
        const a = as.find(a => /[\u3400-\u9fff]/.test(a.textContent || '')) || as[0];
        if (a) { if (!x.url) x.url = shopRoot(a.href); const t = (a.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s*[>›]$/, '');
          if (!x.cn && t && t.length <= 40) x.cn = t;
          if (!x.logo) { const box = a.closest('div') || a; const im = (box.parentElement || box).querySelector('img'); if (im) x.logo = abs(im.currentSrc || im.src); } }
      }
      if (!x.url && !isItem) x.url = 'https://' + HOST + '/';
      // รหัสร้าน Taobao (shopId) = ตัวตนถาวรของร้าน (ชื่อ/โลโก้/โดเมนร้านเปลี่ยนได้) · ลิงก์ทุกแบบของร้านนี้ → ส่งไปให้ระบบจับคู่ร้านเดิม
      const hs = /^shop(\d+)\./.exec(HOST);
      x.shopId = (!isItem && hs ? hs[1] : '') || pick(/"shopId"\s*:\s*"?(\d{4,})/) || pick(/[?&]shopId=(\d{4,})/) || pick(/shop_id\s*[:=]\s*"?(\d{4,})/) || (hs ? hs[1] : '');
      const al = new Set([x.url]); if (!isItem) al.add('https://' + HOST + '/'); if (x.shopId) al.add('https://shop' + x.shopId + '.taobao.com/');
      x.aliases = Array.from(al).filter(Boolean);
      if (!x.cn && !isItem) { const t = document.title.split(/[-–|]/).map(s => s.trim()).filter(s => s && !/淘宝|天猫|首页|taobao|tmall/i.test(s)); x.cn = t[0] || ''; }
      if (isItem) {
        x.itemId = new URLSearchParams(location.search).get('id') || '';
        // ชื่อสินค้า: ใช้ชื่อแท็บก่อน (เช่น "EPCOS 0.027uf …-淘宝网") · ช่อง "title" ในหน้าเว็บมักเป็นหัวข้ออื่น เช่น 宝贝描述
        const tt = document.title.replace(/\s*[-–|]\s*(淘宝网|淘宝|天猫|tmall\.com|tmall).*$/i, '').trim();
        x.title = (tt.length > 4 ? tt : ((document.querySelector('h1') || {}).textContent || pick(/"title"\s*:\s*"([^"]{4,200})"/))).replace(/\s+/g, ' ').trim().slice(0, 150);
        const pm = /[¥￥]\s*(\d+(?:\.\d+)?)/.exec((document.body && document.body.innerText || '').slice(0, 20000)); x.cny = pm ? +pm[1] : 0;
        x.itemUrl = 'https://item.taobao.com/item.htm?id=' + x.itemId;
      }
      return x;
    }
    function ui() {
      if (document.getElementById('itShopBtn')) return;
      const b = document.createElement('button'); b.id = 'itShopBtn'; b.textContent = '➕ เพิ่มร้านนี้เข้าระบบ';
      b.style.cssText = 'position:fixed;right:12px;bottom:56px;z-index:2147483646;background:#d9480f;color:#fff;border:0;border-radius:999px;padding:9px 16px;font:600 14px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      b.onclick = panel; document.body.appendChild(b);
    }
    function panel() {
      const x = read(), old = document.getElementById('itShopPanel'); if (old) old.remove();
      const d = document.createElement('div'); d.id = 'itShopPanel';
      d.style.cssText = 'position:fixed;right:12px;bottom:104px;z-index:2147483647;width:380px;max-width:92vw;max-height:calc(100vh - 130px);overflow:auto;background:#fff;color:#1f2328;border:1px solid #ddd;border-radius:12px;padding:12px;font:13px/1.5 sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)';
      const inp = (id, v, ph) => '<input id="' + id + '" value="' + String(v || '').replace(/"/g, '&quot;') + '" placeholder="' + ph + '" style="width:100%;box-sizing:border-box;padding:6px 8px;margin:3px 0;border:1px solid #ccc;border-radius:6px;font:inherit">';
      const sBtn = (id, t, title) => '<button id="' + id + '" title="' + (title || '') + '" style="flex:0 0 auto;padding:6px 10px;border:1px solid #d9480f;background:#fff;color:#d9480f;border-radius:6px;cursor:pointer;font:600 13px sans-serif">' + t + '</button>';
      const bigBtn = (id, t, bg) => '<button id="' + id + '" style="padding:7px 14px;border:0;background:' + bg + ';color:#fff;border-radius:6px;cursor:pointer;font-weight:600">' + t + '</button>';
      const box = (c, bd) => 'margin-top:10px;padding:10px;border:2px solid ' + bd + ';border-radius:10px;background:' + c;
      d.innerHTML = '<div style="display:flex;align-items:center"><b style="font-size:14px;flex:1">🏪 Taobao → ระบบ POS</b><button id="itS_x" style="padding:4px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">ปิด</button></div>' +
        // ── กล่อง 1: ร้าน (ชื่อ/ลิงก์/โลโก้) ──
        '<div id="itS_shopBox" style="' + box('#fff', '#d9480f') + '"><b style="color:#d9480f">① ข้อมูลร้าน</b> <span style="color:#667;font-size:12px">ชีต Dealer + หน้าดีลเลอร์ POS</span>' +
        '<div style="display:flex;gap:8px;align-items:center;margin:6px 0">' + (x.logo ? '<img src="' + x.logo + '" style="width:44px;height:44px;object-fit:contain;border:1px solid #eee;border-radius:6px">' : '<span style="color:#b42318">ไม่พบโลโก้</span>') + '<div id="itS_match" style="flex:1;padding:6px 8px;background:#f6f8fa;border-radius:8px;color:#667">🔎 กำลังเช็กว่ามีร้านนี้ในระบบแล้วไหม…</div></div>' +
        '<div id="itS_pk" hidden>' + inp('itS_q', '', 'ค้นร้านเดิม: ชื่อไทย/จีน/รหัส D…') + '<div id="itS_ql" style="max-height:150px;overflow:auto"></div><a href="#" id="itS_new" style="font-size:12px">หรือ เพิ่มเป็นร้านใหม่ (ไม่ทับร้านไหน)</a></div>' +
        'ชื่อร้าน (จีน)' + inp('itS_cn', x.cn, '升业电子') + 'ชื่อร้าน (อังกฤษ) (ว่าง = ใช้ชื่อเดิม / ร้านใหม่แปลเป็นอังกฤษให้อัตโนมัติ)<div style="display:flex;gap:6px;align-items:center">' + inp('itS_th', '', 'ปล่อยว่างได้') + sBtn('itS_tr', '🔄 แปลใหม่', 'แปลชื่อไทยใหม่จากชื่อจีนด้านบน') + '</div>' + 'ลิงก์ร้าน' + inp('itS_url', x.url, 'https://shopXXXX.taobao.com/') +
        '<div style="color:#667;font-size:12px">อัปเดตร้าน = ชื่อร้าน (อังกฤษ) · ชื่อจีน · ลิงก์ · โลโก้ ตามช่องด้านบน · ช่องร้าน BP/BU/BZ ในชีต Product เปลี่ยนตามให้</div>' +
        '<div id="itS_msg" style="margin-top:4px;min-height:16px"></div><div style="text-align:right">' + bigBtn('itS_go', '💾 บันทึกร้าน', '#d9480f') + '</div></div>' +
        // ── กล่อง 2: ราคา + ลิงก์สินค้า (เฉพาะหน้าสินค้า) ──
        (isItem ? '<div id="itS_priceBox" style="' + box('#f5f9ff', '#2563eb') + '"><b style="color:#2563eb">② ราคา + ลิงก์สินค้า</b> <span style="color:#667;font-size:12px">ไม่แก้ข้อมูลร้าน</span>' +
          '<div id="itS_pshop" style="font-size:12px;color:#667;margin:2px 0 4px">ร้าน: รอเช็กร้าน…</div>' +
          'รหัส POS<div style="display:flex;gap:6px;align-items:center">' + inp('itS_sku', '', 'เช่น D100 หรือพิมพ์ชื่อ แล้วกด 🔎') + sBtn('itS_find', '🔎 หาสินค้า', 'หาสินค้าใน POS ที่ใช้ลิงก์นี้ / ค้นด้วยคำที่พิมพ์') + '</div>' +
          '<div id="itS_list" style="max-height:200px;overflow:auto"></div>' + 'ราคา ¥ ต่อชิ้น (ตามตัวเลือกที่เลือกอยู่)' + inp('itS_cny', x.cny || '', '0.15') +
          'ลิงก์สินค้า <span style="color:#667;font-size:12px">(เลือกตัวเลือกบนหน้าเว็บ → ลิงก์เปลี่ยนตาม skuId)</span>' + inp('itS_link', '', '') +
          '<div style="color:#667;font-size:12px">' + (x.title || '').slice(0, 70).replace(/</g, '&lt;') + '</div>' +
          '<div id="itS_pmsg" style="margin-top:4px;min-height:16px"></div><div style="text-align:right">' + bigBtn('itS_pgo', '💲 อัปเดตราคา + ลิงก์', '#2563eb') + '</div></div>' +
          '<div id="itS_newBox" style="' + box('#f3fbf5', '#137333') + '"><b style="color:#137333">③ เพิ่มเป็นสินค้าใหม่ในชีต Product</b> <span style="color:#667;font-size:12px">แถวว่างถัดไป · ยังไม่มีรหัส (ออกรหัสที่แผนรหัส)</span>' +
          '<div style="font-size:12px;color:#667;margin:3px 0">ตัวเลือกที่เลือกอยู่: <b id="itS_var" style="color:#111">–</b></div>' +
          '<div style="display:flex;gap:6px;align-items:center;margin:2px 0">ราคา ¥ <input id="itS_ncny" type="number" min="0" step="any" style="width:90px;padding:6px;border:1px solid #ccc;border-radius:6px">' +
          '<button id="itS_nreset" title="ใช้ราคาตามตัวเลือกบนหน้าเว็บ" style="padding:5px 8px;border:1px solid #137333;background:#fff;color:#137333;border-radius:6px;cursor:pointer">↺ ราคาหน้าเว็บ</button>' +
          '<span id="itS_nhint" style="color:#667;font-size:12px">ขายเป็นแพค → แก้ราคาเองได้</span></div>' +
          '<div style="font-size:12px;color:#667;word-break:break-all">ลิงก์: <span id="itS_nlink">–</span></div>' +
          'ชื่อเต็มสินค้า (J) <span style="color:#667;font-size:12px">แก้ได้</span><textarea id="itS_nname" rows="3" style="width:100%;box-sizing:border-box;padding:6px 8px;margin:3px 0;border:1px solid #ccc;border-radius:6px;font:13px sans-serif"></textarea>' +
          'ชื่อย่อ (X)' + inp('itS_nshort', '', 'เช่น LM293P TI') +
          'หมวดหมู่ (R / S / T) <span id="itS_cmsg" style="color:#667;font-size:12px">กำลังโหลดหมวด…</span><div style="display:flex;gap:4px">' +
            ['itS_c1', 'itS_c2', 'itS_c3'].map(id => '<select id="' + id + '" style="flex:1;min-width:0;padding:6px 4px;border:1px solid #ccc;border-radius:6px;background:#fff;font:13px sans-serif"></select>').join('') + '</div>' +
          '<div style="display:flex;gap:4px;margin-top:4px;align-items:center;font-size:12px">' + [['itS_nw', 'น้ำหนัก ก.'], ['itS_nd1', 'กว้าง ซม.'], ['itS_nd2', 'ยาว ซม.'], ['itS_nd3', 'สูง ซม.']].map(a => '<input id="' + a[0] + '" type="number" min="0" step="any" placeholder="' + a[1] + '" style="flex:1;min-width:0;padding:6px;border:1px solid #ccc;border-radius:6px">').join('') + '</div>' +
          '<div id="itS_nmsg" style="margin-top:4px;min-height:16px"></div><div style="text-align:right">' + bigBtn('itS_ngo', '➕ เพิ่มสินค้าใหม่', '#137333') + '</div></div>' : '');
      document.body.appendChild(d);
      const $ = id => document.getElementById(id);
      const say2 = (el, t, bad) => { const m = $(el); if (!m) return; m.style.color = bad ? '#b42318' : '#137333'; m.textContent = t; };
      const msg = (t, bad) => say2('itS_msg', t, bad), pmsg = (t, bad) => say2('itS_pmsg', t, bad);
      $('itS_x').onclick = () => { clearInterval(tick); d.remove(); };
      const esc2 = t => String(t || '').replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
      const thOf = sp => String((sp && sp.th) || '').split(/\s*·\s*/).filter(t => t && !/[㐀-鿿]/.test(t))[0] || '';
      // ลิงก์สินค้า: id + skuId ปัจจุบันในแถบที่อยู่ (Taobao เปลี่ยน skuId ในลิงก์เมื่อกดเลือกตัวเลือก) · แก้เองได้ (แก้แล้วไม่ทับ)
      const curLink = () => { const q = new URLSearchParams(location.search), sk = q.get('skuId') || q.get('skuid') || ''; return 'https://item.taobao.com/item.htm?id=' + x.itemId + (sk ? '&skuId=' + sk : ''); };
      let linkEdited = false, tick = 0;
      if (isItem) { $('itS_link').value = curLink(); $('itS_link').oninput = () => { linkEdited = true; };
        tick = setInterval(() => { if (!document.body.contains(d)) return clearInterval(tick); if (!linkEdited && $('itS_link').value !== curLink()) $('itS_link').value = curLink(); }, 800); }
      // ── ร้าน: เช็กร้านเดิม → เจอ = อัปเดตร้านนั้น · ไม่เจอ = เพิ่มใหม่ หรือค้นเลือกร้านเดิมที่จะทับ ──
      let target = '', shops = [], matchTh = '';
      const hd = (sp, by) => (sp.logo ? '<img src="' + esc2(sp.logo) + '" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:4px">' : '') + '<b>' + esc2(sp.id) + '</b> ' + esc2(thOf(sp) || sp.th) + (by ? ' <span style="color:#667;font-size:12px">(' + esc2(by) + ')</span>' : '');
      const setTarget = (id, sp, by) => { target = id; matchTh = thOf(sp);
        const M = $('itS_match'); if (M) { M.style.background = id ? '#ecfdf3' : '#fff7ed'; M.style.color = '#1f2328';
          M.innerHTML = (id ? '✅ ร้านเดิม: ' + hd(sp, by) : '🆕 ยังไม่มีร้านนี้ในระบบ') + '<div style="font-size:12px"><a href="#" id="itS_chg">' + (id ? 'ไม่ใช่ร้านนี้? เปลี่ยนร้าน' : 'เป็นร้านเดิมที่เปลี่ยนชื่อ/โลโก้? เลือกร้าน') + '</a></div>';
          $('itS_chg').onclick = e => { e.preventDefault(); $('itS_pk').hidden = !$('itS_pk').hidden; if (!$('itS_pk').hidden) $('itS_q').focus(); }; }
        if (id && !$('itS_th').value) $('itS_th').value = matchTh;
        $('itS_go').textContent = id ? '💾 อัปเดตร้าน ' + id : '💾 เพิ่มร้านใหม่';
        const P = $('itS_pshop'); if (P) P.innerHTML = id ? 'ร้าน: ' + hd(sp) : '<span style="color:#b42318">ร้านนี้ยังไม่อยู่ในระบบ – กด 💾 เพิ่มร้านใหม่ ในกล่อง ① ก่อน</span>';
        const pg = $('itS_pgo'); if (pg) { pg.disabled = !id; pg.style.opacity = id ? 1 : .5; } };
      const listShops = q => { const L = $('itS_ql'); if (!L) return; const k = String(q || '').toLowerCase().trim();
        const hit = k ? shops.filter(sp => (sp.id + ' ' + sp.th + ' ' + sp.cn + ' ' + sp.url).toLowerCase().indexOf(k) >= 0).slice(0, 30) : [];
        L.innerHTML = hit.map((sp, i) => '<div data-s="' + i + '" style="display:flex;gap:6px;align-items:center;padding:4px;border-bottom:1px dashed #ddd;cursor:pointer">' + (sp.logo ? '<img src="' + esc2(sp.logo) + '" style="width:26px;height:26px;object-fit:contain">' : '') + '<span><b>' + esc2(sp.id) + '</b> ' + esc2(sp.th) + (sp.cn ? ' · ' + esc2(sp.cn) : '') + '</span></div>').join('') || (k ? '<div style="color:#667">ไม่พบ</div>' : '');
        L.querySelectorAll('[data-s]').forEach(el => el.onclick = () => { const sp = hit[+el.dataset.s]; $('itS_th').value = ''; setTarget(sp.id, sp, 'เลือกเอง'); L.innerHTML = ''; $('itS_q').value = ''; $('itS_pk').hidden = true; }); };
      $('itS_q').oninput = () => listShops($('itS_q').value);
      $('itS_new').onclick = e => { e.preventDefault(); $('itS_th').value = ''; setTarget('', null); $('itS_pk').hidden = true; };
      post({ action: 'findShop', cn: x.cn, url: x.url, shopId: x.shopId, aliases: x.aliases }).then(r => {
        shops = r.shops || []; if (r.match && r.match.id) setTarget(r.match.id, r.match, r.match.by); else setTarget('', null);
      }).catch(e => { const M = $('itS_match'); if (M) M.innerHTML = '⚠️ เช็กร้านเดิมไม่ได้: ' + esc2(e.message) + ' (ถ้าเพิ่งอัปเดต Import Tracker ให้ Deploy New version ก่อน)'; });
      $('itS_tr').onclick = async () => { const cn = $('itS_cn').value.trim(); if (!cn) return msg('ใส่ชื่อร้านภาษาจีนก่อน', true);
        $('itS_tr').disabled = true; $('itS_tr').textContent = 'กำลังแปล…';
        try { const r = await post({ action: 'translate', text: cn }); if (r.t) { $('itS_th').value = r.t; msg('แปลเป็นอังกฤษแล้ว – แก้ได้ก่อนกดบันทึก'); } else msg('แปลไม่ได้' + (r.err ? ': ' + r.err : ''), true); }
        catch (e) { msg('❌ ' + e.message, true); }
        $('itS_tr').disabled = false; $('itS_tr').textContent = '🔄 แปลใหม่'; };
      if (!x.cn || !x.url) msg('อ่านชื่อ/ลิงก์ร้านจากหน้านี้ได้ไม่ครบ – กรอกเอง หรือเปิดหน้าร้าน (กดปุ่ม 进店) แล้วกดปุ่มอีกครั้ง', true);
      // ① บันทึกร้านอย่างเดียว (ไม่ส่งราคา)
      $('itS_go').onclick = async () => {
        const body = { action: 'addShop', cn: $('itS_cn').value.trim(), thai: $('itS_th').value.trim(), url: $('itS_url').value.trim(), logo: x.logo || '', page: location.href.slice(0, 300),
          shopId: x.shopId || '', aliases: x.aliases || [], target, replace: !!target };
        if (!body.cn) return msg('ใส่ชื่อร้านภาษาจีนก่อน', true);
        $('itS_go').disabled = true; msg('กำลังบันทึก… (~5–15 วิ)');
        try {
          const r = await post(body);
          msg((r.existed ? '✅ อัปเดตร้าน ' + (r.dealerId || '') + (r.logoDone ? ' · ' + r.logoDone : '') + (r.renamed ? ' · ' + r.renamed : '') + (r.relinked ? ' · เปลี่ยนช่องร้านในชีต Product ' + r.relinked + ' ช่อง' : '') : '✅ เพิ่มร้านใหม่ ' + (r.dealerId || '')) + ' · ' + (r.thai || '') + (r.dealerRow ? ' (ชีต Dealer แถว ' + r.dealerRow + ')' : '') + (r.why ? ' · ⚠️ ' + r.why : ''), !!r.why);
          if (!r.existed && r.dealerId) setTarget(r.dealerId, { id: r.dealerId, th: r.thai, logo: '' }, 'เพิ่งเพิ่ม');
        } catch (e) { msg('❌ ' + e.message, true); }
        $('itS_go').disabled = false;
      };
      if (!isItem) return;
      // ② ราคา + ลิงก์สินค้า: หาสินค้าใน POS → เลือก → ราคา ¥ + ลิงก์ (skuId) → อัปเดต DealerPrice + ช่อง Dealer ในชีต Product
      async function find(q) {
        const L = $('itS_list'); if (!L) return; L.innerHTML = '<div style="color:#667;padding:4px 0">🔎 กำลังหา…</div>';
        try {
          const r = await post({ action: 'findItem', itemId: x.itemId, q: q || '' }), its = r.items || [];
          if (!its.length) { L.innerHTML = '<div style="color:#667;padding:4px 0">' + (q ? 'ไม่พบ "' + esc2(q) + '" ใน POS' : 'ยังไม่มีสินค้าใน POS ที่ใช้ลิงก์นี้ – พิมพ์รหัส/ชื่อแล้วกด 🔎') + '</div>'; return; }
          L.innerHTML = its.map((it, i) => '<div data-i="' + i + '" style="display:flex;gap:6px;align-items:center;padding:5px;border-bottom:1px dashed #cfdcf5;cursor:pointer">' +
            (it.img ? '<img src="' + esc2(it.img) + '" style="width:32px;height:32px;object-fit:cover;border-radius:4px">' : '') + '<div style="flex:1;min-width:0"><b>' + esc2(it.sku) + '</b> ' + esc2(String(it.name).slice(0, 45)) +
            '<div style="font-size:11.5px;color:#667">' + (it.prices.length ? 'ราคาเดิม ' + it.prices.map(p => esc2(p.src) + ' ¥' + p.cny + (p.date ? ' (' + p.date.slice(5) + ')' : '')).join(' · ') : esc2(it.why)) + '</div></div></div>').join('');
          L.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { const it = its[+el.dataset.i]; $('itS_sku').value = it.sku;
            L.querySelectorAll('[data-i]').forEach(e2 => e2.style.background = ''); el.style.background = '#dbe8ff';
            const o = it.prices[0]; pmsg('เลือก ' + it.sku + (o ? ' · ราคาเดิม ¥' + o.cny + ' → ใหม่ ¥' + ($('itS_cny').value || '?') : ' · ยังไม่มีราคาของร้านนี้') + ' · เช็กตัวเลือก/ลิงก์ แล้วกด 💲 อัปเดตราคา + ลิงก์'); });
        } catch (e) { L.innerHTML = '<div style="color:#b42318">❌ ' + esc2(e.message) + '</div>'; }
      }
      $('itS_find').onclick = () => find($('itS_sku').value.trim()); $('itS_sku').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find($('itS_sku').value.trim()); } }); if (x.itemId) find('');
      $('itS_pgo').onclick = async () => {
        const sku = $('itS_sku').value.trim(), cny = +$('itS_cny').value || 0, link = $('itS_link').value.trim();
        if (!target) return pmsg('ร้านนี้ยังไม่อยู่ในระบบ – เพิ่มร้านในกล่อง ① ก่อน', true);
        if (!sku) return pmsg('เลือก/ใส่รหัส POS ก่อน', true);
        if (!(cny > 0)) return pmsg('ใส่ราคา ¥ ก่อน', true);
        $('itS_pgo').disabled = true; pmsg('กำลังบันทึกราคา…');
        try {
          const r = await post({ action: 'updPrice', target, sku, cny, itemId: x.itemId, link, title: x.title });
          pmsg('✅ ' + (r.priceMsg || 'บันทึกแล้ว') + (r.why ? ' · ⚠️ ' + r.why : ''), !!r.why);
        } catch (e) { pmsg('❌ ' + e.message, true); }
        $('itS_pgo').disabled = false;
      };
      // ③ สินค้าใหม่: ตัวเลือกที่กดเลือกอยู่บนหน้าเว็บ (+ รูปของตัวเลือก) → แถวว่างถัดไปในชีต Product (ชื่อ · รูป · ลิงก์ · ร้าน/ราคา ¥) ผ่าน Import Tracker
      const selVar = () => {
        const out = [], seen = new Set(); let pic = '';
        document.querySelectorAll('[class*="isSelected"], [class*="selected"], [aria-checked="true"]').forEach(el => {
          if (!el.closest('[class*="sku" i], [class*="Sku"], [class*="prop" i]') || el.closest('#itShopPanel')) return;
          const t = (el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim();
          if (!t || t.length > 60 || seen.has(t) || /^(数量|已选|颜色分类|规格)/.test(t)) return;
          if ([...seen].some(v => v.indexOf(t) >= 0 || t.indexOf(v) >= 0)) return;
          seen.add(t); out.push(t);
          const im = el.querySelector('img'); if (im && !pic) pic = abs(im.currentSrc || im.src || '');
        });
        if (!pic) { const m = document.querySelector('[class*="mainPic"] img, [class*="MainPic"] img, #J_ImgBooth, meta[property="og:image"]'); pic = abs(m ? (m.content || m.currentSrc || m.src || '') : ''); }
        return { text: out.join(' / '), pic };
      };
      if (isItem) {
        let lastVar = null;
        // ราคาที่หน้าเว็บแสดงตามตัวเลือกที่เลือกอยู่ (ราคาหลักข้างชื่อสินค้า)
        const pagePrice = () => {
          for (const sel of ['[class*="highlightPrice"] [class*="text"]', '[class*="priceText"]', '[class*="Price--priceText"]', '[class*="price--"] [class*="text"]', '.tb-rmb-num', '#J_StrPrice .tb-rmb-num']) {
            const el = document.querySelector(sel); if (!el || el.closest('#itShopPanel')) continue;
            const m = /(\d+(?:\.\d+)?)/.exec(el.textContent || ''); if (m && +m[1] > 0) return +m[1];
          }
          const m = /[¥￥]\s*(\d+(?:\.\d+)?)/.exec((document.querySelector('main') || document.body).innerText.slice(0, 8000)); return m ? +m[1] : 0;
        };
        const syncPrice = force => { if (!force && $('itS_ncny').dataset.edited) return; const p = pagePrice(); if (p > 0) { $('itS_ncny').value = p; delete $('itS_ncny').dataset.edited; $('itS_nhint').textContent = 'ตามหน้าเว็บ · ขายเป็นแพค → แก้เองได้'; } };
        $('itS_ncny').oninput = () => { $('itS_ncny').dataset.edited = '1'; $('itS_nhint').textContent = '✏️ แก้เอง (ไม่เปลี่ยนตามตัวเลือก)'; };
        $('itS_nreset').onclick = () => syncPrice(true);
        let lastLink = '';
        const syncVar = () => {
          const lk = $('itS_link').value || curLink(); if (lk !== lastLink) { lastLink = lk; $('itS_nlink').textContent = lk; }
          const v = selVar(); if (v.text === lastVar) return; lastVar = v.text; $('itS_var').textContent = v.text || '(ยังไม่ได้เลือกตัวเลือก)';
          if (!$('itS_nname').dataset.edited) $('itS_nname').value = (v.text ? v.text + '\n' : '') + (x.title || '');
          setTimeout(() => syncPrice(false), 400);   // ราคาบนหน้าเว็บเปลี่ยนหลังกดตัวเลือกเล็กน้อย
        };
        $('itS_nname').oninput = () => { $('itS_nname').dataset.edited = '1'; };
        // หมวดจากชีต Product (จำในเครื่อง 1 ชม.) · dropdown 3 ชั้น กรองตามชั้นก่อนหน้า · "+ หมวดใหม่…" = พิมพ์เอง
        let CATS = []; const extra = { itS_c1: [], itS_c2: [], itS_c3: [] }, NEW = '\u0001new';
        const uniq = arr => [...new Set(arr.filter(Boolean))].sort((p, q) => p.localeCompare(q, 'th'));
        const fillCats = () => {
          const a = $('itS_c1').value, b = $('itS_c2').value;
          const lists = { itS_c1: uniq(CATS.map(c => c[0]).concat(extra.itS_c1)), itS_c2: uniq(CATS.filter(c => !a || c[0] === a).map(c => c[1]).concat(extra.itS_c2)),
            itS_c3: uniq(CATS.filter(c => (!a || c[0] === a) && (!b || c[1] === b)).map(c => c[2]).concat(extra.itS_c3)) };
          ['itS_c1', 'itS_c2', 'itS_c3'].forEach((id, k) => {
            const el = $(id), cur = el.value, L = lists[id];
            el.innerHTML = '<option value="">' + ['— หมวดหลัก —', '— หมวดย่อย 1 —', '— หมวดย่อย 2 —'][k] + '</option>' + L.map(v => '<option value="' + esc2(v) + '">' + esc2(v) + '</option>').join('') + '<option value="' + NEW + '">+ หมวดใหม่…</option>';
            el.value = L.indexOf(cur) >= 0 ? cur : '';
          });
        };
        ['itS_c1', 'itS_c2', 'itS_c3'].forEach(id => { $(id).onchange = () => {
          if ($(id).value === NEW) { const t = (prompt('ชื่อหมวดใหม่') || '').trim(); if (t) extra[id].push(t); fillCats(); if (t) $(id).value = t; }
          if (id === 'itS_c1') $('itS_c2').value = ''; if (id !== 'itS_c3') $('itS_c3').value = ''; fillCats(); }; });
        fillCats();
        (async () => {
          try { const c = JSON.parse(GM_getValue('itCats', 'null') || 'null'); if (c && c.cats && c.cats.length && Date.now() - c.at < 3600e3) { CATS = c.cats; $('itS_cmsg').textContent = ''; return fillCats(); } } catch (e) { }
          try { const r = await post({ action: 'cats' }); CATS = r.cats || []; if (CATS.length) GM_setValue('itCats', JSON.stringify({ at: Date.now(), cats: CATS })); $('itS_cmsg').textContent = CATS.length ? '' : '(ไม่พบหมวดในชีต)'; fillCats(); }
          catch (e) { $('itS_cmsg').textContent = '⚠️ โหลดหมวดไม่ได้: ' + e.message; }
        })();
        $('itS_ngo').onclick = async () => {
          const v = selVar(), name = $('itS_nname').value.trim(), cny = +$('itS_ncny').value || 0, nmsg = (t, bad) => say2('itS_nmsg', t, bad);
          if (!name) return nmsg('ใส่ชื่อสินค้าก่อน', true);
          if (!confirm('เพิ่มสินค้าใหม่ลงชีต Product?\n\n' + name.slice(0, 120) + (cny ? '\nราคา ¥' + cny : '') + (x.cn ? '\nร้าน ' + x.cn : ''))) return;
          $('itS_ngo').disabled = true; nmsg('กำลังเพิ่ม… (~10–20 วิ รวมใส่รูป)');
          try {
            const r = await post({ action: 'newProduct', itemId: x.itemId, variant: v.text, title: x.title, name, pic: v.pic, cny, shop: x.cn || '', link: $('itS_link').value.trim() || curLink(),
              short: $('itS_nshort').value.trim(), cat: ['itS_c1', 'itS_c2', 'itS_c3'].map(id => $(id).value === NEW ? '' : $(id).value),
              weight: +$('itS_nw').value || 0, dims: [+$('itS_nd1').value || 0, +$('itS_nd2').value || 0, +$('itS_nd3').value || 0] });
            if (r.dup) nmsg('⚠️ มีสินค้านี้ในชีตแล้ว แถว ' + r.dup + ' (ไม่ได้เพิ่มซ้ำ)', true);
            else nmsg('✅ เพิ่มแล้ว แถว ' + r.row + (r.dealer ? ' · ร้าน ' + r.dealer : '') + (r.catWhy ? ' · ⚠️ ' + r.catWhy : '') + ' → ไปออกรหัสที่ POS แผนรหัส', !!r.catWhy);
          } catch (e) { nmsg('❌ ' + e.message, true); }
          $('itS_ngo').disabled = false;
        };
      }
    }
    const go = () => { ui(); setTimeout(ui, 3000); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go, { once: true }) : go();
  }

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
  const TB_FULL_EVERY = 7 * 864e5;   // ดึงเต็ม 30 วันอัตโนมัติทุก 7 วัน · รอบอื่นดึงแบบเร็ว (หยุดเมื่อเจอแต่ออเดอร์ที่จบแล้ว)
  async function runTaobao(forceFull) {
    if (P.busy) return;
    const full = !!forceFull || !!GM_getValue('tb_resume_full', 0) || Date.now() - +GM_getValue('tb_fullAt', 0) > TB_FULL_EVERY;
    const cut = new Date(Date.now() - TB_DAYS * 864e5).toISOString().slice(0, 10);
    // หน้าเปิดค้างไว้นาน → โหลดหน้าใหม่ก่อน (ได้ข้อมูลล่าสุด) แล้วดึงต่อหลังโหลดเสร็จ
    const act = document.querySelector('.ant-pagination-item-active'), onFirst = !act || act.textContent.trim() === '1';
    if (!P.tbLast || !onFirst || Date.now() - P.tbLoadedAt > 3 * 60e3) {
      GM_setValue('tb_resume', Date.now()); GM_setValue('tb_resume_full', full ? 1 : 0); say('Taobao: โหลดหน้าใหม่ก่อนดึง…'); location.reload(); return;
    }
    GM_setValue('tb_resume_full', 0);
    P.busy = true; let total = 0, pages = 0, early = false;
    try {
      for (let page = 1; page <= TB_MAX_PAGES; page++) {
        const x = P.tbLast; pages = page;
        say('Taobao: ' + (full ? 'ดึงเต็ม' : 'ดึงเร็ว') + ' หน้า ' + page + '…');
        const keep = x.orders.filter(o => !o.created || String(o.created).slice(0, 10) >= cut);
        let r = null;
        if (keep.length) { r = await post({ action: 'tb', orders: keep }); total += r.saved; }
        if (keep.length < x.orders.length) break;
        // ดึงเร็ว: ทั้งหน้าเป็นออเดอร์ที่จบแล้วและไม่มีอะไรเปลี่ยน + ไม่มีออเดอร์ค้างที่เก่ากว่านี้ → หยุด
        if (!full && r && keep.length && r.settled >= keep.length && !r.openBefore) { early = true; break; }
        const next = document.querySelector('.ant-pagination-next');
        if (!next || next.classList.contains('ant-pagination-disabled') || next.getAttribute('aria-disabled') === 'true') break;
        await sleep(2000 + Math.random() * 1500);
        const seq = P.tbSeq;
        (next.querySelector('button,a') || next).click();
        if (!(await tbWaitNew(seq, 15000))) throw new Error('กดหน้าถัดไปแล้วไม่มีข้อมูลตอบกลับ (มีหน้ายืนยันตัวตนขึ้นมาหรือเปล่า?)');
      }
      if (full) { await post({ action: 'tb', orders: [], full: 1 }); GM_setValue('tb_fullAt', Date.now()); }
      say('Taobao: บันทึกแล้ว ' + total + ' ออเดอร์ · ' + pages + ' หน้า' + (early ? ' (หยุดเร็ว: ที่เหลือจบแล้ว)' : full ? ' (ดึงเต็ม)' : '') + ' · ' + new Date().toLocaleTimeString('th-TH').slice(0, 5));
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
      const r = await post({ action: 'hb', site: site(), ready, busy: P.busy, msg: P.busy || ready ? (P.msg || 'พร้อม') : why, ver: GM_info.script.version, age: Date.now() - LOADED });
      if (r.pull && ready && !P.busy) {
        if (r.auto && site() === 'momo' && Date.now() - LOADED > 3 * 60e3) { GM_setValue('momo_resume', Date.now()); say('Momo: ถึงรอบดึงอัตโนมัติ – โหลดหน้าใหม่ก่อน…'); location.reload(); return; }
        say((site() === 'tb' ? 'Taobao' : 'Momo') + ': ' + (r.auto ? 'ถึงรอบดึงอัตโนมัติ' : 'แอปสั่งดึง') + ' – เริ่ม…'); run().then(() => setTimeout(beat, 500));
      }
    } catch (e) { /* เน็ตหลุดชั่วคราว: รอบหน้าลองใหม่ */ }
  }
  if (/momocargo/.test(HOST)) {
    hookXhr();
    // เพิ่งโหลดหน้าใหม่เพราะถึงรอบดึงอัตโนมัติ → ดึงต่อเมื่อหน้าพร้อม
    if (Date.now() - +GM_getValue('momo_resume', 0) < 2 * 60e3) {
      GM_setValue('momo_resume', 0);
      (async () => { for (let i = 0; i < 90 && !readiness()[0]; i++) await sleep(1000); if (readiness()[0]) run(); else say('Momo: หน้าไม่พร้อม (ล็อกอินหรือยัง?)', 1); })();
    }
  }
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
