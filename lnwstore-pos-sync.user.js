// ==UserScript==
// @name         LnwStore → POS : เก็บราคา + สต็อกคงเหลือ + น้ำหนัก/ขนาด
// @namespace    charoenstock-pos
// @version      1.3.0
// @description  เปิดลิงก์จากปุ่ม "ดึงราคา+สต็อกจาก LnwShop" ในหน้า "เติมข้อมูลสินค้า" ของระบบ POS แล้วสคริปต์นี้จะอ่านราคาและสต็อกคงเหลือของสินค้าจากหน้า LnwStore สะสมไว้ ให้กดคัดลอกไปวางใน POS
// @match        https://a.lnwstore.com/*/inventory/product/edit*
// @run-at       document-idle
// @grant        none
// @updateURL    https://kengamp2555.github.io/packing-cam/lnwstore-pos-sync.user.js
// @downloadURL  https://kengamp2555.github.io/packing-cam/lnwstore-pos-sync.user.js
// ==/UserScript==

/*
 * วิธีทำงาน
 *  - POS เปิดลิงก์หน้าแก้ไขสินค้า (ชุดละ 40 สินค้า) ต่อท้ายด้วย  #sync
 *  - สคริปต์รอให้หน้าโหลดสินค้า แล้วอ่าน ราคา (props.price) และ สต็อกคงเหลือ (props.balance) ของแต่ละสินค้า
 *  - สะสมไว้ในเบราว์เซอร์ (เปิดหลายลิงก์ต่อกันได้) · กด "คัดลอกทั้งหมด" แล้วนำไปวางที่ POS
 *    รูปแบบ: รหัส LnwShop [TAB] ราคา [TAB] สต็อกคงเหลือ [TAB] น้ำหนัก(กรัม) [TAB] กว้าง [TAB] ยาว [TAB] สูง (ซม.)  (บรรทัดละสินค้า)
 *    (v1.3: เพิ่มน้ำหนัก/ขนาดพัสดุ → POS เขียนลงชีต Product คอลัมน์ AH / AI / AJ / AK)
 *  - โหมด "ทั้งหมด": POS เปิดลิงก์ชุดแรกพร้อมรายการรหัสทั้งหมด (#syncall=…) สคริปต์จะเก็บชุดนี้แล้วเปิดชุดถัดไปให้เองทีละ 40 สินค้า
 *    จนครบ (มีปุ่มหยุด) แล้วค่อยกด "คัดลอกทั้งหมด" ครั้งเดียว
 *  - เมื่อครบทุกชุด สคริปต์ส่งข้อมูลกลับไปที่หน้า POS ที่เปิดลิงก์มา (postMessage) แล้ว POS จะวางและบันทึกให้เอง
 *    (ถ้าแท็บ POS ปิดไปแล้ว หรือส่งกลับไม่ได้ ยังกด "คัดลอกทั้งหมด" ไปวางเองได้เหมือนเดิม)
 *  - ไม่ได้ส่งข้อมูลไปที่ไหนเอง และไม่แก้ข้อมูลใน LnwStore
 *
 * ถ้าค่าไม่ตรงกับหน้า LnwStore: กด "คัดลอกข้อมูลวินิจฉัย" แล้วส่งข้อความนั้นมาให้ปรับสคริปต์
 * PRICE_KEY / STOCK_KEY: ระบุชื่อช่องเองได้ ถ้าสคริปต์เลือกผิดช่อง (เช่น PRICE_KEY = 'price_old')
 */
