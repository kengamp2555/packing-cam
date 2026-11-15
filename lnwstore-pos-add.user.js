// ==UserScript==
// @name         LnwStore ← POS : ลงสินค้าใหม่ / เพิ่มตัวเลือก
// @namespace    charoenstock-pos
// @version      1.0.0
// @description  ใช้คู่กับปุ่ม "⬆ ขึ้น LnwShop" ในหน้าเติมข้อมูลสินค้าของ POS · กรอกหน้าเพิ่มสินค้า / เพิ่มตัวเลือกในสินค้าเดิมให้ แล้วให้ผู้ใช้ตรวจและกด "บันทึก" เอง · ได้รหัสสินค้าแล้วส่งกลับไปเขียนลงชีต (AO)
// @match        https://a.lnwstore.com/*/inventory/product/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://kengamp2555.github.io/packing-cam/lnwstore-pos-add.user.js
// @downloadURL  https://kengamp2555.github.io/packing-cam/lnwstore-pos-add.user.js
// ==/UserScript==

/*
 * วิธีทำงาน (ทดสอบกับหน้า LnwStore จริงแล้ว 15/11/2026)
 *  - POS เปิดแท็บ LnwShop พร้อม #posadd=<nonce> → สคริปต์ขอข้อมูลงานจากหน้า POS (postMessage) แล้วจำไว้ในแท็บนี้ (sessionStorage)
 *  - แบบ single : หน้า /product/new/ → กรอกชื่อ รหัส ราคา น้ำหนัก/ขนาด (AT5-8) หมวด ร้าน1-3 (AT37-39) รูป · เปิดแสดง/Sync
 *  - แบบ group  : หน้า /product/new/ → สลับเป็น "มีตัวเลือกแบบ" เลือกหัวข้อตัวเลือก ใส่ตัวเลือก + รหัส/ราคาของแต่ละแบบ
 *  - แบบ variant: หน้า /product/<สินค้าหลัก>/ → "แก้ไขตัวเลือกสินค้า" เพิ่มตัวเลือกใหม่ + รหัส/ราคา
 *  - ผู้ใช้ตรวจแล้วกด "บันทึก" ของ LnwShop เอง → สคริปต์อ่านรหัสสินค้าใหม่ (ตัวเลือก = จับคู่ตามชื่อตัวเลือก)
 *  - ตัวเลือกใหม่: สคริปต์เปิดหน้าของตัวเลือกนั้นทีละตัว ใส่น้ำหนัก/ขนาด แล้วกดบันทึกให้ (ขั้นตอนต่อเนื่องจากที่ผู้ใช้กดบันทึกแล้ว)
 *  - ส่งผลกลับไปหน้า POS (window.opener) → POS เขียนรหัสลงคอลัมน์ AO · ไม่ส่งข้อมูลไปที่อื่น
 */
