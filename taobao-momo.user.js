// ==UserScript==
// @name         Taobao + Momo Cargo → Import Tracker
// @namespace    import-tracker
// @version      2.3
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
    if (isItem || isShop) shopCapture(isItem);
    return;
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
      d.style.cssText = 'position:fixed;right:12px;bottom:104px;z-index:2147483647;width:360px;max-width:92vw;background:#fff;color:#1f2328;border:1px solid #ddd;border-radius:12px;padding:12px;font:13px/1.5 sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)';
      const inp = (id, v, ph) => '<input id="' + id + '" value="' + String(v || '').replace(/"/g, '&quot;') + '" placeholder="' + ph + '" style="width:100%;box-sizing:border-box;padding:6px 8px;margin:3px 0;border:1px solid #ccc;border-radius:6px;font:inherit">';
      d.innerHTML = '<b style="font-size:14px">🏪 เพิ่มร้านเข้าระบบ (ชีต Dealer + หน้าดีลเลอร์ POS)</b>' +
        '<div style="display:flex;gap:8px;align-items:center;margin:8px 0">' + (x.logo ? '<img src="' + x.logo + '" style="width:48px;height:48px;object-fit:contain;border:1px solid #eee;border-radius:6px">' : '<span style="color:#b42318">ไม่พบโลโก้</span>') + '<span style="color:#667">โลโก้ร้าน (ใช้เป็นรูปช่อง B)</span></div>' +
        '<div id="itS_match" style="margin:4px 0 6px;padding:8px;background:#f6f8fa;border-radius:8px;color:#667">🔎 กำลังเช็กว่ามีร้านนี้ในระบบแล้วไหม…</div>' +
        'ชื่อร้าน (จีน)' + inp('itS_cn', x.cn, '升业电子') + 'ชื่อไทย (ว่าง = ใช้ชื่อเดิม / แปลอัตโนมัติ)' + inp('itS_th', '', 'ปล่อยว่างได้') + 'ลิงก์ร้าน' + inp('itS_url', x.url, 'https://shopXXXX.taobao.com/') +
        (isItem ? '<div style="margin-top:6px;padding:8px;background:#fff7ed;border-radius:8px">ราคาสินค้านี้ (ไม่บังคับ) → อัปเดตราคาให้รหัส POS<br>รหัส POS' +
          '<div style="display:flex;gap:6px;align-items:center">' + inp('itS_sku', '', 'เช่น D100 หรือพิมพ์ชื่อ แล้วกด 🔎') + '<button id="itS_find" title="หาสินค้าใน POS ที่ใช้ลิงก์นี้ / ค้นด้วยคำที่พิมพ์" style="flex:0 0 auto;padding:6px 10px;border:1px solid #d9480f;background:#fff;color:#d9480f;border-radius:6px;cursor:pointer;font:600 13px sans-serif">🔎 หาสินค้า</button></div>' +
          '<div id="itS_list" style="max-height:200px;overflow:auto"></div>' + 'ราคา ¥ ต่อชิ้น (ตามตัวเลือกที่จะซื้อ)' + inp('itS_cny', x.cny || '', '0.15') +
          '<div style="color:#667;font-size:12px">' + (x.title || '').slice(0, 70) + '</div></div>' : '') +
        '<div id="itS_msg" style="margin-top:6px;min-height:18px"></div><div style="text-align:right;margin-top:6px"><button id="itS_x" style="padding:6px 12px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">ปิด</button> <button id="itS_go" style="padding:6px 14px;border:0;background:#d9480f;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">บันทึก</button></div>';
      document.body.appendChild(d);
      const $ = id => document.getElementById(id), msg = (t, bad) => { $('itS_msg').style.color = bad ? '#b42318' : '#137333'; $('itS_msg').textContent = t; };
      $('itS_x').onclick = () => d.remove();
      // 🔎 หาสินค้าใน POS: เปิดกล่องแล้วหาจากลิงก์นี้ให้เลย · พิมพ์คำ (รหัส/ชื่อ/รุ่น) แล้วกด 🔎 เพื่อค้นเพิ่ม
      async function find(q) {
        const L = $('itS_list'); if (!L) return; L.innerHTML = '<div style="color:#667;padding:4px 0">🔎 กำลังหา…</div>';
        try {
          const r = await post({ action: 'findItem', itemId: x.itemId, q: q || '' }), its = r.items || [];
          if (!its.length) { L.innerHTML = '<div style="color:#667;padding:4px 0">' + (q ? 'ไม่พบ "' + q + '" ใน POS' : 'ยังไม่มีสินค้าใน POS ที่ใช้ลิงก์นี้ – พิมพ์รหัส/ชื่อแล้วกด 🔎') + '</div>'; return; }
          L.innerHTML = its.map((it, i) => '<div data-i="' + i + '" style="display:flex;gap:6px;align-items:center;padding:5px;border-bottom:1px dashed #eadfd6;cursor:pointer">' +
            (it.img ? '<img src="' + it.img + '" style="width:32px;height:32px;object-fit:cover;border-radius:4px">' : '') + '<div style="flex:1;min-width:0"><b>' + it.sku + '</b> ' + String(it.name).replace(/</g, '&lt;').slice(0, 45) +
            '<div style="font-size:11.5px;color:#667">' + (it.prices.length ? 'ราคาเดิม ' + it.prices.map(p => p.src + ' ¥' + p.cny + (p.date ? ' (' + p.date.slice(5) + ')' : '')).join(' · ') : it.why) + '</div></div></div>').join('');
          L.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { const it = its[+el.dataset.i]; $('itS_sku').value = it.sku;
            L.querySelectorAll('[data-i]').forEach(e2 => e2.style.background = ''); el.style.background = '#ffe8d6';
            const old = it.prices[0]; msg(old ? 'เลือก ' + it.sku + ' · ราคาเดิม ¥' + old.cny + ' → ใหม่ ¥' + ($('itS_cny').value || '?') + ' (แก้ช่องราคาได้) แล้วกด บันทึก' : 'เลือก ' + it.sku + ' · ยังไม่มีราคาของลิงก์นี้ – บันทึกแล้วจะเพิ่มให้'); });
        } catch (e) { L.innerHTML = '<div style="color:#b42318">❌ ' + e.message + '</div>'; }
      }
      if (isItem) { $('itS_find').onclick = () => find($('itS_sku').value.trim()); $('itS_sku').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find($('itS_sku').value.trim()); } }); if (x.itemId) find(''); }
      // เช็กร้านเดิม: เจอ → บันทึก = อัปเดตโลโก้/ชื่อจีนของร้านเดิม · ไม่เจอ → เลือกร้านเดิมที่จะทับ หรือเพิ่มเป็นร้านใหม่
      let target = '', shops = [], matchTh = '';
      const esc2 = t => String(t || '').replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
      const thOf = sp => String((sp && sp.th) || '').split(/\s*·\s*/).filter(t => t && !/[\u3400-\u9fff]/.test(t))[0] || '';
      const upd = () => !!($('itS_upd') && $('itS_upd').checked);
      const goLbl = () => { $('itS_go').textContent = target ? (upd() ? '💾 อัปเดตร้าน ' + target : '💾 บันทึก (ร้าน ' + target + ')') : '💾 เพิ่มเป็นร้านใหม่'; };
      // เลือกร้านเดิม → ช่อง "อัปเดตข้อมูลร้าน": ชื่อไทย/ชื่อจีน/ลิงก์/โลโก้ ตามช่องด้านล่าง + ช่องร้าน BP/BU/BZ ในชีต Product เปลี่ยนตาม
      const setTarget = (id, label, sp) => { target = id; matchTh = thOf(sp);
        const t = $('itS_tgt'); if (t) t.innerHTML = id ? '✅ ร้านเดิม <b>' + esc2(label) + '</b> <a href="#" id="itS_untgt">ยกเลิก</a>' +
          '<label style="display:block;margin-top:4px;color:#1f2328"><input type="checkbox" id="itS_upd"' + (isItem ? '' : ' checked') + '> อัปเดตข้อมูลร้านเป็นตามช่องด้านล่าง (ชื่อไทย · ชื่อจีน · ลิงก์ · โลโก้) — ช่องร้าน BP/BU/BZ ในชีต Product เปลี่ยนตามให้</label>' : '';
        const u = $('itS_untgt'); if (u) u.onclick = e => { e.preventDefault(); setTarget('', ''); };
        const cb = $('itS_upd'); if (cb) cb.onchange = () => { if (cb.checked && !$('itS_th').value) $('itS_th').value = matchTh; goLbl(); };
        if (id && upd() && !$('itS_th').value) $('itS_th').value = matchTh;
        goLbl(); };
      const pickBox = () => '<div style="margin-top:6px">ถ้าเป็นร้านเดิมที่เปลี่ยนชื่อ/โลโก้ ให้ค้นแล้วเลือกร้านที่จะทับ:' + inp('itS_q', '', 'พิมพ์ชื่อไทย/จีน/รหัส D… เช่น เว่ยซิง') + '<div id="itS_ql" style="max-height:150px;overflow:auto"></div><div id="itS_tgt" style="margin-top:4px;color:#137333"></div></div>';
      const listShops = q => { const L = $('itS_ql'); if (!L) return; const k = String(q || '').toLowerCase().trim();
        const hit = k ? shops.filter(sp => (sp.id + ' ' + sp.th + ' ' + sp.cn + ' ' + sp.url).toLowerCase().indexOf(k) >= 0).slice(0, 30) : [];
        L.innerHTML = hit.map((sp, i) => '<div data-s="' + i + '" style="display:flex;gap:6px;align-items:center;padding:4px;border-bottom:1px dashed #ddd;cursor:pointer">' + (sp.logo ? '<img src="' + esc2(sp.logo) + '" style="width:26px;height:26px;object-fit:contain">' : '') + '<span><b>' + esc2(sp.id) + '</b> ' + esc2(sp.th) + (sp.cn ? ' · ' + esc2(sp.cn) : '') + '</span></div>').join('') || (k ? '<div style="color:#667">ไม่พบ</div>' : '');
        L.querySelectorAll('[data-s]').forEach(el => el.onclick = () => { const sp = hit[+el.dataset.s]; setTarget(sp.id, sp.id + ' ' + sp.th, sp); L.innerHTML = ''; }); };
      post({ action: 'findShop', cn: x.cn, url: x.url, shopId: x.shopId, aliases: x.aliases }).then(r => {
        shops = r.shops || []; const M = $('itS_match'); if (!M) return;
        if (r.match && r.match.id) { M.style.background = '#ecfdf3'; M.style.color = '#1f2328';
          M.innerHTML = '✅ มีร้านนี้แล้ว (' + esc2(r.match.by) + '): ' + (r.match.logo ? '<img src="' + esc2(r.match.logo) + '" style="width:22px;height:22px;object-fit:contain;vertical-align:middle"> ' : '') + '<b>' + esc2(r.match.id) + '</b> ' + esc2(r.match.th) + (r.match.leg ? '<div style="font-size:11.5px;color:#667;white-space:pre-line;margin-top:3px">ชีต Dealer ตอนนี้: ' + esc2(r.match.leg) + '</div>' : '') + pickBox().replace('ถ้าเป็นร้านเดิมที่เปลี่ยนชื่อ/โลโก้ ให้ค้นแล้วเลือกร้านที่จะทับ:', 'ไม่ใช่ร้านนี้? ค้นแล้วเลือกร้านที่ถูก:');
          setTarget(r.match.id, r.match.id + ' ' + r.match.th, r.match); }
        else { M.style.background = '#fff7ed'; M.style.color = '#1f2328'; M.innerHTML = '🆕 ไม่พบร้านนี้ในระบบ (เช็กจากลิงก์ร้าน' + (x.shopId ? ' · รหัสร้าน ' + x.shopId : '') + ' · ชื่อจีน)' + pickBox(); setTarget('', ''); }
        const q = $('itS_q'); if (q) q.oninput = () => listShops(q.value);
      }).catch(e => { const M = $('itS_match'); if (M) M.innerHTML = '⚠️ เช็กร้านเดิมไม่ได้: ' + esc2(e.message) + ' (ถ้าเพิ่งอัปเดต Import Tracker ให้ Deploy New version ก่อน)'; });
      if (!x.cn || !x.url) msg('อ่านชื่อ/ลิงก์ร้านจากหน้านี้ได้ไม่ครบ – กรอกเอง หรือเปิดหน้าร้าน (กดปุ่ม 进店) แล้วกดปุ่มอีกครั้ง', true);
      $('itS_go').onclick = async () => {
        const body = { action: 'addShop', cn: $('itS_cn').value.trim(), thai: $('itS_th').value.trim(), url: $('itS_url').value.trim(), logo: x.logo || '', page: location.href.slice(0, 300),
          shopId: x.shopId || '', aliases: x.aliases || [], target, replace: !!target && upd() };
        if (isItem) Object.assign(body, { sku: $('itS_sku').value.trim(), cny: +$('itS_cny').value || 0, itemId: x.itemId, itemUrl: x.itemUrl, title: x.title });
        if (!body.cn) return msg('ใส่ชื่อร้านภาษาจีนก่อน', true);
        $('itS_go').disabled = true; msg('กำลังบันทึก… (แปลชื่อ + เขียนชีต ~5–15 วิ)');
        try {
          const r = await post(body);
          msg((r.existed ? '✅ อัปเดตร้านเดิม' + (r.by ? ' (' + r.by + ')' : '') + (r.logoDone ? ' · ' + r.logoDone : '') + (r.renamed ? ' · ' + r.renamed : '') + (r.relinked ? ' · เปลี่ยนช่องร้านในชีต Product ' + r.relinked + ' ช่อง' : '') + ': ' : '✅ เพิ่มร้านแล้ว: ') + (r.thai || '') + ' · ' + r.cn + (r.dealerRow ? ' (ชีต Dealer แถว ' + r.dealerRow + ')' : '') + (r.dealerId ? ' · ' + r.dealerId : '') + (r.priceMsg ? ' · ' + r.priceMsg : '') + (r.why ? ' · ⚠️ ' + r.why : ''), !!r.why);
        } catch (e) { msg('❌ ' + e.message, true); }
        $('itS_go').disabled = false;
      };
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
