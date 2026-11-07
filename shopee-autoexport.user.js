// ==UserScript==
// @name         Shopee → Packing Cam: ส่งออกคืนสินค้า + รายรับอัตโนมัติ (+ LnwShop)
// @namespace    packing-cam
// @version      3.5
// @description  คืนสินค้า: รับคำขอจากแอป → Export 30 วัน → ส่งเข้า Drive · รายรับ: เปิดหน้า 'รายรับของฉัน' → ดึงไฟล์โอนแล้ว → นำเข้า FIN_ เอง
// @match        https://seller.shopee.co.th/*
// @match        https://a.lnwstore.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @updateURL    https://kengamp2555.github.io/packing-cam/shopee-autoexport.user.js
// @downloadURL  https://kengamp2555.github.io/packing-cam/shopee-autoexport.user.js
// ==/UserScript==

/*
 * วิธีใช้: ในแต่ละโปรไฟล์ Chrome (1 โปรไฟล์ = 1 ร้าน) ปักหมุดแท็บ
 *   https://seller.shopee.co.th/portal/sale/returnrefundcancel เปิดค้างไว้
 * แล้วกด ⚡ ร้าน ในแอป Packing Cam (จากเครื่องไหนก็ได้ รวมถึง iPhone) → แท็บของร้านนั้นทำงานเองภายใน ~30 วิ
 *
 * รายรับ (การเงิน): เปิดหน้า การเงิน → รายรับของฉัน (ใส่รหัสผ่านถ้า Shopee ถาม) → สคริปต์ดึงไฟล์ "โอนเงินสำเร็จ"
 *   ตั้งแต่วันที่ดึงล่าสุดถึงวันนี้ (ครั้งแรกย้อนหลัง INCOME_BACKFILL_MONTHS เดือน) แล้วส่งเข้า FIN_ ของ LAZADA X SHOPEE DATA เอง
 */