(function () {
  'use strict';
  var JOB = 'charoenstock_pos_add_job', PKG = ['AT5', 'AT6', 'AT7', 'AT8'], SHOPS = ['AT37', 'AT38', 'AT39'];
  var m = /[#&]posadd=([A-Za-z0-9]{6,40})/.exec(location.hash || '');
  var job = null; try { job = JSON.parse(sessionStorage.getItem(JOB) || 'null'); } catch (e) { }
  if (!m && !job) return;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function saveJob() { try { if (job) sessionStorage.setItem(JOB, JSON.stringify(job)); else sessionStorage.removeItem(JOB); } catch (e) { } }
  function storeReady() { return window.vm && window.vm.$store && window.vm.$store.state && window.vm.$store.state.vars; }
  async function waitStore(ms) { var t0 = Date.now(); while (Date.now() - t0 < (ms || 30000) && !storeReady()) await sleep(300); return storeReady() ? window.vm.$store : null; }
  function setVar(s, k, v) { return s.dispatch('update_var', { key: k, value: v }); }
  function curPid() { var mm = /\/inventory\/product\/(?:\d+\/)?(\d+)\/?$/.exec(location.pathname); return mm ? mm[1] : ''; }

  // ---------- แผงสถานะ ----------
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:360px;max-height:85vh;overflow:auto;background:#fff;border:2px solid #1b6bd1;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:12px;font:13px/1.5 system-ui,sans-serif;color:#222';
  document.body.appendChild(panel);
  function render(title, body, color) {
    panel.style.borderColor = color || '#1b6bd1';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>⬆ POS → ลงสินค้า LnwShop</b><button id="pa-x" style="border:0;background:#eee;border-radius:6px;cursor:pointer">✕</button></div>' +
      '<div style="margin:6px 0;font-weight:700">' + title + '</div>' + (body || '') +
      '<button id="pa-cancel" style="margin-top:8px;width:100%;border:1px solid #ccc;border-radius:8px;background:#fff;padding:6px;cursor:pointer">ยกเลิกงานนี้ (ไม่กรอกต่อ)</button>';
    panel.querySelector('#pa-x').onclick = function () { panel.style.display = 'none'; };
    panel.querySelector('#pa-cancel').onclick = function () { if (confirm('ยกเลิกงานลงสินค้านี้? (ข้อมูลที่กรอกในหน้านี้ยังอยู่ ถ้าไม่กดบันทึกก็จะไม่ถูกบันทึก)')) { send({ type: 'charoenstock-lnwadd-done', nonce: job && job.nonce, ok: false, cancelled: true, results: [] }); job = null; saveJob(); panel.remove(); } };
  }
  function itemsTable(items) {
    return '<table style="font-size:12px;width:100%;border-collapse:collapse;margin-top:4px">' + items.map(function (it) {
      return '<tr style="border-top:1px solid #eee"><td style="padding:2px 4px;white-space:nowrap"><b>' + esc(it.sku) + '</b></td><td style="padding:2px 4px">' + esc(it.choice || it.name || '').slice(0, 60) + '</td><td style="text-align:right;padding:2px 4px">' + esc(it.price) + '฿</td><td style="text-align:right;color:' + (it.pid ? '#1b7f4a' : '#999') + '">' + (it.pid ? '#' + esc(it.pid) : '') + '</td></tr>';
    }).join('') + '</table>';
  }
  function send(msg) { try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*'); } catch (e) { } }

  // ---------- รับงานจากหน้า POS ----------
  async function fetchJob(nonce) {
    render('กำลังรับข้อมูลจากหน้า POS…', '', '#c77d1a');
    var got = null;
    function on(ev) { var d = ev.data; if (d && d.type === 'charoenstock-lnwadd-job' && d.nonce === nonce && d.job) got = d.job; }
    window.addEventListener('message', on);
    for (var i = 0; i < 40 && !got; i++) { send({ type: 'charoenstock-lnwadd-req', nonce: nonce }); await sleep(500); }
    window.removeEventListener('message', on);
    return got;
  }

  // ---------- อัปโหลดรูป (คลังรูปของ LnwShop) ----------
  function dataUrlToFile(u, name) {
    var mm = /^data:([^;]+);base64,(.*)$/.exec(u || ''); if (!mm) return null;
    var bin = atob(mm[2]), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'image.jpg', { type: mm[1] });
  }
  async function uploadImage(dataUrl, name) {
    var file = dataUrlToFile(dataUrl, name); if (!file) return '';
    var btn = [].slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === 'เพิ่มรูปภาพ'; })[0];
    if (!btn) return '';
    btn.click(); await sleep(800);
    var fi = document.querySelector('input[type=file][accept^="image"]'), vc = null, e = fi;
    for (var k = 0; k < 10 && e; k++, e = e.parentElement) if (e.__vue__ && e.__vue__.handleDrop) { vc = e.__vue__; break; }
    if (!vc) return '';
    var dt = new DataTransfer(); dt.items.add(file);
    vc.handleDrop({ preventDefault: function () { }, stopPropagation: function () { }, dataTransfer: dt });
    var t0 = Date.now(); await sleep(1200);
    while (Date.now() - t0 < 30000 && (vc.is_uploading_file || vc.wait_upload_file_num > 0)) await sleep(400);
    var sel = (vc.selected_files || []).filter(function (f) { return f && f.name === file.name; }).pop() || (vc.selected_files || []).slice(-1)[0];
    var url = sel && sel.file_url || '';
    try { vc.confirm_selected(); } catch (x) { try { vc.close_popup(); } catch (y) { } }
    await sleep(500);
    return url;
  }

  // ---------- ช่วยกรอกในตารางแบบสินค้า (ตัวเลือก) ----------
  function fillChoiceRow(text, code, price) {
    var cell = [].slice.call(document.querySelectorAll('td')).filter(function (x) { return x.children.length === 0 && x.textContent.trim() === text; })[0];
    var row = cell; while (row && row.tagName !== 'TR') row = row.parentElement;
    if (!row) return false;
    var ins = [].slice.call(row.querySelectorAll('input')).filter(function (i) { return i.type !== 'checkbox'; });
    function put(i, v) { if (!i || v == null || v === '') return; i.focus(); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); }
    put(ins[0], code); put(ins[1], price);
    return true;
  }
  async function addChoices(texts) {
    var inp = [].slice.call(document.querySelectorAll('input')).filter(function (x) { return /กรอกคำที่ต้องการแล้ว Enter/.test(x.placeholder || '') && x.offsetParent; })[0];
    if (!inp) return false;
    for (var i = 0; i < texts.length; i++) {
      inp.focus(); inp.value = texts[i]; inp.dispatchEvent(new Event('input', { bubbles: true }));
      ['keydown', 'keypress', 'keyup'].forEach(function (t) { inp.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); });
      await sleep(400);
    }
    return true;
  }
  async function setCommon(s, j, it) {   // ช่องของสินค้าหลัก / สินค้าเดี่ยว
    await setVar(s, 'name', j.name || it.name);
    await setVar(s, 'code', j.mode === 'single' ? it.code : (j.groupCode || ''));
    await setVar(s, 'unit', 'ชิ้น');
    if (j.mode === 'single') await setVar(s, 'price', Number(it.price) || 0);
    for (var k = 0; k < 4; k++) await setVar(s, PKG[k], it.dims && it.dims[k] != null ? String(it.dims[k]) : null);
    for (k = 0; k < 3; k++) if (it.shops && it.shops[k]) await setVar(s, SHOPS[k], it.shops[k]);
    if (j.catId && /^\d+$/.test(String(j.catId))) await setVar(s, 'category_id', Number(j.catId));
    var on = j.sync === false ? 0 : 1;
    var sw = ['show_sw', 'show_sw_lnwshop', 'show_list_lnwshop'], ch = ['ch1003_show_sw', 'ch1005_show_sw', 'ch100001_show_sw'];
    for (k = 0; k < sw.length; k++) await setVar(s, sw[k], 1);
    for (k = 0; k < ch.length; k++) await setVar(s, ch[k], on);
    // จำนวนเริ่มต้น (ช่องบังคับในหน้าเพิ่มสินค้า) = 0 · ลง Stock ทีหลังผ่าน Import Tracker
    var req = [].slice.call(document.querySelectorAll('input[type=number]')).filter(function (x) { return x.required && !x.value; })[0], e2 = req;
    for (var q = 0; q < 12 && e2; q++, e2 = e2.parentElement) if (e2.__vue__ && e2.__vue__.$options.name === 'stock-setting') { var fd = e2.__vue__.fdata; fd.amount = 0; if (it.cost > 0) { fd.price = it.cost; fd.price_per = 'unit'; } break; }
  }

  // ---------- ขั้นตอนตามหน้า ----------
  async function stepFill() {
    var s = await waitStore(); if (!s) { render('❌ ไม่พบระบบหน้าเว็บของ LnwStore (ยังไม่ได้ล็อกอิน?)', '', '#b42318'); return; }
    await sleep(800);
    var j = job, it0 = j.items[0];
    render('กำลังกรอกข้อมูล…', itemsTable(j.items), '#c77d1a');
    if (j.mode === 'single') {
      await setCommon(s, j, it0);
      if (it0.img) { render('กำลังอัปโหลดรูป…', itemsTable(j.items), '#c77d1a'); var u = await uploadImage(it0.img, (it0.sku || 'pos') + '.jpg'); if (u) await setVar(s, 'images', [u]); }
    } else if (j.mode === 'group') {
      var lab = [].slice.call(document.querySelectorAll('label')).filter(function (l) { return l.textContent.trim() === 'มีตัวเลือกแบบ'; })[0];
      if (lab && !(s.state.pdata && s.state.pdata.props && s.state.pdata.props.has_sub)) { lab.click(); await sleep(1500); }
      s = await waitStore();
      await setCommon(s, j, it0);
      var sel = [].slice.call(document.querySelectorAll('select')).filter(function (x) { return x.offsetParent && [].slice.call(x.options).some(function (o) { return /ความสูง จำนวน/.test(o.text); }); })[0];
      var opt = sel && [].slice.call(sel.options).filter(function (o) { return o.text.trim() === j.optionLabel; })[0];
      if (!opt) { render('⚠️ ไม่พบหัวข้อตัวเลือก "' + esc(j.optionLabel) + '" — เลือกหัวข้อเองในส่วน "ตัวเลือกสินค้า" แล้วพิมพ์ตัวเลือก: ' + esc(j.items.map(function (x) { return x.choice; }).join(', ')), itemsTable(j.items), '#b42318'); }
      else {
        sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(800);
        await addChoices(j.items.map(function (x) { return x.choice; })); await sleep(600);
        j.items.forEach(function (x) { fillChoiceRow(x.choice, x.code, x.price); });
      }
      if (it0.img) { var u2 = await uploadImage(it0.img, (it0.sku || 'pos') + '.jpg'); if (u2) await setVar(s, 'images', [u2]); }
    } else if (j.mode === 'variant') {
      j.before = Object.keys(s.state.sub_vars || {});
      var eb = [].slice.call(document.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === 'แก้ไขตัวเลือกสินค้า'; })[0];
      if (eb) { eb.click(); await sleep(1000); }
      var exist = {}; Object.keys(s.state.sub_vars || {}).forEach(function (id) { exist[String((s.state.sub_vars[id] || {}).name || '').trim()] = id; });
      var dup = j.items.filter(function (x) { return exist[x.choice]; });
      if (dup.length) { render('⚠️ สินค้าหลักนี้มีตัวเลือกชื่อนี้อยู่แล้ว: ' + esc(dup.map(function (x) { return x.choice + ' (#' + exist[x.choice] + ')'; }).join(', ')) + ' — แก้ชื่อตัวเลือกใน POS แล้วเริ่มใหม่', itemsTable(j.items), '#b42318'); return; }
      await addChoices(j.items.map(function (x) { return x.choice; })); await sleep(600);
      j.items.forEach(function (x) { fillChoiceRow(x.choice, x.code, x.price); });
    }
    j.stage = 'await_save'; j.page = location.pathname; saveJob();
    render('✍️ ตรวจข้อมูลแล้วกด "บันทึก" ของ LnwShop', '<div style="font-size:12px;color:#555">' + (j.mode === 'single' ? 'สินค้าเดี่ยว' : j.mode === 'group' ? 'สินค้าใหม่แบบมีตัวเลือก (' + esc(j.optionLabel) + ')' : 'เพิ่มตัวเลือกในสินค้าหลัก #' + esc(j.parent)) +
      (j.catId ? ' · หมวด ' + esc(j.catName || j.catId) : ' · ⚠️ ยังไม่มีหมวดจากตาราง (ใช้ค่าตั้งต้นของหน้า)') + '</div>' + itemsTable(j.items) +
      '<div style="font-size:12px;color:#555;margin-top:6px">กด "บันทึก" ด้านบนของ LnwShop · บันทึกแล้วสคริปต์จะส่งรหัสกลับไปที่ POS ให้เอง</div>', '#1b6bd1');
    watchSave();
  }
  async function watchSave() {
    var s = window.vm.$store, j = job;
    for (;;) {
      await sleep(1000);
      if (!job) return;
      var st = s.state, pid = st.pdata && /^\d+$/.test(String(st.pdata.id)) ? String(st.pdata.id) : '';
      if (j.mode === 'single') { if (pid && j.page && /\/new/.test(j.page)) { j.items[0].pid = pid; break; } }
      else {
        var subs = st.sub_vars || {}, byName = {}; Object.keys(subs).forEach(function (id) { byName[String((subs[id] || {}).name || '').trim()] = id; });
        var all = j.items.every(function (x) { return byName[x.choice] && (!j.before || j.before.indexOf(byName[x.choice]) < 0); });
        if ((j.mode === 'group' ? pid : true) && all) { if (j.mode === 'group') j.parent = pid; j.items.forEach(function (x) { x.pid = byName[x.choice]; x.parent = j.parent; }); break; }
      }
    }
    j.stage = 'dims'; j.di = 0; saveJob();
    if (j.mode === 'single') return finish();
    nextDims();
  }
  // ตัวเลือกใหม่: เปิดหน้าของแต่ละตัว → ใส่น้ำหนัก/ขนาด → บันทึก
  function nextDims() {
    var j = job; while (j.di < j.items.length && !(j.items[j.di].dims || []).some(function (v) { return v != null; })) j.di++;
    if (j.di >= j.items.length) return finish();
    saveJob(); render('⚖️ ใส่น้ำหนัก/ขนาดของตัวเลือก ' + (j.di + 1) + '/' + j.items.length + '…', itemsTable(j.items), '#c77d1a');
    location.href = location.origin + '/' + location.pathname.split('/')[1] + '/inventory/product/' + j.items[j.di].pid + '/';
  }
  async function stepDims() {
    var j = job, it = j.items[j.di], s = await waitStore(); if (!s) return;
    var t0 = Date.now(); while (Date.now() - t0 < 15000 && String((s.state.pdata || {}).id) !== String(it.pid)) await sleep(300);
    render('⚖️ ใส่น้ำหนัก/ขนาดของ ' + esc(it.choice) + '…', itemsTable(j.items), '#c77d1a');
    await sleep(800);
    for (var k = 0; k < 4; k++) if (it.dims[k] != null) await setVar(s, PKG[k], String(it.dims[k]));
    var btn = [].slice.call(document.querySelectorAll('input[type=submit],button')).filter(function (b) { return (b.value || b.textContent || '').trim() === 'บันทึก' && b.offsetParent; })[0];
    if (!btn) { render('⚠️ ไม่พบปุ่มบันทึก — กด "บันทึก" เองได้เลย', itemsTable(j.items), '#b42318'); return; }
    j.di++; saveJob();   // เลื่อนไปตัวถัดไปก่อนกด (หน้าอาจโหลดใหม่หลังบันทึก → สคริปต์รันต่อจากตัวถัดไปเอง)
    btn.click(); await sleep(4000);
    nextDims();
  }
  async function finish() {
    var j = job; j.stage = 'done'; saveJob();
    var results = j.items.map(function (x) { return { row: x.row, sku: x.sku, pid: x.pid, parent: x.parent || '' }; });
    var acked = false, ackMsg = '';
    function on(ev) { var d = ev.data; if (d && d.type === 'charoenstock-lnwadd-ack' && d.nonce === j.nonce) { acked = true; ackMsg = d.text || ''; if (d.next) j.next = d.next; } }
    window.addEventListener('message', on);
    for (var i = 0; i < 40 && !acked; i++) { send({ type: 'charoenstock-lnwadd-done', nonce: j.nonce, ok: true, results: results }); await sleep(750); }
    window.removeEventListener('message', on);
    var txt = results.map(function (r) { return r.row + '\t' + r.sku + '\t' + r.pid; }).join('\n');
    render(acked ? '✅ POS บันทึกรหัสลงชีตแล้ว' : '⚠️ ส่งกลับไป POS ไม่ได้ (ปิดหน้า POS ไปแล้ว?)', '<div style="font-size:12px;color:#555">' + esc(ackMsg) + '</div>' + itemsTable(j.items) +
      (acked ? '' : '<textarea style="width:100%;height:70px;margin-top:6px">' + esc(txt) + '</textarea><div style="font-size:11px;color:#666">แถว [TAB] รหัส [TAB] รหัส LnwShop — ใส่ในคอลัมน์ AO เอง</div>'), acked ? '#1b7f4a' : '#b42318');
    var next = j.next; job = null; saveJob();
    if (next && next.url && next.nonce) { await sleep(1500); location.href = next.url; }
  }

  (async function main() {
    if (m && (!job || job.nonce !== m[1])) {
      var got = await fetchJob(m[1]);
      if (!got) { render('❌ ไม่ได้รับข้อมูลจากหน้า POS', '<div style="font-size:12px">เปิดหน้านี้จากปุ่ม "⬆ ขึ้น LnwShop" ในหน้าเติมข้อมูลสินค้าของ POS (อย่าปิดหน้า POS)</div>', '#b42318'); return; }
      job = got; job.nonce = m[1]; job.stage = 'fill'; saveJob();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    }
    if (!job) return;
    if (job.stage === 'fill') return stepFill();
    if (job.stage === 'await_save') { await waitStore(); return watchSave(); }
    if (job.stage === 'done') { await waitStore(); return finish(); }   // หน้าโหลดใหม่ระหว่างส่งผล → ส่งซ้ำ (POS ตอบรับซ้ำได้)
    if (job.stage === 'dims') { if (String(curPid()) === String((job.items[job.di] || {}).pid)) return stepDims(); return nextDims(); }
  })().catch(function (e) { render('❌ เกิดข้อผิดพลาด: ' + esc(e && e.message || e), '', '#b42318'); });
})();