(function () {
  'use strict';
  var PRICE_KEY = 'price', STOCK_KEY = 'balance';
  // น้ำหนัก (กรัม) / กว้าง / ยาว / สูง (ซม.) ของพัสดุ: ลองชื่อช่องตามลำดับ · ถ้าไม่ตรง กด "คัดลอกข้อมูลวินิจฉัย" แล้วส่งให้ผู้พัฒนา
  var DIM_KEYS = {
    w: ['package_weight', 'parcel_weight', 'shipping_weight', 'weight_package', 'weight', 'weight_gram'],
    x: ['package_width', 'parcel_width', 'width'],
    y: ['package_length', 'parcel_length', 'length'],
    z: ['package_height', 'parcel_height', 'height']
  };
  var DIM_RE = { w: /weight/i, x: /width/i, y: /length/i, z: /height/i };
  var FLAG = 'charoenstock_pos_sync_on', STORE = 'charoenstock_pos_sync_data', QKEY = 'charoenstock_pos_sync_queue';
  var PER = 40, STALE_MS = 5 * 60 * 1000;
  var on = /[#&]sync(all=|\b)/.test(location.hash || '');
  try { if (on) sessionStorage.setItem(FLAG, '1'); else on = sessionStorage.getItem(FLAG) === '1'; } catch (e) {}
  if (!on) return;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  // แปลงเป็นตัวเลข (รองรับ "1,250.00") · ไม่ใช่ตัวเลข = null
  function loadQ() { try { var q = JSON.parse(localStorage.getItem(QKEY) || 'null'); return q && q.active && Date.now() - (q.ts || 0) < STALE_MS ? q : null; } catch (e) { return null; } }
  function saveQ(q) { try { if (q) { q.ts = Date.now(); localStorage.setItem(QKEY, JSON.stringify(q)); } else localStorage.removeItem(QKEY); } catch (e) {} }
  // เริ่มโหมดทั้งหมด: #syncall=รหัส,รหัส,… → ชุดนี้ = รหัสใน ?pids= ที่เหลือเข้าคิว · ล้างของเก่าที่สะสมไว้
  (function startAll() {
    var m = /[#&]syncall=([^&]*)/.exec(location.hash || ''); if (!m) return;
    var all = []; try { all = decodeURIComponent(m[1]).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return /^[A-Za-z0-9_.\-]+$/.test(x); }); } catch (e) {}
    var cur = {}; ((/[?&]pids=([^&#]*)/.exec(location.search) || [])[1] || '').split(',').forEach(function (x) { cur[decodeURIComponent(x)] = 1; });
    var rest = all.filter(function (x) { return !cur[x]; }), nm = /[#&]n=([A-Za-z0-9]{6,40})/.exec(location.hash || '');
    save({}); saveQ({ active: true, q: rest, total: all.length, batches: 1 + Math.ceil(rest.length / PER), done: 1, n: nm ? nm[1] : '' });
    try { history.replaceState(null, '', location.pathname + location.search + '#sync'); } catch (e) {}
  })();
  function line(k, v) { var o = [k].concat([0, 1, 2, 3, 4, 5].map(function (i) { return v[i] === null || v[i] === undefined ? '' : v[i]; })); while (o.length > 3 && o[o.length - 1] === '') o.pop(); return o.join('\t'); }
  function allText() { var dd = load(); return Object.keys(dd).map(function (k) { return line(k, dd[k]); }).join('\n'); }
  // หาค่าน้ำหนัก/ขนาดใน props (รวมช่องย่อย 1 ชั้น เช่น props.package.weight) · คืน [w, x, y, z] (0/ว่าง = null)
  function dims(props) {
    var pools = [props]; Object.keys(props || {}).forEach(function (k) { var v = props[k]; if (v && typeof v === 'object' && !Array.isArray(v) && /pack|parcel|ship|dimen|size/i.test(k)) pools.unshift(v); });
    return ['w', 'x', 'y', 'z'].map(function (d) {
      for (var i = 0; i < pools.length; i++) {
        var P = pools[i] || {}, ks = DIM_KEYS[d].filter(function (k) { return k in P; }).concat(Object.keys(P).filter(function (k) { return DIM_RE[d].test(k) && DIM_KEYS[d].indexOf(k) < 0; }));
        for (var j = 0; j < ks.length; j++) { var n = num(P[ks[j]]); if (n !== null && n > 0) return n; }
      }
      return null;
    });
  }
  function dimKeysOf(props) { var out = []; Object.keys(props || {}).forEach(function (k) { var v = props[k]; if (/weight|width|length|height|pack|parcel|ship|dimen/i.test(k)) out.push(k + '=' + JSON.stringify(v).slice(0, 80)); }); return out.join(' · '); }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? n : null;
  }

  var panel = document.createElement('div');
  panel.id = 'pos-sync-panel';
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:340px;max-height:80vh;overflow:auto;background:#fff;border:2px solid #1b6bd1;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:12px;font:13px/1.45 system-ui,sans-serif;color:#222';
  document.body.appendChild(panel);
  var diagText = '';
  function copyText(text, b, okMsg) {
    function done(ok) { b.textContent = ok ? okMsg : '⚠️ คัดลอกไม่ได้ — เลือกข้อความด้านล่างแล้วคัดลอกเอง'; if (!ok) { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'width:100%;height:120px;margin-top:6px'; b.parentNode.appendChild(ta); ta.select(); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); else done(false);
  }
  function render(title, extra, color) {
    var d = load(), n = Object.keys(d).length;
    panel.style.borderColor = color || '#1b6bd1';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>📦 LnwStore → ราคา + สต็อก + น้ำหนัก</b><button id="ps-x" style="border:0;background:#eee;border-radius:6px;cursor:pointer">✕</button></div>' +
      '<div style="margin:6px 0;font-weight:700">' + title + '</div>' + (extra || '') +
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee">สะสมไว้แล้ว <b>' + n + '</b> สินค้า' +
      '<button id="ps-copy" style="margin-top:6px;width:100%;border:0;border-radius:8px;background:#1b6bd1;color:#fff;font-weight:700;padding:9px;cursor:pointer"' + (n ? '' : ' disabled') + '>📋 คัดลอกทั้งหมด (' + n + ')</button>' +
      '<button id="ps-clear" style="margin-top:6px;width:100%;border:1px solid #ccc;border-radius:8px;background:#fff;padding:7px;cursor:pointer">🗑 ล้างที่สะสมไว้</button>' +
      (diagText ? '<button id="ps-diag" style="margin-top:6px;width:100%;border:1px solid #ccc;border-radius:8px;background:#fff;padding:7px;cursor:pointer">🩺 คัดลอกข้อมูลวินิจฉัย (ส่งให้ผู้พัฒนา)</button>' : '') +
      '<div style="color:#666;font-size:11px;margin-top:6px">เปิดลิงก์ถัดไปจาก POS ได้เลย แล้วค่อยคัดลอกทีเดียว → กลับไปวางในกล่อง “ดึงราคา+สต็อกจาก LnwShop” ในหน้าเติมข้อมูลสินค้า</div></div>';
    panel.querySelector('#ps-x').onclick = function () { panel.remove(); };
    panel.querySelector('#ps-clear').onclick = function () { if (confirm('ล้างข้อมูลที่สะสมไว้ทั้งหมด?')) { save({}); render(title, extra, color); } };
    panel.querySelector('#ps-copy').onclick = function () {
      var dd = load();
      copyText(Object.keys(dd).map(function (k) { return line(k, dd[k]); }).join('\n'), this, '✅ คัดลอกแล้ว — ไปวางที่ POS');
    };
    var dg = panel.querySelector('#ps-diag'); if (dg) dg.onclick = function () { copyText(diagText, this, '✅ คัดลอกข้อมูลวินิจฉัยแล้ว'); };
  }
  render('กำลังรอหน้า LnwStore โหลดสินค้า…', '', '#c77d1a');

  async function run() {
    var t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(window.vm && window.vm.$store)) await sleep(300);
    var s = window.vm && window.vm.$store;
    if (!s) { render('❌ ไม่พบระบบหน้าเว็บของ LnwStore (ยังไม่ได้ล็อกอิน หรือหน้าเปลี่ยนรูปแบบ)', '', '#b42318'); return; }
    var st = s.state;
    t0 = Date.now();
    while (Date.now() - t0 < 60000 && (st.is_loading || !st.products || !Object.keys(st.products).length)) await sleep(400);
    await sleep(600);
    var ids = Object.keys(st.products || {}), d = load(), got = 0, gotDim = 0, miss = [], variant = [], rows = [];
    ids.forEach(function (id) {
      var p = st.products[id], props = (p && p.props) || {}, price = num(props[PRICE_KEY]), stock = num(props[STOCK_KEY]), dm = dims(props);
      if (price === null && stock === null) { miss.push(id); return; }
      d[id] = [price, stock].concat(dm); got++; if (dm.some(function (v) { return v !== null; })) gotDim++;
      if (props.has_sub || (props.sub_options && props.sub_options.length)) variant.push(id);
      rows.push('<tr><td style="padding:1px 6px 1px 0;color:#666">' + esc(id) + '</td><td style="padding:1px 6px 1px 0">' + esc(String(props.name || '').slice(0, 22)) + '</td><td style="text-align:right;padding:1px 6px">' + (price === null ? '-' : price) + '</td><td style="text-align:right;font-weight:700">' + (stock === null ? '-' : stock) + '</td><td style="text-align:right;padding-left:6px;color:#555">' + (dm[0] === null ? '-' : dm[0] + 'g') + (dm[1] || dm[2] || dm[3] ? ' ' + [dm[1], dm[2], dm[3]].map(function (v) { return v === null ? '?' : v; }).join('×') : '') + '</td></tr>');
    });
    save(d);
    var p0 = ids.length ? st.products[ids[0]] : null, props0 = (p0 && p0.props) || {};
    diagText = 'POS-sync v1.3.0\nprice key: ' + PRICE_KEY + ' · stock key: ' + STOCK_KEY + '\nprops keys: ' + Object.keys(props0).join(', ') + '\n\n' + ids.slice(0, 5).map(function (id) {
      var pr = (st.products[id] && st.products[id].props) || {};
      return '# ' + id + ' name=' + pr.name + ' price=' + JSON.stringify(pr.price) + ' price_old=' + JSON.stringify(pr.price_old) + ' balance=' + JSON.stringify(pr.balance) + ' remain=' + JSON.stringify(pr.remain) + ' stocks=' + JSON.stringify(pr.stocks) + ' has_sub=' + pr.has_sub + ' is_main=' + pr.is_main + '\n   dims → ' + JSON.stringify(dims(pr)) + ' · ช่องที่เกี่ยวข้อง: ' + dimKeysOf(pr);
    }).join('\n');
    var extra = '<table style="font-size:12px;margin-top:4px"><tr style="color:#666"><td>รหัส</td><td>ชื่อ</td><td style="text-align:right;padding:0 6px">ราคา</td><td style="text-align:right">สต็อก</td><td style="text-align:right;padding-left:6px">น้ำหนัก/ขนาด</td></tr>' + rows.slice(0, 12).join('') + '</table>' + (rows.length > 12 ? '<div style="font-size:11px;color:#666">…และอีก ' + (rows.length - 12) + ' สินค้า</div>' : '');
    if (got) extra += '<div style="margin-top:6px;font-size:12px;color:' + (gotDim ? '#1b7f4a' : '#c77d1a') + '">' + (gotDim ? '⚖️ มีน้ำหนัก/ขนาด ' + gotDim + '/' + got + ' สินค้า' : '⚠️ ไม่พบน้ำหนัก/ขนาดในหน้านี้ — ถ้าใน LnwShop กรอกไว้แล้ว กด “คัดลอกข้อมูลวินิจฉัย” ส่งให้ผู้พัฒนา') + '</div>';
    if (variant.length) extra += '<div style="margin-top:6px;font-size:12px;color:#c77d1a">⚠️ มีสินค้าแบบมีตัวเลือกย่อย ' + variant.length + ' รายการ (สต็อก/ราคาอาจเป็นค่ารวมของตัวเลือก) — ตรวจก่อนวางใน POS</div>';
    if (miss.length) extra += '<div style="margin-top:6px;font-size:12px;color:#b42318">ไม่พบราคา/สต็อก ' + miss.length + ' สินค้า (รหัส Lnw: ' + esc(miss.slice(0, 8).join(', ')) + (miss.length > 8 ? '…' : '') + ')</div>';
    console.log('[POS-sync] got', got, 'missing', miss);
    var q = loadQ();
    if (q) { q.missed = (q.missed || 0) + miss.length; saveQ(q); }
    render(got ? '✅ เก็บราคา/สต็อกได้ ' + got + '/' + ids.length + ' สินค้าในหน้านี้' : '⚠️ ไม่พบราคา/สต็อกในหน้านี้', extra, got && !variant.length ? '#1b7f4a' : '#c77d1a');
    if (q) await chain(q, extra);
  }
  // โหมดทั้งหมด: นับถอยหลังแล้วเปิดชุดถัดไปในแท็บนี้ (กดหยุดได้)
  async function chain(q, extra) {
    var stopped = false, n = Object.keys(load()).length;
    if (!q.q.length) {
      q.active = false; saveQ(null);
      var done = '🎉 ครบทุกชุดแล้ว · เก็บได้ ' + n + ' สินค้า' + (q.missed ? ' (ไม่พบข้อมูล ' + q.missed + ')' : '');
      var manual = '<div style="font-size:12px;color:#555">กด “คัดลอกทั้งหมด” ด้านล่าง แล้วไปวางที่ POS</div>';
      var text = allText();
      if (q.n && window.opener && !window.opener.closed && text) {
        render(done, '<div id="ps-send" style="font-size:12px;color:#1b6bd1">📨 กำลังส่งข้อมูลกลับไปหน้า POS…</div>', '#1b7f4a');
        var acked = false;
        window.addEventListener('message', function (ev) {
          var d = ev.data; if (!d || d.type !== 'charoenstock-sync-ack' || d.nonce !== q.n) return;
          acked = true; var el = panel.querySelector('#ps-send');
          if (el) { el.style.color = d.ok ? '#1b7f4a' : '#b42318'; el.textContent = (d.ok ? '✅ POS บันทึกให้แล้ว: ' : '⚠️ POS บันทึกไม่สำเร็จ: ') + (d.msg || '') + (d.ok ? '' : ' — คัดลอกไปวางเองได้'); }
        });
        try { window.opener.postMessage({ type: 'charoenstock-sync', nonce: q.n, text: text }, '*'); } catch (e) {}
        await sleep(15000);
        if (!acked) { var el2 = panel.querySelector('#ps-send'); if (el2) { el2.style.color = '#b42318'; el2.textContent = '⚠️ POS ไม่ตอบกลับ (อาจปิดหน้าไปแล้ว) — กด “คัดลอกทั้งหมด” แล้วไปวางที่ POS เอง'; } }
        return;
      }
      render(done, manual, '#1b7f4a');
      return;
    }
    var box = document.createElement('div'); box.style.cssText = 'margin-top:8px;padding:8px;border:1px dashed #1b6bd1;border-radius:8px;background:#f2f7fd';
    panel.insertBefore(box, panel.children[2] || null);
    box.innerHTML = '<div id="ps-prog"></div><button id="ps-stop" style="margin-top:6px;width:100%;border:1px solid #b42318;color:#b42318;background:#fff;border-radius:8px;padding:6px;cursor:pointer">⏹ หยุด</button>';
    box.querySelector('#ps-stop').onclick = function () { stopped = true; q.active = false; saveQ(null); box.innerHTML = '<b style="color:#b42318">หยุดแล้ว</b> — เก็บไว้ ' + Object.keys(load()).length + ' สินค้า (ยังไม่ครบ) · คัดลอกที่มีอยู่ได้ หรือกดปุ่มในหน้า POS เพื่อเริ่มใหม่'; };
    for (var sec = 2; sec > 0 && !stopped; sec--) { box.querySelector('#ps-prog').innerHTML = '⏳ ชุดที่ ' + (q.done + 1) + '/' + q.batches + ' · เหลือ ' + q.q.length + ' สินค้า · เปิดชุดถัดไปใน ' + sec + ' วิ'; await sleep(1000); }
    if (stopped) return;
    var next = q.q.slice(0, PER); q.q = q.q.slice(PER); q.done++; saveQ(q);
    location.href = location.origin + location.pathname + '?pids=' + next.map(encodeURIComponent).join(',') + '#sync';
  }
  run().catch(function (e) {
    render('❌ เกิดข้อผิดพลาด: ' + esc(e && e.message ? e.message : e), '', '#b42318');
    var q = loadQ(); if (q) { q.missed = (q.missed || 0) + 1; chain(q, ''); }
  });
})();