(function () {
  'use strict';

  const PAGE_RE = /\/portal\/sale\/returnrefundcancel/;
  const DAYS = 30;                       // Shopee ให้ส่งออกได้สูงสุด 30 วัน
  const WAIT_REPORT_SEC = 240;           // รอ Shopee เตรียมไฟล์สูงสุดกี่วินาที
  const POLL_SEC = 30;                   // เช็กคำขอจากแอปทุกกี่วินาที
  const AUTO_ON_OPEN = false;            // true = เปิดหน้านี้แล้วดึงเองทันที · false = รอกดปุ่ม ⚡ ในแอปเท่านั้น
  const AUTO_SKIP_HOURS = 2;             // ถ้าดึงสำเร็จไปแล้วภายในกี่ชั่วโมง ไม่ดึงซ้ำตอนเปิดหน้า (กันรีเฟรชแล้วดึงซ้ำ)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const onPage = () => PAGE_RE.test(location.pathname);
  const INCOME_RE = /\/portal\/finance\/income/;
  const onIncome = () => INCOME_RE.test(location.pathname);
  const INCOME_BACKFILL_MONTHS = 12;     // ครั้งแรกของแต่ละร้าน: ดึงย้อนหลังกี่เดือน (ไฟล์ละ 1 เดือน)
  const INCOME_OVERLAP_DAYS = 3;         // ดึงทับวันเดิมกี่วัน (กันรายการที่โอนช้า · ระบบแทนที่ข้อมูลช่วงซ้ำให้เอง ไม่ซ้ำ)
  const INCOME_SKIP_HOURS = 3;           // เปิดหน้าซ้ำภายในกี่ชั่วโมงหลังดึงสำเร็จ ไม่ดึงอีก
  const ORDER_OVERLAP_DAYS = 45;         // คำสั่งซื้อ: ดึงทับย้อนหลังกี่วัน (สถานะยกเลิก/คืนยังเปลี่ยนได้)
  const INCOME_WAIT_MIN = 40;            // รอ Shopee เตรียมไฟล์รายรับสูงสุดกี่นาที (ปกติ 3–8 นาที)

  /* ---------------- ตั้งค่า (ลิงก์ /exec + รหัส เหมือนในแอป Packing Cam) ---------------- */
  function normalizeApiUrl(u) {
    u = String(u || '').trim().replace(/[\s​-‍﻿]+/g, '');
    const a = u.match(/\/a\/macros\/([^/]+)\/s\/([A-Za-z0-9_-]{20,})/);
    if (a) return 'https://script.google.com/a/macros/' + a[1] + '/s/' + a[2] + '/exec';
    const m = u.match(/\/macros\/(?:u\/\d+\/)?s\/([A-Za-z0-9_-]{20,})/);
    return m ? 'https://script.google.com/macros/s/' + m[1] + '/exec' : u;
  }
  function settings(force) {
    let url = GM_getValue('apiUrl', ''), token = GM_getValue('apiToken', '');
    if (force || !url || !token) {
      const u = prompt('ลิงก์ Web app ของ Packing Cam (ลงท้ายด้วย /exec)', url); if (u === null) return null;
      const t = prompt('รหัส API_TOKEN (เหมือนที่กรอกในแอป)', token); if (t === null) return null;
      url = normalizeApiUrl(u); token = t.trim();
      GM_setValue('apiUrl', url); GM_setValue('apiToken', token);
    }
    return { url, token };
  }
  GM_registerMenuCommand('⚙️ ตั้งค่าลิงก์/รหัส Packing Cam', () => settings(true));
  GM_registerMenuCommand('💰 ดึงรายรับใหม่ตั้งแต่ต้น (ย้อนหลัง ' + INCOME_BACKFILL_MONTHS + ' เดือน)', () => {
    if (!myShop) return alert('เปิดหน้า "รายรับของฉัน" ก่อน แล้วลองใหม่');
    GM_setValue('incTo_' + myShop.toLowerCase(), ''); GM_setValue('ordTo_' + myShop.toLowerCase(), ''); GM_setValue('incOk_' + myShop.toLowerCase(), 0); alert('ล้างแล้ว – รีเฟรชหน้ารายรับของฉัน');
  });
  GM_registerMenuCommand('🏪 ล้างการจับคู่ชื่อร้าน', () => { GM_setValue('shopMap', '{}'); myShop = ''; alert('ล้างแล้ว – รีเฟรชหน้า'); });

  /* ---------------- เรียก Packing Cam (ข้าม CSP ของหน้า Shopee ด้วย GM_xmlhttpRequest) ---------------- */
  function api(action, payload, quiet) {
    const cfg = quiet ? { url: GM_getValue('apiUrl', ''), token: GM_getValue('apiToken', '') } : settings(false);
    if (!cfg || !cfg.url) return Promise.reject(new Error('ยังไม่ได้ตั้งค่าลิงก์/รหัส'));
    const body = JSON.stringify(Object.assign({ token: cfg.token, action }, payload));
    const once = () => new Promise((res, rej) => {
      GM_xmlhttpRequest({
        method: 'POST', url: cfg.url, timeout: 180000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        data: body,
        onload: r => {
          let j; try { j = JSON.parse(r.responseText); } catch (e) {
            const t = String(r.responseText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
            const err = new Error('Packing Cam ตอบผิดรูปแบบ (HTTP ' + r.status + ')' + (t ? ': ' + t : '')); err.retry = r.status >= 500 || r.status === 429; return rej(err);
          }
          j.ok ? res(j) : rej(new Error(j.error || 'ไม่สำเร็จ'));
        },
        onerror: r => { const e = new Error('เชื่อมต่อ Packing Cam ไม่ได้' + (r && (r.error || r.status) ? ' (' + (r.error || 'HTTP ' + r.status) + ')' : '') +
          ' – เช็กว่า Tampermonkey อนุญาตให้เชื่อมต่อ script.google.com แล้ว'); e.retry = true; rej(e); },
        ontimeout: () => { const e = new Error('Packing Cam ตอบช้าเกินไป'); e.retry = true; rej(e); }
      });
    });
    return (async () => {                                       // ลองใหม่สูงสุด 3 ครั้ง (เน็ต/Google สะดุดชั่วคราว)
      for (let a = 1; ; a++) {
        try { return await once(); }
        catch (e) { if (!e.retry || a >= 3) throw e; console.warn('[Packing Cam] ลองใหม่ ' + a, e.message); await sleep(4000 * a); }
      }
    })();
  }

  /* ---------------- API ของ Seller Centre (ใช้การล็อกอินของคุณเอง) ---------------- */
  async function reportList() {
    const r = await fetch('/api/v3/settings/get_report_list/?parent_type=ps_reports_order&page_number=1&page_size=20&status=1,2,3',
      { credentials: 'include' }).then(r => r.json());
    return (r.data && r.data.list) || [];
  }
  async function downloadReport(id) {
    const r = await fetch('/api/v3/settings/download_report/?report_id=' + id, { credentials: 'include' });
    if (!r.ok) throw new Error('ดาวน์โหลดรายงานไม่ได้ (HTTP ' + r.status + ')');
    return r.blob();
  }
  function blobToBase64(b) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
  }

  /** ชื่อบัญชีที่ล็อกอินอยู่ (เช็กก่อนทำงานทุกครั้ง) */
  async function getAccount() {
    const find = (o, d) => {
      if (!o || typeof o !== 'object' || d > 4) return '';
      for (const k of Object.keys(o)) if (/^(username|user_name)$/i.test(k) && typeof o[k] === 'string' && o[k]) return o[k];
      for (const k of Object.keys(o)) { const v = find(o[k], d + 1); if (v) return v; }
      return '';
    };
    try { const j = await fetch('/api/v2/login/', { credentials: 'include' }).then(r => r.json()); const u = find(j, 0); if (u) return u; } catch (e) {}
    try { const l = await reportList(); if (l[0] && l[0].user_name) return l[0].user_name; } catch (e) {}
    const el = [...document.querySelectorAll('header *, [class*=account] *, [class*=user] *')]
      .find(e => !e.children.length && /^[a-z0-9._]{3,30}$/i.test(e.textContent.trim()));
    return el ? el.textContent.trim() : '';
  }

  /* ---------------- เลือกร้าน (ชื่อบัญชี Shopee ↔ โฟลเดอร์ร้านใน Drive) ---------------- */
  async function shopOf(account, askIfUnknown) {
    const map = JSON.parse(GM_getValue('shopMap', '{}') || '{}');
    if (map[account]) return map[account];
    const shops = ((await api('shopeeShops', {}, !askIfUnknown)).shops || []).map(s => s.name);
    let shop = shops.find(s => s.toLowerCase() === String(account).toLowerCase());
    if (!shop) {
      if (!askIfUnknown) return '';
      const ans = prompt('บัญชี "' + account + '" คือร้านไหน? พิมพ์ชื่อให้ตรงกับรายการ:\n' + shops.join(' / '), shops[0] || '');
      if (!ans || shops.indexOf(ans.trim()) < 0) throw new Error('ไม่ได้เลือกร้าน');
      shop = ans.trim();
    }
    map[account] = shop; GM_setValue('shopMap', JSON.stringify(map));
    return shop;
  }

  /* ---------------- ทำงานกับหน้าเว็บ ---------------- */
  const vis = e => e && e.offsetParent !== null;
  const dateGroup = () => [...document.querySelectorAll('.advance-filter-input-group')].find(x => /วันที่ยื่นคำขอ/.test(x.innerText));

  async function setDateRange() {
    if (!dateGroup()) {                                         // ตัวกรองถูกย่ออยู่ → กดขยาย
      const ex = document.querySelector('[data-testid="advance-filter-button-expand"]');
      if (ex) { ex.click(); await sleep(800); }
    }
    const g = dateGroup(); if (!g) throw new Error('ไม่พบช่อง "วันที่ยื่นคำขอ"');
    const dp = g.querySelector('.eds-date-picker');
    let panel = [...document.querySelectorAll('.eds-daterange-picker-panel')].find(vis);
    if (!panel) { dp.querySelector('.eds-selector').click(); await sleep(600); panel = [...document.querySelectorAll('.eds-daterange-picker-panel')].find(vis); }
    if (!panel) throw new Error('เปิดปฏิทินไม่ได้');

    const side = n => panel.querySelector('.eds-daterange-picker-panel__body-' + n);
    const hdr = s => { const l = [...s.querySelectorAll('.eds-picker-header__label')].map(x => x.textContent.trim()); return { m: MON.indexOf(l[0]), y: +l[1] }; };
    const goto = async (s, d) => {
      for (let i = 0; i < 24; i++) {
        const h = hdr(s), diff = (h.y - d.getFullYear()) * 12 + (h.m - d.getMonth());
        if (!diff) return;
        const ic = s.querySelectorAll(diff > 0 ? '.eds-picker-header__prev' : '.eds-picker-header__next');
        (ic[1] || ic[0]).click(); await sleep(200);           // ลูกศรตัวที่ 2 = เลื่อนทีละเดือน
      }
      throw new Error('เลื่อนเดือนในปฏิทินไม่ได้');
    };
    const clickDay = (s, d) => {
      const c = [...s.querySelectorAll('.eds-date-table__rows .eds-date-table__cell')]
        .find(c => /\bnormal\b/.test(c.className) && !c.className.split(/\s+/).includes('disabled') && c.textContent.trim() === String(d));
      if (!c) throw new Error('คลิกวันที่ ' + d + ' ไม่ได้');
      c.click();
    };

    const end = new Date(), start = new Date(end.getTime() - (DAYS - 1) * 864e5);
    await goto(side('left'), start);
    clickDay(side('left'), start.getDate()); await sleep(250);
    const L = hdr(side('left'));
    const s = (L.m === end.getMonth() && L.y === end.getFullYear()) ? side('left') : side('right');
    await goto(s, end);
    clickDay(s, end.getDate()); await sleep(600);
    const shown = dp.querySelector('.eds-selector__inner').textContent.trim();
    if (!/\d{2}\/\d{2}\/\d{4}/.test(shown)) throw new Error('ตั้งวันที่ไม่สำเร็จ');

    const ok = [...document.querySelectorAll('.advance-filter-button button')].find(b => b.innerText.trim() === 'ยืนยัน');
    if (ok) { ok.click(); await sleep(2500); }                  // ใช้ตัวกรองวันที่
    return shown;
  }

  async function clickExport() {
    const btn = document.querySelector('.shopee-export-button button.export');
    if (!btn) throw new Error('ไม่พบปุ่ม Export');
    btn.click();
    await sleep(1500);
    const modal = [...document.querySelectorAll('.eds-modal, .eds-modal__box, [role="dialog"]')].find(vis);   // มีหน้าต่างยืนยัน → กดยืนยัน
    if (modal) {
      const b = [...modal.querySelectorAll('button')].reverse().find(b => /export|ยืนยัน|confirm|ตกลง|ส่งออก/i.test(b.innerText));
      if (b) { b.click(); await sleep(1500); }
    }
  }

  /* ---------------- งานหลัก ---------------- */
  let running = false, myShop = '', myAccount = '';

  /**
   * want = ร้านที่ต้องการ (จากคำขอ/ลิงก์) · '' = ร้านของแท็บนี้
   * เช็กบัญชีก่อนเริ่ม: ถ้าไม่ใช่ร้านที่ต้องการ → ส่งคำขอต่อให้แท็บของร้านนั้นแทน (ไม่ Export ผิดร้าน)
   */
  async function run(want, source) {
    if (running) return; running = true;
    const st = msg => { label.textContent = msg; };
    btn.disabled = true;
    let shop = '';
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      st('⏳ ตรวจบัญชีที่ล็อกอิน…');
      myAccount = await getAccount();
      if (!myAccount) throw new Error('อ่านชื่อบัญชีไม่ได้ – ล็อกอิน Seller Centre ก่อน');
      shop = myShop = await shopOf(myAccount, true);

      if (want && want.toLowerCase() !== shop.toLowerCase()) {
        await api('shopeeRequest', { shop: want });
        st('↪️ แท็บนี้คือร้าน ' + shop + ' – ส่งคำขอต่อให้แท็บของร้าน ' + want + ' แล้ว (ไม่ได้ Export ที่นี่)');
        shop = '';                                             // ไม่รายงานสถานะทับของร้านอื่น
        return;
      }
      if (source !== 'queue') api('shopeeState', { shop, state: 'running' }, true).catch(() => {});

      st('⏳ [' + shop + '] ตรวจรายงานเดิม…');
      const before = new Set((await reportList()).map(r => r.report_id));
      st('⏳ [' + shop + '] ตั้งวันที่ย้อน ' + DAYS + ' วัน…');
      const range = await setDateRange();
      st('⏳ [' + shop + '] กด Export (' + range + ')…');
      await clickExport();

      let fresh = [], t0 = Date.now();
      while (Date.now() - t0 < WAIT_REPORT_SEC * 1000) {
        await sleep(4000);
        const list = (await reportList()).filter(r => !before.has(r.report_id));
        if (list.length && list.every(r => r.status !== 1)) { fresh = list.filter(r => r.status === 2); break; }
        st('⏳ [' + shop + '] Shopee กำลังเตรียมไฟล์… ' + Math.round((Date.now() - t0) / 1000) + ' วิ');
      }
      if (!fresh.length) throw new Error('ไม่พบไฟล์ใหม่ภายใน ' + WAIT_REPORT_SEC + ' วินาที – ลองใหม่อีกครั้ง');

      let n = 0, imp = null;
      for (let i = 0; i < fresh.length; i++) {
        const r = fresh[i];
        st('⬆️ [' + shop + '] ส่ง ' + r.report_file_name + ' และนำเข้า…');
        const res = await api('shopeeUpload', {
          shop, name: r.report_file_name, data: await blobToBase64(await downloadReport(r.report_id)),
          importNow: i === fresh.length - 1                    // สั่งนำเข้าครั้งเดียวหลังไฟล์สุดท้าย
        });
        if (res.imported) imp = res.imported;
        n++;
      }
      const t = new Date().toTimeString().slice(0, 5);
      const impTxt = !imp ? '' : imp.error ? ' • นำเข้าไม่สำเร็จ: ' + imp.error
        : imp.skipped ? ' • นำเข้าภายใน ~10 นาที'
        : ' • นำเข้าแล้ว (ใหม่ ' + (imp.fresh || 0) + ' รายการ)';
      GM_setValue('lastOk_' + shop.toLowerCase(), Date.now());
      await api('shopeeState', { shop, state: 'done', msg: 'ส่ง ' + n + ' ไฟล์ เวลา ' + t + impTxt }, true).catch(() => {});
      st('✅ [' + shop + '] ส่ง ' + n + ' ไฟล์ เวลา ' + t + impTxt);
    } catch (e) {
      st('❌ ' + e.message);
      console.warn('[Packing Cam]', e);
      if (shop) api('shopeeState', { shop, state: 'error', msg: e.message }, true).catch(() => {});
    } finally {
      running = false; btn.disabled = false;
    }
  }


  /* ================= 💰 รายรับของฉัน → FIN_ ================= */
  const INC = '/api/v4/accounting/pc/seller_income/income_report/';
  const cookie = n => (document.cookie.match('(^|; )' + n + '=([^;]*)') || [])[2] || '';
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };

  async function incJson(path, opt) {
    const r = await fetch(INC + path + (path.includes('?') ? '&' : '?') + 'SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2',
      Object.assign({ credentials: 'include' }, opt || {}));
    const j = await r.json().catch(() => ({}));
    if (j.code !== 0) throw new Error('Shopee: ' + (j.user_message || j.message || 'HTTP ' + r.status));
    return j.data || {};
  }
  /** หน้าการเงินพร้อมใช้ (ใส่รหัสผ่านแล้ว) */
  async function incReady() {
    try { await incJson('get_income_report_list?parent_type=ps_reports_income&page_number=1&page_size=1&status=1,2&income_category=2'); return true; }
    catch (e) { return false; }
  }
  /** ช่วงที่ต้องดึง: ไฟล์ละไม่เกิน 1 เดือนปฏิทิน */
  function incChunks(from, to) {
    const out = [];
    let s = from;
    while (s <= to) {
      const d = new Date(s + 'T12:00:00');
      const monthEnd = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const e = monthEnd < to ? monthEnd : to;
      out.push([s, e]); s = addDays(e, 1);
    }
    return out;
  }
  /** สั่งให้ Shopee เตรียมไฟล์ (ยังไม่รอ) */
  async function incRequest(from, to) {
    const g = await incJson('request_income_report_generation', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ start_date: from, end_date: to, income_category: 2 })   // 2 = โอนเงินสำเร็จแล้ว
    });
    if (!g.report_id) throw new Error('Shopee ไม่ได้สร้างรายงาน ' + from + ' → ' + to);
    return { id: g.report_id, name: g.file_name, from, to, t0: Date.now() };
  }
  /** รอไฟล์พร้อม แล้วดาวน์โหลด */
  async function incFetch(job, st) {
    for (;;) {
      const r = await incJson('get_income_report?report_id=' + job.id);
      if (r.status === 2 || r.status === 3) break;
      if (r.status !== 1) throw new Error('Shopee เตรียมไฟล์ไม่สำเร็จ (สถานะ ' + r.status + ')');
      if (Date.now() - job.t0 > INCOME_WAIT_MIN * 60e3) throw new Error('Shopee เตรียมไฟล์นานเกิน ' + INCOME_WAIT_MIN + ' นาที – เปิดหน้านี้ใหม่ภายหลัง (ทำต่อจากเดิม)');
      st('⏳ Shopee กำลังเตรียมไฟล์ ' + job.from + ' → ' + job.to + '… ' + Math.round((Date.now() - job.t0) / 60000) + ' นาที (ปกติ 3–8 นาที)');
      await sleep(10000);
    }
    const res = await fetch(INC + 'download_income_report?report_id=' + job.id + '&SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2', { credentials: 'include' });
    if (!res.ok) throw new Error('ดาวน์โหลดไฟล์รายรับไม่ได้ (HTTP ' + res.status + ')');
    const blob = await res.blob();
    if (blob.size < 500) throw new Error('ไฟล์รายรับที่ได้ไม่ถูกต้อง');
    return { name: job.name || ('Income.โอนเงินสำเร็จ.th.' + job.from.replace(/-/g, '') + '_' + job.to.replace(/-/g, '') + '.xlsx'), blob };
  }


  /* ================= 🧾 คำสั่งซื้อทั้งหมด (Order.all) → FIN_ShopeeItems / SALES_ ================= */
  const cds = () => '&SPC_CDS=' + cookie('SPC_CDS') + '&SPC_CDS_VER=2';
  async function ordRequest(from, to) {
    const j = await fetch('/api/v3/order/request_order_report?start_date=' + from + '&end_date=' + to +
      '&language=th&screening_condition=order_creation_date&parcel_level_filter=0' + cds(), { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
    if (j.code !== 0 || !j.data || !j.data.report_id) throw new Error('Shopee ไม่รับคำขอไฟล์คำสั่งซื้อ ' + from + ' → ' + to + ': ' + (j.user_message || j.message || ''));
    return { id: j.data.report_id, name: j.data.report_file_name, from, to, n: j.data.record_numbers, t0: Date.now() };
  }
  async function ordFetch(job, st) {
    for (;;) {
      const g = await fetch('/api/v3/settings/get_report/?report_id=' + job.id + cds(), { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
      const s = g.data && g.data.status;
      if (s === 2 || s === 3) { job.name = g.data.report_file_name || job.name; break; }
      if (g.code === 0 && s !== 1) throw new Error('Shopee เตรียมไฟล์คำสั่งซื้อไม่สำเร็จ (สถานะ ' + s + ')');
      if (Date.now() - job.t0 > 15 * 60e3) throw new Error('Shopee เตรียมไฟล์คำสั่งซื้อนานเกิน 15 นาที');
      st('⏳ เตรียมไฟล์คำสั่งซื้อ ' + job.from + ' → ' + job.to + '…');
      await sleep(4000);
    }
    const res = await fetch('/api/v3/settings/download_report/?report_id=' + job.id + cds(), { credentials: 'include' });
    if (!res.ok) throw new Error('ดาวน์โหลดไฟล์คำสั่งซื้อไม่ได้ (HTTP ' + res.status + ')');
    const blob = await res.blob();
    if (blob.size < 500) {
      const txt = (await blob.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 150);
      throw new Error('ไฟล์คำสั่งซื้อที่ได้ไม่ถูกต้อง (' + blob.size + ' ไบต์' + (txt ? ': ' + txt : '') + ')');
    }
    return { name: job.name || ('Order.all.' + job.from.replace(/-/g, '') + '_' + job.to.replace(/-/g, '') + '.xlsx'), blob };
  }
  /** ดึง Order.all ทีละเดือน: ครั้งแรกย้อนหลัง INCOME_BACKFILL_MONTHS เดือน · ครั้งต่อไปทับย้อนหลัง ORDER_OVERLAP_DAYS วัน */
  async function syncOrders(shop, k, st) {
    const today = ymd(new Date()), lastTo = GM_getValue('ordTo_' + k, '');
    let from;
    if (lastTo) from = addDays(lastTo, -ORDER_OVERLAP_DAYS);
    else { const d = new Date(); d.setMonth(d.getMonth() - INCOME_BACKFILL_MONTHS + 1, 1); from = ymd(d); }
    const chunks = incChunks(from, today);
    let n = 0, firstFail = '';
    const fails = [];
    for (const [a, b] of chunks) {                             // เดือนไหนพัง → ข้ามไปเดือนถัดไป แล้วรอบหน้าทำเดือนที่พังใหม่
      try {
        st('[' + shop + '] 🧾 คำสั่งซื้อ (' + (n + fails.length + 1) + '/' + chunks.length + ') ' + a + ' → ' + b + '…');
        let job;
        try { job = await ordRequest(a, b); }
        catch (e) { st('[' + shop + '] 🧾 Shopee ให้รอ 1 นาที…'); await sleep(65000); job = await ordRequest(a, b); }   // Shopee จำกัดความถี่ → รอแล้วลองใหม่ 1 ครั้ง
        if (job.n !== 0) {
          const f = await ordFetch(job, m => st('[' + shop + '] 🧾 ' + m));
          st('[' + shop + '] 🧾 ส่ง ' + f.name + '…');
          await api('shopeeUpload', { shop, name: f.name, data: await blobToBase64(f.blob), importNow: false });
        }
        n++;
      } catch (e) {
        console.warn('[Packing Cam คำสั่งซื้อ] ' + a + ' → ' + b, e);
        fails.push(a.slice(0, 7) + ': ' + e.message);
        if (!firstFail) firstFail = a;
      }
      if (!firstFail) GM_setValue('ordTo_' + k, b < today ? b : today);   // บันทึกความคืบหน้าถึงก่อนเดือนที่พัง
      await sleep(3000);
    }
    if (fails.length) throw new Error('สำเร็จ ' + n + ' เดือน · ไม่สำเร็จ ' + fails.length + ' เดือน (รอบหน้าลองใหม่) – ' + fails[0]);
    return n;
  }

  let incRunning = false;
  async function runIncome(force) {
    if (incRunning || running) return; incRunning = true;
    const st = msg => { label.textContent = '💰 ' + msg; };
    btn.disabled = true;
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      st('ตรวจบัญชีที่ล็อกอิน…');
      myAccount = await getAccount();
      if (!myAccount) throw new Error('อ่านชื่อบัญชีไม่ได้ – ล็อกอิน Seller Centre ก่อน');
      const shop = myShop = await shopOf(myAccount, true);
      const k = shop.toLowerCase();

      for (let i = 0; !(await incReady()); i++) {             // Shopee ถามรหัสผ่านก่อนเข้าหน้าการเงิน
        if (i > 120) throw new Error('ยังเข้าหน้าการเงินไม่ได้ – ใส่รหัสผ่านแล้วรีเฟรชหน้า');
        st('[' + shop + '] รอใส่รหัสผ่านของ Shopee…'); await sleep(5000);
      }
      const today = ymd(new Date()), lastTo = GM_getValue('incTo_' + k, ''), lastOk = +GM_getValue('incOk_' + k, 0);
      if (!force && lastTo === today && Date.now() - lastOk < INCOME_SKIP_HOURS * 3600e3) {
        st('🟢 [' + shop + '] ดึงรายรับไปแล้วเมื่อ ' + new Date(lastOk).toTimeString().slice(0, 5) + ' • กดปุ่มเพื่อดึงอีกครั้ง');
        return;
      }
      // 1) คำสั่งซื้อ (ชื่อสินค้า/SKU/จำนวน) – ทำก่อนเพราะเร็ว · ผิดพลาดก็ทำรายรับต่อได้
      let ordN = 0, ordErr = '';
      try { ordN = await syncOrders(shop, k, st); } catch (e) { ordErr = e.message; console.warn('[Packing Cam คำสั่งซื้อ]', e); }

      // 2) รายรับ (โอนแล้ว)
      let from;
      if (lastTo) from = addDays(lastTo, -INCOME_OVERLAP_DAYS);
      else { const d = new Date(); d.setMonth(d.getMonth() - INCOME_BACKFILL_MONTHS + 1, 1); from = ymd(d); }
      const chunks = incChunks(from, today);

      const jobs = [];                                         // สั่งเตรียมทุกเดือนพร้อมกัน แล้วค่อยเก็บทีละไฟล์ (เร็วกว่ารอทีละไฟล์)
      for (const [a, b] of chunks) {
        st('[' + shop + '] สั่งเตรียมไฟล์ ' + (jobs.length + 1) + '/' + chunks.length + ' (' + a + ' → ' + b + ')…');
        jobs.push(await incRequest(a, b)); await sleep(1500);
      }
      let n = 0, imp = null;
      for (const job of jobs) {
        const b = job.to;
        const f = await incFetch(job, m => st('[' + shop + '] (' + (n + 1) + '/' + jobs.length + ') ' + m));
        st('[' + shop + '] (' + (n + 1) + '/' + chunks.length + ') ส่ง ' + f.name + '…');
        const res = await api('shopeeUpload', {
          shop, name: f.name, data: await blobToBase64(f.blob),
          importNow: chunks.length === 1                       // หลายไฟล์ → ให้ระบบนำเข้าเองภายใน ~10 นาที (กันหมดเวลา)
        });
        if (res.imported) imp = res.imported;
        n++;
        GM_setValue('incTo_' + k, b < today ? b : today);   // บันทึกทีละไฟล์ → หยุดกลางทางก็ทำต่อได้
      }
      GM_setValue('incOk_' + k, Date.now());
      const t = new Date().toTimeString().slice(0, 5);
      const fin = imp && imp.fin && imp.fin[0];
      const impTxt = chunks.length > 1 ? ' • ระบบจะนำเข้าเข้า FIN_ ภายใน ~10 นาที'
        : !imp ? '' : imp.error ? ' • นำเข้าไม่สำเร็จ: ' + imp.error
        : imp.skipped ? ' • นำเข้าภายใน ~10 นาที'
        : fin ? ' • นำเข้าแล้ว ' + fin.orders + ' ออเดอร์ ' + (fin.ok ? '✓ ตรงกับหน้าสรุป' : '⚠️ ยอดไม่ตรง ดูแจ้งเตือน') : ' • นำเข้าแล้ว';
      st('✅ [' + shop + '] รายรับ ' + n + ' ไฟล์ · คำสั่งซื้อ ' + (ordErr ? '❌ ' + ordErr : ordN + ' ไฟล์') + ' (' + chunks[0][0] + ' → ' + today + ') เวลา ' + t + impTxt);
    } catch (e) {
      st('❌ ' + e.message);
      console.warn('[Packing Cam รายรับ]', e);
    } finally {
      incRunning = false; btn.disabled = false;
    }
  }


  /* ================= 🏪 LnwShop (a.lnwstore.com) → โฟลเดอร์ LnwShop → FIN_ / SALES_ ================= */
  const LNW_FOLDER = 'LnwShop';                                // ชื่อโฟลเดอร์ใน Drive "Shopee Import/LnwShop"
  const LNW_CHUNK_DAYS = 7;                                    // ไฟล์ละไม่เกิน 7 วัน (LnwShop ให้สูงสุด 2,000 ออเดอร์ต่อไฟล์)
  const LNW_OVERLAP_DAYS = 7;
  const lnwSlug = () => (location.hostname === 'a.lnwstore.com' && location.pathname.split('/')[1]) || '';
  const onLnw = () => !!lnwSlug() && !/^(pure|static|assets)$/.test(lnwSlug());
  let lnwRunning = false;

  async function lnwFetch(from, to) {
    const url = '/' + lnwSlug() + '/pure/lab/order_report/?from_date=' + from + '&to_date=' + to + '&only_active=1&time_key=acceptpayment_time';
    const r = await fetch(url, { credentials: 'include' });
    const cd = r.headers.get('content-disposition') || '';
    if (!r.ok || !/spreadsheet|octet/.test(r.headers.get('content-type') || '')) {
      const t = (await r.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
      throw new Error('LnwShop ไม่ส่งไฟล์ (' + from + ' → ' + to + ', HTTP ' + r.status + ')' + (t ? ': ' + t : '') + ' – ล็อกอินใหม่');
    }
    const m = cd.match(/order_statement_(\d+)_(\d+)/), n = m ? +m[2] - +m[1] + 1 : -1;
    return { blob: await r.blob(), n };
  }
  /** ดึงช่วงวันที่ · ถ้าเต็ม 2,000 ออเดอร์ (อาจตกหล่น) → แบ่งครึ่งช่วงแล้วดึงใหม่ */
  async function lnwRange(from, to, st, out) {
    st('🏪 ดึง LnwShop ' + from + ' → ' + to + '…');
    const f = await lnwFetch(from, to);
    if (f.n >= 2000 && from < to) {
      const days = Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5);
      const mid = addDays(from, Math.floor(days / 2));
      await lnwRange(from, mid, st, out); await lnwRange(addDays(mid, 1), to, st, out);
      return;
    }
    out.push({ from, to, blob: f.blob });
  }
  async function runLnw(force) {
    if (lnwRunning) return; lnwRunning = true;
    const st = msg => { label.textContent = msg; };
    btn.disabled = true;
    try {
      if (!settings(false)) throw new Error('ยังไม่ได้ตั้งค่า');
      const today = ymd(new Date()), lastTo = GM_getValue('lnwTo', ''), lastOk = +GM_getValue('lnwOk', 0);
      if (!force && lastTo === today && Date.now() - lastOk < INCOME_SKIP_HOURS * 3600e3) {
        st('🟢 LnwShop ดึงไปแล้วเมื่อ ' + new Date(lastOk).toTimeString().slice(0, 5) + ' • กดปุ่มเพื่อดึงอีกครั้ง'); return;
      }
      let from;
      if (lastTo) from = addDays(lastTo, -LNW_OVERLAP_DAYS);
      else { const d = new Date(); d.setMonth(d.getMonth() - INCOME_BACKFILL_MONTHS + 1, 1); from = ymd(d); }
      const chunks = [];
      for (let a = from; a <= today; a = addDays(a, LNW_CHUNK_DAYS)) { const b = addDays(a, LNW_CHUNK_DAYS - 1); chunks.push([a, b < today ? b : today]); }
      let n = 0;
      for (const [a, b] of chunks) {
        const files = [];
        await lnwRange(a, b, m => st('🏪 (' + (n + 1) + '/' + chunks.length + ') ' + m.replace('🏪 ', '')), files);
        for (const f of files) {
          st('🏪 (' + (n + 1) + '/' + chunks.length + ') ส่งไฟล์ ' + f.from + ' → ' + f.to + '…');
          await api('shopeeUpload', { shop: LNW_FOLDER, name: 'order_statement_' + f.from.replace(/-/g, '') + '_' + f.to.replace(/-/g, '') + '.xlsx',
            data: await blobToBase64(f.blob), importNow: chunks.length === 1 });
        }
        GM_setValue('lnwTo', b);                                // บันทึกทีละช่วง → หยุดกลางทางก็ทำต่อได้
        n++;
        await sleep(1500);
      }
      GM_setValue('lnwOk', Date.now());
      st('✅ LnwShop ส่ง ' + n + ' ช่วง (' + from + ' → ' + today + ') เวลา ' + new Date().toTimeString().slice(0, 5) + ' • ระบบนำเข้าเข้า FIN_ ภายใน ~10–30 นาที');
    } catch (e) {
      st('❌ ' + e.message + (/ไม่พบโฟลเดอร์ร้าน/.test(e.message) ? ' – รอระบบสร้างโฟลเดอร์ LnwShop (~10 นาทีหลังติดตั้ง lnwshop.gs) แล้วลองใหม่' : ''));
      console.warn('[Packing Cam LnwShop]', e);
    } finally { lnwRunning = false; btn.disabled = false; }
  }

  /* ---------------- UI ---------------- */
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:99999;display:none;flex-direction:column;align-items:flex-end;gap:6px;font-family:system-ui,-apple-system,sans-serif';
  const btn = document.createElement('button');
  btn.textContent = '⚡ ส่งออก ' + DAYS + ' วัน → Packing Cam';
  btn.style.cssText = 'background:#ee4d2d;color:#fff;border:0;border-radius:24px;padding:14px 22px;font-size:16px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
  const label = document.createElement('div');
  label.style.cssText = 'background:rgba(0,0,0,.8);color:#fff;border-radius:10px;padding:8px 12px;font-size:13px;max-width:380px;line-height:1.5';
  label.textContent = 'กำลังเตรียม…';
  btn.onclick = () => onLnw() ? runLnw(true) : onIncome() ? runIncome(true) : run('', 'manual');
  box.append(label, btn);
  document.body.appendChild(box);
  let wasIncome = false, wasLnw = false;
  setInterval(() => {
    box.style.display = onPage() || onIncome() || onLnw() ? 'flex' : 'none';
    btn.textContent = onLnw() ? '🏪 ดึง LnwShop → FIN' : onIncome() ? '💰 ดึงรายรับ → FIN' : '⚡ ส่งออก ' + DAYS + ' วัน → Packing Cam';
    const lnw = onLnw();
    if (lnw && !wasLnw) { label.textContent = '🏪 เตรียมดึง LnwShop…'; setTimeout(() => runLnw(false), 2500); }   // เปิดหลังร้าน LnwShop → ดึงเอง
    wasLnw = lnw;
    const inc = onIncome();
    if (inc && !wasIncome) { label.textContent = '💰 เตรียมดึงรายรับ…'; setTimeout(() => runIncome(false), 2500); }   // เข้าหน้ารายรับ → ดึงเอง
    wasIncome = inc;
  }, 1000);

  /* ---------------- เปิดมาจากลิงก์ #pcauto=ร้าน (รองรับแบบเดิม) ---------------- */
  const m = location.hash.match(/pcauto=([^&]+)/);
  if (m) { sessionStorage.setItem('pcauto', decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search); }

  /* ---------------- เริ่มทำงาน: รู้จักร้านของแท็บนี้ แล้วคอยรับคำขอจากแอป ---------------- */
  (async function main() {
    for (let i = 0; i < 90 && !(onPage() && document.querySelector('.shopee-export-button button.export')); i++) await sleep(1000);
    if (!onPage()) return;

    const linkShop = sessionStorage.getItem('pcauto');
    if (linkShop) { sessionStorage.removeItem('pcauto'); await run(linkShop, 'link'); }

    try {
      myAccount = await getAccount();
      myShop = myAccount ? await shopOf(myAccount, false) : '';
    } catch (e) { /* ยังไม่ได้ตั้งค่า */ }

    // เปิดหน้า (เช่น เปิด Chrome) → ดึงเองทันที ถ้ายังไม่ได้ดึงในช่วง AUTO_SKIP_HOURS
    if (AUTO_ON_OPEN && myShop && !linkShop) {
      const last = +GM_getValue('lastOk_' + myShop.toLowerCase(), 0);
      if (Date.now() - last > AUTO_SKIP_HOURS * 3600e3) {
        label.textContent = '⚡ เปิดหน้าแล้ว – ดึงไฟล์ร้าน ' + myShop + ' อัตโนมัติ…';
        await sleep(1500);
        await run(myShop, 'open');
      } else {
        label.textContent = '🟢 ร้าน ' + myShop + ' ดึงไปแล้วเมื่อ ' + new Date(last).toTimeString().slice(0, 5) + ' • พร้อมรับคำขอจากแอป';
      }
    }
    if (!label.textContent.match(/^[✅❌↪🟢]/)) {
      label.textContent = myShop
        ? '🟢 แท็บร้าน ' + myShop + ' พร้อมรับคำขอจากแอป (เช็กทุก ' + POLL_SEC + ' วิ) • หรือกดปุ่มด้านล่าง'
        : '⚪ กดปุ่มด้านล่าง 1 ครั้งเพื่อตั้งค่า แล้วแท็บนี้จะรับคำขอจากแอปได้';
    }

    for (;;) {                                                  // คอยรับคำขอ
      await sleep(POLL_SEC * 1000);
      if (!onPage() || running || !myShop) continue;
      try {
        const r = await api('shopeePoll', { shop: myShop, account: myAccount }, true);
        if (r.job) {
          label.textContent = '📥 ได้รับคำขอจากแอป – เริ่มทำงาน…';
          await run(myShop, 'queue');
        }
      } catch (e) { /* เน็ตหลุดชั่วคราว รอบหน้าค่อยลองใหม่ */ }
    }
  })();
})();
