/* 🧰 KengAmp ผู้ช่วยร้าน (เดิมชื่อ Chat Hub Connector) · background (Manifest V3)
 * 2 งาน: 💬 แชท Shopee / Lazada ↔ Chat Hub  ·  🟢 งานเบื้องหลังของ POS (เปิดหน้าตามรอบ)
 * ทุก 1 นาที: ใช้แท็บแชท Lazada / Shopee (ปักหมุดไว้ · เปิดให้เองถ้าไม่มี) อ่านแชทที่มีข้อความใหม่ → ส่ง "ข้อมูลดิบ" เข้า Chat Hub
 * การแปลงข้อความ (การ์ดสินค้า รูป ป้าย AI ฯลฯ) ทำที่ Chat Hub (Parse.gs) → แก้วิธีแสดงผลได้โดยไม่ต้องอัปเดตส่วนเสริม
 * ส่งข้อความเฉพาะที่ผู้ใช้พิมพ์ตอบใน Chat Hub (คิว Outbox) · นอกนั้นอ่านอย่างเดียว
 */
const VER = chrome.runtime.getManifest().version;
const VER_URL = 'https://kengamp2555.github.io/packing-cam/chathub-ext/version.json';
const LZ_CHAT = 'https://sellercenter.lazada.co.th/apps/im/chat';
const LZ_CH = 'lazada-kengamp';
const FIRST_DAYS = 3;            // ครั้งแรก: ดึงย้อนหลังกี่วัน

const store = {
  get: k => chrome.storage.local.get(k).then(r => r[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v })
};
function ensureAlarm() {
  chrome.alarms.get('poll', a => { if (!a) chrome.alarms.create('poll', { periodInMinutes: 1, delayInMinutes: 0.1 }); });
  chrome.alarms.get('jobs', a => { if (!a) chrome.alarms.create('jobs', { periodInMinutes: 5, delayInMinutes: 0.5 }); });   // งานเบื้องหลัง (Packing Cam)
  chrome.alarms.get('out', a => { if (!a) chrome.alarms.create('out', { periodInMinutes: 0.5, delayInMinutes: 0.2 }); });   // คิวข้อความตอบจาก Chat Hub
}
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); chrome.runtime.openOptionsPage(); });
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'poll') { pollAll('auto'); checkUpdate(); } if (a.name === 'out') processOutbox(); if (a.name === 'jobs') { runJobs(); runCatalog(); } });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.cmd === 'pollNow') { pollAll('manual').then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'outboxNow') { outboxSoon(); reply({ ok: true }); return; }   // สะกิดจากหน้า Chat Hub (hubpoke.js)
  if (msg && msg.cmd === 'catalogNow') { runCatalog(true).then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'runJobs') { runJobs(true).then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'checkUpdate') { checkUpdate(true).then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'reset') { chrome.storage.local.remove(['lzState', 'spState', 'lnState']).then(() => reply({ ok: true })); return true; }
});
chrome.notifications.onClicked.addListener(async () => { const u = await store.get('hubUrl'); if (u) chrome.tabs.create({ url: u.split('?')[0] }); });

/* ---------- งานเบื้องหลัง: แทนการเปิดหน้าเองในกล่อง "สิ่งที่ต้องเปิด / ทำ" ของ POS ----------
 * รายการ + สถานะมาจาก Packing Cam (ผ่าน Chat Hub) ทุก 5 นาที · งานจริงยังทำโดยสคริปต์ Tampermonkey เดิมในหน้านั้น
 *  - "เปิดค้างไว้ทั้งวัน" (หน้าคืนเงิน Shopee): เปิดแท็บปักหมุดค้างไว้ให้
 *  - "งานตามรอบ" ที่ถึงรอบ: เปิดแท็บเบื้องหลัง → รอสคริปต์ทำเสร็จ (สถานะเป็น ✓) → ปิดแท็บเอง
 *    ไม่เสร็จใน 20 นาที (เช่น Shopee ถามรหัสผ่าน / หลุดล็อกอิน) → แจ้งเตือน ปล่อยแท็บไว้ให้คนจัดการ · ลองใหม่ทุก 3 ชม.
 *  - งานของร้าน Shopee ทำเฉพาะร้านที่ล็อกอินอยู่ใน Chrome นี้ */
const JOB_WAIT = 20 * 60e3, JOB_RETRY = 3 * 3600e3, JOB_GIVEUP = 2 * 3600e3;
let jobsBusy = false;
async function tabAlive(id) { try { await chrome.tabs.get(id); return true; } catch (e) { return false; } }
async function keepOpen(url) {
  const base = url.split('?')[0];
  const r = await helperTab(u => u.split('?')[0].indexOf(base) === 0, url, true);
  return r.opened ? 'opened' : 'ok';
}
async function runJobs(manual) {
  if (jobsBusy) return store.get('jobsLast');
  if (!manual && (await store.get('jobsOn')) === false) return null;
  const hubUrl = await store.get('hubUrl'); if (!hubUrl) return null;
  jobsBusy = true;
  const out = { at: Date.now(), items: [] };
  try {
    const j = await hubPost(hubUrl, { cmd: 'jobs', ver: VER });
    if (!j || !j.ok) throw new Error((j && j.error) || 'Chat Hub ไม่ตอบ');
    const spUser = String((await store.get('spCh')) || '').replace(/^shopee-/, '').toLowerCase();
    const sharedOff = (await store.get('jobsSharedOn')) === false;   // งานที่ไม่ผูกกับร้าน Shopee (LnwShop, Lazada) ทำแค่โปรไฟล์เดียว
    const st = (await store.get('jobState')) || {}, now = Date.now();
    for (const t of j.tabs || []) {
      const shop = (String(t.key).match(/^(?:shopee|income):(.+)$/) || [])[1];
      if (shop && shop.toLowerCase() !== spUser) { out.items.push({ label: t.label, state: 'skip', note: 'ร้านนี้ไม่ได้ล็อกอินใน Chrome นี้' }); continue; }
      if (!shop && sharedOff) { out.items.push({ label: t.label, state: 'skip', note: 'ปิดไว้ในโปรไฟล์นี้ (ให้โปรไฟล์หลักทำ)' }); continue; }
      if (t.group === 'open') { const r = await keepOpen(t.url); out.items.push({ label: t.label, state: t.online ? 'ok' : 'wait', note: r === 'ok' ? (t.online ? 'เปิดอยู่' : 'เปิดอยู่ รอสคริปต์ส่งสถานะ') : 'เพิ่งเปิดแท็บให้' }); continue; }
      const s = st[t.key] || {};
      if (t.online) {   // ทำเสร็จแล้ว → ปิดแท็บที่ส่วนเสริมเปิดไว้
        if (s.tabId && await tabAlive(s.tabId)) { try { await chrome.tabs.remove(s.tabId); } catch (e) { } }
        st[t.key] = { doneAt: t.at };
        out.items.push({ label: t.label, state: 'ok', note: 'เสร็จแล้ว' }); continue;
      }
      if (s.tabId && await tabAlive(s.tabId)) {
        if (now - s.openedAt > JOB_WAIT && !s.notified) {
          s.notified = true;
          chrome.notifications.create('job' + now, { type: 'basic', iconUrl: 'icon128.png', title: '⚠️ งานยังไม่เสร็จ: ' + t.label, message: 'เปิดแท็บนั้นค้างไว้ 20 นาทีแล้วยังไม่เสร็จ – อาจต้องใส่รหัสผ่าน หรือล็อกอินใหม่ (' + (t.sub || '') + ')', priority: 2 });
        }
        if (now - s.openedAt > JOB_GIVEUP) { try { await chrome.tabs.remove(s.tabId); } catch (e) { } delete s.tabId; }
        st[t.key] = s;
        out.items.push({ label: t.label, state: s.notified ? 'warn' : 'run', note: s.notified ? 'ยังไม่เสร็จ – เปิดแท็บดู' : 'กำลังทำ' }); continue;
      }
      if (s.openedAt && now - s.openedAt < JOB_RETRY) { out.items.push({ label: t.label, state: 'warn', note: 'ยังไม่เสร็จ – ลองใหม่ ' + new Date(s.openedAt + JOB_RETRY).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }); continue; }
      const tab = await tabLock(async () => { const x = await chrome.tabs.create({ url: t.url, active: false }); await intoGroup(x); return x; });
      st[t.key] = { openedAt: now, tabId: tab.id };
      out.items.push({ label: t.label, state: 'run', note: 'เพิ่งเปิดแท็บให้' });
    }
    await store.set('jobState', st);
  } catch (e) { out.error = String(e && e.message || e); }
  finally { jobsBusy = false; }
  await store.set('jobsLast', out);
  return out;
}

/* ---------- LINE OA (chat.line.biz) · ข้อความที่ร้านตอบในแอป LINE OA (Webhook ไม่ส่งมาให้) + สถานะอ่าน ----------
 * ข้อความจากลูกค้ายังมาทาง Webhook ตามเดิม · ส่วนเสริมส่งเฉพาะ "ข้อความที่ร้านส่ง" + เวลาที่ลูกค้าอ่าน */
const LN_CHAT = 'https://chat.line.biz/';
const LN_CH = { 'C-Store': 'line-cstore', 'KengAmp': 'line-kengamp' };   // ชื่อบัญชี LINE OA → ช่องทางใน Chat Hub
async function lineTab() { return platTab(u => /^https:\/\/chat\.line\.biz\//.test(u), LN_CHAT, 'LINE OA'); }
async function pollLineOA(hubUrl) {
  const state = (await store.get('lnState')) || {};
  const tab = await lineTab();
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: lnPollInPage, args: [state, LN_CH] });
  const r = res && res.result;
  if (!r) return { error: 'อ่านหน้า LINE OA ไม่ได้' };
  if (r.error) {
    if (r.error === 'login') await notifyOnce('lnlogin', 'LINE OA Manager ออกจากระบบแล้ว', 'เปิดกลุ่มแท็บ 🧰 ผู้ช่วยร้าน → แท็บ LINE แล้วล็อกอินใหม่');
    return { error: r.error === 'login' ? 'ต้องล็อกอิน LINE OA (chat.line.biz) ใหม่' : r.error };
  }
  let n = 0;
  for (const b of r.bots) { await sendHub(hubUrl, b.ch, 'lineoa', {}, b.items, b.threads, { links: b.links }); n += b.items.length; }
  await store.set('lnState', r.state);
  return { bots: r.bots.map(b => b.name).join(', '), items: n };
}
/* รันในหน้า chat.line.biz (world: MAIN) · ใช้ session ของหน้าเว็บเอง · อ่านอย่างเดียว */
async function lnPollInPage(state, map) {
  const get = async u => { const r = await fetch(u, { credentials: 'include' }); if (r.status === 401 || r.status === 403) throw new Error('login'); if (!r.ok) throw new Error('LINE OA ตอบ ' + r.status); return r.json(); };
  const shrink = async (url) => {   // รูปที่ร้านส่ง → ย่อเหลือด้านยาว 1280px (JPEG) ส่งให้ Chat Hub เก็บลง Drive
    try {
      const b = await (await fetch(url, { credentials: 'include' })).blob();
      const bm = await createImageBitmap(b), k = Math.min(1, 1280 / Math.max(bm.width, bm.height));
      const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85).split(',')[1];
    } catch (e) { return ''; }
  };
  let bots;
  try { bots = (await get('/api/v1/bots')).list || []; } catch (e) { return { error: e.message === 'login' ? 'login' : e.message }; }
  const out = [], st = Object.assign({}, state), first = !Object.keys(state).length, since = Date.now() - 3 * 864e5;
  for (const b of bots) {
    const ch = map[b.name]; if (!ch) continue;
    const seen = Object.assign({}, st[b.botId] || {}), items = [], threads = [], links = {};   // links: รหัสแชทของ LINE OA ≠ รหัสลูกค้าใน Webhook → ส่งชื่อ + รหัสข้อความลูกค้าให้ Chat Hub จับคู่
    let chats = [];
    try { chats = (await get('/api/v2/bots/' + b.botId + '/chats?folderType=ALL&limit=25')).list || []; }   // สูงสุด 25 ต่อครั้ง
    catch (e) { if (e.message === 'login') return { error: 'login' }; return { error: b.name + ': ' + e.message }; }
    for (const c of chats) {
      if (c.chatType && c.chatType !== 'USER') continue;
      threads.push({ uid: c.chatId, raw: { userLastReadAt: c.userLastReadAt || 0, lastSentAt: c.lastSentAt || 0 } });
      links[c.chatId] = { name: (c.profile || {}).name || '', hint: [] };
      const last = Number(c.lastSentAt || 0), prev = Number(seen[c.chatId] || (first ? since : since));
      if (!last || last <= prev) continue;
      try {
        const m = await get('/api/v3/bots/' + b.botId + '/chats/' + c.chatId + '/messages?limit=30');
        links[c.chatId].hint = (m.list || []).filter(ev => ev.type === 'message' && ev.message && ev.message.id).slice(0, 10).map(ev => String(ev.message.id));
        for (const ev of m.list || []) {
          if (ev.type !== 'messageSent' || !ev.message || !ev.message.id || ev.timestamp <= prev) continue;
          const raw = { type: ev.type, timestamp: ev.timestamp, message: Object.assign({}, ev.message) };
          delete raw.message.quoteToken;
          if (raw.message.type === 'image' && raw.message.contentHash) raw._b64 = await shrink('https://chat-content.line.biz/bot/' + b.botId + '/' + raw.message.contentHash);
          delete raw.message.contentProvider;
          items.push({ uid: c.chatId, name: (c.profile || {}).name || '', pic: (c.profile || {}).iconHash ? 'https://profile.line-scdn.net/' + c.profile.iconHash + '/preview' : '', at: ev.timestamp, msgId: String(ev.message.id), raw });
        }
        seen[c.chatId] = last;
      } catch (e) { if (e.message === 'login') return { error: 'login' }; }
      await new Promise(r => setTimeout(r, 250));
    }
    st[b.botId] = seen;
    items.sort((a, z) => a.at - z.at);
    out.push({ name: b.name, ch, items, threads, links });
  }
  return { bots: out, state: st };
}

/* ---------- 📦 รายการสินค้า (ให้กล่องค้นหาสินค้าใน Chat Hub) ----------
 * วันละครั้ง: อ่านรายการสินค้าที่ขายอยู่จากหน้า Seller Centre (Shopee ร้านที่ล็อกอิน · Lazada) → ส่งเข้า Chat Hub ทั้งชุด
 * อ่านอย่างเดียว · ใช้แท็บแชทที่ปักหมุดไว้ */
let catBusy = false;
async function runCatalog(force) {
  if (catBusy) return store.get('catLast');
  const hubUrl = await store.get('hubUrl'); if (!hubUrl) return null;
  const last = (await store.get('catAt')) || {}, now = Date.now(), out = { at: now, res: {} };
  catBusy = true;
  try {
    if ((await store.get('lzOn')) !== false && (force || !last[LZ_CH] || now - last[LZ_CH] > 20 * 3600e3)) {
      try {
        const tab = await lazadaTab();
        const r = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: lzCatalogInPage }))[0].result;
        if (!r || r.error) throw new Error((r && r.error) || 'อ่านหน้า Lazada ไม่ได้');
        const j = await hubPost(hubUrl, { cmd: 'catalog', ch: LZ_CH, items: r.items, ver: VER });
        if (!j || !j.ok) throw new Error((j && j.error) || 'Chat Hub ไม่รับ');
        last[LZ_CH] = now; out.res.lazada = r.items.length + ' รายการ';
      } catch (e) { out.res.lazada = '❌ ' + (e && e.message || e); }
    }
    const spCh = await store.get('spCh');
    if ((await store.get('spOn')) !== false && spCh && (force || !last[spCh] || now - last[spCh] > 20 * 3600e3)) {
      try {
        const tab = await shopeeTab();
        const r = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: spCatalogInPage }))[0].result;
        if (!r || r.error) throw new Error((r && r.error) || 'อ่านหน้า Shopee ไม่ได้');
        const ch = SP_CH[String(r.user || '').toLowerCase()];
        if (!ch) throw new Error('ร้าน ' + r.user + ' ยังไม่มีใน Chat Hub');
        const j = await hubPost(hubUrl, { cmd: 'catalog', ch, items: r.items, ver: VER });
        if (!j || !j.ok) throw new Error((j && j.error) || 'Chat Hub ไม่รับ');
        last[ch] = now; out.res.shopee = r.user + ' ' + r.items.length + ' รายการ';
      } catch (e) { out.res.shopee = '❌ ' + (e && e.message || e); }
    }
    await store.set('catAt', last);
  } finally { catBusy = false; }
  if (Object.keys(out.res).length) await store.set('catLast', out);
  return out;
}
/* รันในหน้า Shopee Seller Centre: รายการสินค้าที่ขายอยู่ (หน้าละ 48) */
async function spCatalogInPage() {
  const ses = JSON.parse(localStorage.getItem('chat-session') || 'null');
  if (!ses || !ses.shop) return { error: 'ต้องล็อกอิน Shopee' };
  const ck = Object.fromEntries(document.cookie.split('; ').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
  const shopId = ses.shop.id, items = []; let total = 1;
  for (let p = 1; (p - 1) * 48 < total && p <= 80; p++) {
    const r = await fetch('/api/v3/opt/mpsku/list/v2/get_product_list?SPC_CDS=' + encodeURIComponent(ck.SPC_CDS || '') + '&SPC_CDS_VER=2&page_number=' + p + '&page_size=48&list_type=live_all&need_ads=false', { credentials: 'include' });
    const j = await r.json();
    if (j.code !== 0) return { error: 'Shopee ตอบ: ' + String(j.msg || j.code).slice(0, 100) };
    total = (j.data.page_info || {}).total || 0;
    (j.data.products || []).forEach(x => {
      const pd = x.price_detail || {}, lo = pd.selling_price_min || pd.price_min, hi = pd.selling_price_max || pd.price_max;
      const models = (x.model_list || []).filter(m => m.name).slice(0, 60).map(m => { const pd2 = m.price_detail || {}, pp = Number(pd2.promotion_price) > 0 ? pd2.promotion_price : pd2.origin_price;
        return { n: String(m.name).slice(0, 80), p: pp ? '฿' + pp : '', s: Number((m.stock_detail || {}).total_available_stock || 0) }; });
      items.push({ id: String(x.id), name: x.name || '', sku: x.parent_sku || '', price: lo == hi ? '฿' + lo : '฿' + lo + '–' + hi, stock: Number((x.stock_detail || {}).total_available_stock || 0), models,
        img: x.cover_image ? 'https://cf.shopee.co.th/file/' + x.cover_image + '_tn' : '', url: 'https://shopee.co.th/product/' + shopId + '/' + x.id });
    });
    await new Promise(r => setTimeout(r, 250));
  }
  return { user: ses.user && ses.user.name, items };
}
/* รันในหน้า Lazada Seller Center: รายการสินค้าที่ขายอยู่ (หน้าละ 100) */
async function lzCatalogInPage() {
  for (let i = 0; i < 30 && !(window.lib && window.lib.mtop); i++) await new Promise(r => setTimeout(r, 500));
  if (!(window.lib && window.lib.mtop)) return { error: 'หน้า Lazada ยังโหลดไม่เสร็จ หรือออกจากระบบแล้ว' };
  const api = 'mtop.lazada.merchant.product.manager.simple.render.list', items = []; let total = 1;
  for (let p = 1; (p - 1) * 100 < total && p <= 60; p++) {
    let r;
    try {
      r = await window.lib.mtop.request({ v: '1.0', appKey: '4272', timeout: 30000, H5Request: true, type: 'GET', method: 'GET', api, url: api, dataType: 'json', valueType: 'original', 'x-i18n-regionID': 'LAZADA_TH',
        data: { bizParam: JSON.stringify({ version: 'simple', allFormData: { tab: 'online_product' }, type: 'simple' }), jsonBody: JSON.stringify({ tab: 'online_product', table: { sort: {} }, filter: {}, pagination: { current: p, pageSize: 100 } }) } });
    } catch (e) { return { error: 'Lazada ตอบผิดพลาด: ' + JSON.stringify((e && e.ret) || e).slice(0, 100) }; }
    const d = (r.data && r.data.data) || {};
    total = ((d.pagination || {}).total) || 0;
    ((d.table || {}).dataSource || []).forEach(x => {
      const it = x.itemDesc || {}, pr = (x.price || {}).price || '';
      const models = (x.subDataSource || []).slice(0, 60).map(m => ({ n: String(m.variation && m.variation !== '-' ? m.variation : '').slice(0, 80), p: (m.price || {}).price ? '฿' + String(m.price.price).replace(/\s*THB/gi, '').replace(/-/, '–').trim() : '', s: Number(String((m.stock || {}).text || '0').replace(/[^\d]/g, '')) || 0 })).filter(m => m.n);
      items.push({ id: String(x.productId || x.itemId || ''), name: it.title || '', sku: '', price: pr ? '฿' + String(pr).replace(/-/, '–') : '', stock: Number(String((x.stock || {}).text || '0').replace(/[^\d]/g, '')) || 0, models,
        img: it.imageUrl || '', url: it.pdpLink || (x.productId ? 'https://www.lazada.co.th/products/i' + x.productId + '.html' : '') });
    });
    await new Promise(r => setTimeout(r, 300));
  }
  return { items };
}

/* ---------- เช็กเวอร์ชันใหม่ (วันละไม่กี่ครั้ง) ---------- */
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate(force) {
  const last = await store.get('updCheckedAt');
  if (!force && last && Date.now() - last < 6 * 3600e3) return store.get('update');
  await store.set('updCheckedAt', Date.now());
  try {
    const j = await (await fetch(VER_URL + '?t=' + Date.now(), { cache: 'no-store' })).json();
    const upd = j && j.version && newer(j.version, VER) ? { version: j.version, zip: j.zip, notes: j.notes || '' } : null;
    const prev = await store.get('update');
    await store.set('update', upd);
    if (upd && (!prev || prev.version !== upd.version)) chrome.notifications.create('upd', { type: 'basic', iconUrl: 'icon128.png', title: '🔔 KengAmp ผู้ช่วยร้าน มีเวอร์ชันใหม่ ' + upd.version, message: (upd.notes || '') + ' · กดไอคอนส่วนเสริม → ดาวน์โหลด', priority: 1 });
    return upd;
  } catch (e) { return store.get('update'); }
}

let busy = false;
/* ---------- ส่งข้อความที่ตอบจาก Chat Hub (คิว Outbox) ---------- */
async function hubPost(hubUrl, body) {
  const r = await fetch(hubUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  return r.json();
}
let outboxAgain = false;
/** ส่งคิวทันที · ถ้ากำลังดึงแชท / ส่งอยู่ → ทำต่อทันทีที่เสร็จ */
function outboxSoon() { if (busy) outboxAgain = true; else processOutbox(); }
async function processOutbox() {
  if (busy) { outboxAgain = true; return; }
  outboxAgain = false;
  const hubUrl = await store.get('hubUrl'); if (!hubUrl) return;
  const chs = [];
  if ((await store.get('lzOn')) !== false) chs.push(LZ_CH);
  const spCh = await store.get('spCh'); if ((await store.get('spOn')) !== false && spCh) chs.push(spCh);
  if (!chs.length) return;
  busy = true; let sent = 0;
  try {
    const j = await hubPost(hubUrl, { cmd: 'outbox', chs, ver: VER });
    for (const it of (j && j.items) || []) {
      let res;
      let uid = it.uid;
      try {
        const run = async (tab, func, args) => (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func, args }))[0].result;
        const om = /^order:([\w-]+):(\d*)$/.exec(uid);   // ข้อความตามคำสั่งซื้อ (เช่น แจ้งออกใบกำกับ) → หาห้องแชทของผู้ซื้อก่อน
        if (it.ch === LZ_CH) {
          const tab = await lazadaTab();
          if (om) { const f = await run(tab, lzResolveBuyer, [om[2]]); if (!f || f.error) throw new Error((f && f.error) || 'หาห้องแชทไม่ได้'); uid = f.uid; }
          res = await run(tab, lzSendInPage, [uid, it.text, it.image || null]);
        } else {
          const tab = await shopeeTab(true);
          if (om) { const f = await run(tab, spResolveOrder, [om[1]]); if (!f || f.error) throw new Error((f && f.error) || 'หาห้องแชทไม่ได้'); uid = f.uid; }
          res = await run(tab, spSendInPage, [uid, it.text, it.image || null]);
        }
      } catch (e) { res = { error: String(e && e.message || e) }; }
      res = res || { error: 'ไม่มีผลตอบกลับจากหน้าเว็บ' };
      if (res.ok) sent++;
      await hubPost(hubUrl, { cmd: 'outboxDone', id: it.id, ok: !!res.ok, error: res.error || '', uid });
    }
  } catch (e) { console.warn('outbox', e); }
  finally { busy = false; if (outboxAgain) setTimeout(processOutbox, 0); }
  if (sent) setTimeout(() => pollAll('afterSend'), 3000);   // ดึงข้อความจริงกลับมาแทนตัวชั่วคราว
}

async function pollAll(why) {
  if (busy) return { ok: false, msg: 'กำลังทำงานอยู่' };
  busy = true;
  const st = { at: Date.now(), why };
  try {
    const url = await store.get('hubUrl');
    if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์ Chat Hub (กดไอคอน → ตั้งค่า)');
    // 3 แพลตฟอร์มดึงพร้อมกัน (คนละแท็บ) – เดิมทำทีละอัน รอนาน
    const run = async (on, k, fn) => { if ((await store.get(on)) === false) return; try { st[k] = await fn(url); } catch (e) { st[k] = { error: String(e && e.message || e) }; } };
    await Promise.all([run('lzOn', 'lazada', pollLazada), run('spOn', 'shopee', pollShopee), run('lnOn', 'line', pollLineOA)]);
    st.ok = true;
  } catch (e) { st.ok = false; st.error = String(e && e.message || e); }
  finally { busy = false; if (outboxAgain) setTimeout(processOutbox, 0); }
  await store.set('lastRun', st);
  badge(st);
  return st;
}
function badge(st) {
  const err = !st.ok || (st.lazada && st.lazada.error) || (st.shopee && st.shopee.error);
  const n = ((st.lazada && st.lazada.newIn) || 0) + ((st.shopee && st.shopee.newIn) || 0);
  chrome.action.setBadgeBackgroundColor({ color: err ? '#d93025' : '#1a73e8' });
  chrome.action.setBadgeText({ text: err ? '!' : (n ? String(n) : '') });
}

/* ---------- Lazada ---------- */
async function lazadaTab() { return platTab(u => /^https:\/\/sellercenter\.lazada\.co\.th\/apps\/im\//.test(u), LZ_CHAT, 'Lazada'); }
/* ---------- 🧰 แท็บผู้ช่วย: รวมไว้ในกลุ่มแท็บ "🧰 ผู้ช่วยร้าน" (ยุบไว้) · 1 แท็บต่องาน ใช้ซ้ำ ไม่เปิดใหม่ ----------
 * แท็บปักหมุดแบบเดิม → ถอดหมุดแล้วย้ายเข้ากลุ่ม (แท็บปักหมุดอยู่ในกลุ่มไม่ได้) · แท็บที่ผู้ใช้เปิดเอง (ไม่ปักหมุด/ไม่อยู่ในกลุ่ม) ไม่ยุ่ง */
const GRP_TITLE = '🧰 ผู้ช่วยร้าน';
/* ---------- กลุ่มแท็บ 🧰 ผู้ช่วยร้าน ----------
 * เดิม: 3 แพลตฟอร์มเปิดแท็บพร้อมกันตอนเปิด Chrome → ต่างคนต่างสร้างกลุ่มใหม่ (กลุ่มซ้ำหลายกลุ่ม)
 *       และหน้าที่ยังไม่ล็อกอินถูกพาไปหน้า login (ลิงก์ไม่ตรง) → หาแท็บไม่เจอ → เปิดแท็บใหม่ทุกรอบ
 * ตอนนี้: ทำทีละคำสั่ง (คิว) · รวมกลุ่มซ้ำเป็นกลุ่มเดียว · จำรหัสแท็บที่เปิดให้แต่ละงาน → อยู่หน้า login ก็ใช้แท็บเดิม ไม่เปิดเพิ่ม */
let tabQ = Promise.resolve();
function tabLock(fn) { const r = tabQ.then(fn, fn); tabQ = r.catch(() => { }); return r; }
async function ourGroup(windowId) {
  try {
    const gs = await chrome.tabGroups.query({ title: GRP_TITLE }); if (!gs.length) return null;
    // กลุ่มชื่อเดียวกันหลายกลุ่มในหน้าต่างเดียวกัน → ย้ายแท็บเข้ากลุ่มแรก (กลุ่มที่ว่างจะหายไปเอง)
    const byWin = {}; gs.forEach(g => (byWin[g.windowId] = byWin[g.windowId] || []).push(g));
    for (const w of Object.keys(byWin)) { const [keep, ...extra] = byWin[w].sort((a, b) => a.id - b.id);
      for (const g of extra) { try { const ts = await chrome.tabs.query({ groupId: g.id }); if (ts.length) await chrome.tabs.group({ groupId: keep.id, tabIds: ts.map(t => t.id) }); } catch (e) { } } }
    const first = Object.values(byWin).map(a => a[0]);
    return first.find(g => g.windowId === windowId) || first[0] || null;
  } catch (e) { return null; }
}
async function intoGroup(tab) {
  try {
    if (tab.pinned) tab = await chrome.tabs.update(tab.id, { pinned: false });
    const g = await ourGroup(tab.windowId);
    if (g) { if (tab.groupId !== g.id) await chrome.tabs.group({ groupId: g.id, tabIds: [tab.id] }); }
    else { const gid = await chrome.tabs.group({ tabIds: [tab.id] }); await chrome.tabGroups.update(gid, { title: GRP_TITLE, color: 'blue', collapsed: true }); }
    await chrome.tabs.update(tab.id, { autoDiscardable: false });
  } catch (e) { console.warn('intoGroup', e); }
  return tab;
}
/** หาแท็บผู้ช่วยของงานนี้ (match = ฟังก์ชันตรวจ URL) · ไม่มี → ใช้แท็บที่เคยเปิดให้งานนี้ (แม้ถูกพาไปหน้า login) → ไม่มีจริง ๆ ค่อยเปิดใหม่ในกลุ่ม
 *  คืน { tab, opened, login } · login = แท็บอยู่หน้าอื่น (มักเป็นหน้าเข้าสู่ระบบ) */
function helperTab(match, url, noWait) { return tabLock(() => helperTabNow(match, url, noWait)); }
async function helperTabNow(match, url, noWait) {
  const all = await chrome.tabs.query({}), g = await ourGroup(), inG = x => g && x.groupId === g.id;
  const found = all.filter(x => match(x.url || x.pendingUrl || ''));
  let t = found.find(inG) || found.find(x => x.pinned) || found[0];
  for (const x of found) if (t && x.id !== t.id && (inG(x) || x.pinned)) { try { await chrome.tabs.remove(x.id); } catch (e) { } }
  const map = (await store.get('helperTabs')) || {};
  if (!t && map[url]) {   // แท็บที่เคยเปิดให้งานนี้ยังอยู่ แต่ไปอยู่หน้าอื่น (เช่น หน้า login) → ใช้แท็บเดิม ไม่เปิดเพิ่ม
    const old = all.find(x => x.id === map[url]);
    if (old) { if (old.groupId !== (g && g.id)) await intoGroup(old); return { tab: old, opened: false, login: true }; }
  }
  if (!t) {
    t = await chrome.tabs.create({ url, active: false });
    await intoGroup(t);
    map[url] = t.id; await store.set('helperTabs', map);
    if (!noWait) await waitComplete(t.id);
    t = await chrome.tabs.get(t.id);
    return { tab: t, opened: true, login: !match(t.url || t.pendingUrl || '') && !t.pendingUrl };
  }
  if (map[url] !== t.id) { map[url] = t.id; await store.set('helperTabs', map); }
  if (t.pinned) t = await intoGroup(t);   // แท็บปักหมุดรุ่นเก่า → ย้ายเข้ากลุ่ม
  else if (inG(t)) { try { await chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (e) { } }
  if (t.discarded) { await chrome.tabs.reload(t.id); if (!noWait) await waitComplete(t.id); }
  return { tab: t, opened: false };
}
/** แท็บของแพลตฟอร์ม · ยังไม่ล็อกอิน → แจ้งเตือน (3 ชม./ครั้ง) และหยุดรอบนี้ (ไม่เปิดแท็บเพิ่ม) */
async function platTab(match, url, name) {
  const r = await helperTab(match, url);
  if (r.login) {
    await notifyOnce('login_' + name, name + ' ยังไม่ได้ล็อกอิน', 'เปิดกลุ่มแท็บ 🧰 ผู้ช่วยร้าน → แท็บ ' + name + ' แล้วล็อกอิน · ระหว่างนี้ส่วนเสริมจะไม่เปิดแท็บเพิ่ม');
    throw new Error('ต้องล็อกอิน ' + name + ' ในแท็บกลุ่ม 🧰 ผู้ช่วยร้าน');
  }
  return r.tab;
}
function waitComplete(id) {
  return new Promise(res => {
    const done = () => { chrome.tabs.onUpdated.removeListener(f); clearTimeout(h); setTimeout(res, 1500); };
    const f = (tid, info) => { if (tid === id && info.status === 'complete') done(); };
    const h = setTimeout(done, 30000);
    chrome.tabs.onUpdated.addListener(f);
  });
}
async function pollLazada(hubUrl) {
  const state = (await store.get('lzState')) || { since: Date.now() - FIRST_DAYS * 864e5, seen: {} };
  const tab = await lazadaTab();
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: lzPollInPage, args: [state] });
  const r = res && res.result;
  if (!r) return { error: 'อ่านหน้า Lazada ไม่ได้' };
  if (r.error) {
    if (r.error === 'login') await notifyOnce('lzlogin', 'Lazada Seller Center ออกจากระบบแล้ว', 'เปิดกลุ่มแท็บ 🧰 ผู้ช่วยร้าน → แท็บ Lazada แล้วล็อกอินใหม่');
    return { error: r.error === 'login' ? 'ต้องล็อกอิน Lazada ใหม่' : r.error };
  }
  const fresh = await sendHub(hubUrl, LZ_CH, 'lazada', {}, r.items, r.threads);
  await store.set('lzState', { since: state.since, seen: r.seen });
  if (fresh.length && state.seen && Object.keys(state.seen).length) notifyNew('Lazada', fresh);   // ไม่เด้งตอนดึงครั้งแรก
  return { sessions: r.checked, items: r.items.length, newIn: fresh.length };
}
/* ---------- Shopee (Seller Centre แชท · ร้านที่ล็อกอินอยู่ในเบราว์เซอร์นี้) ---------- */
const SP_CHAT = 'https://seller.shopee.co.th/new-webchat/conversations';
const SP_CH = { kengann9: 'shopee-kengann9', keng77: 'shopee-keng77' };   // ชื่อผู้ใช้ร้าน → ช่องทางใน Chat Hub
async function shopeeTab() { return platTab(u => /^https:\/\/seller\.shopee\.co\.th\/new-webchat/.test(u), SP_CHAT, 'Shopee'); }
async function pollShopee(hubUrl) {
  const all = (await store.get('spState')) || {};
  const tab = await shopeeTab();
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: spPollInPage, args: [all] });
  const r = res && res.result;
  if (!r) return { error: 'อ่านหน้า Shopee ไม่ได้' };
  if (r.error) {
    if (r.error === 'login') await notifyOnce('splogin', 'Shopee Seller Centre ออกจากระบบแล้ว', 'เปิดกลุ่มแท็บ 🧰 ผู้ช่วยร้าน → แท็บ Shopee แล้วล็อกอินใหม่');
    return { error: r.error === 'login' ? 'ต้องล็อกอิน Shopee ใหม่ (เปิดหน้าแชทใน Seller Centre)' : r.error };
  }
  const ch = SP_CH[String(r.user || '').toLowerCase()];
  if (!ch) return { error: 'ร้าน Shopee "' + r.user + '" ยังไม่มีใน Chat Hub' };
  await store.set('spCh', ch);
  const fresh = await sendHub(hubUrl, ch, 'shopee', { shopId: r.shopId }, r.items, r.threads);
  const first = !all[r.user];
  all[r.user] = { since: r.since, seen: r.seen };
  await store.set('spState', all);
  if (fresh.length && !first) notifyNew('Shopee ' + r.user, fresh);
  return { shop: r.user, sessions: r.checked, items: r.items.length, newIn: fresh.length };
}
/** ส่งข้อมูลดิบเข้า Chat Hub ทีละ 40 ข้อความ · คืนรายการข้อความลูกค้าที่เพิ่งเข้าใหม่ (Chat Hub เป็นคนบอก) */
async function sendHub(hubUrl, ch, src, ctx, items, threads, extra) {
  const fresh = [];
  for (let i = 0; i < Math.max(items.length, 1); i += 40) {   // อย่างน้อย 1 ครั้งเสมอ (ส่งข้อมูลห้องแชท = สถานะอ่าน แม้ไม่มีข้อความใหม่)
    const resp = await fetch(hubUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ ch, src, ctx, ver: VER, items: items.slice(i, i + 40), threads: i === 0 ? (threads || []) : [] }, i === 0 ? extra || {} : {})) });
    let j = null; try { j = await resp.json(); } catch (e) { }
    if (!j || !j.ok) throw new Error('Chat Hub ไม่รับข้อมูล' + (j && j.error ? ' (' + j.error + ')' : ' – ตรวจลิงก์ในตั้งค่า'));
    (j.fresh || []).forEach(x => fresh.push(x));
  }
  return fresh;
}
function notifyNew(label, newIn) {
  const by = {}; newIn.forEach(m => { by[m.name] = m.text; });
  const names = Object.keys(by);
  chrome.notifications.create('n' + Date.now(), { type: 'basic', iconUrl: 'icon128.png', title: '💬 ' + label + ' · ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : ''), message: String(by[names[0]] || '').slice(0, 120), priority: 1 });
}
/* รันในหน้า Seller Centre (world: MAIN) · ใช้ session แชทของหน้าเว็บเอง · อ่านอย่างเดียว */
async function spPollInPage(all) {
  let ses = null;
  for (let i = 0; i < 20; i++) { try { ses = JSON.parse(localStorage.getItem('chat-session') || 'null'); } catch (e) { } if (ses && ses.token) break; await new Promise(r => setTimeout(r, 500)); }
  if (!ses || !ses.token || !ses.user) return { error: 'login' };
  const user = String(ses.user.name || ''), state = all[user] || { since: Date.now() - 3 * 864e5, seen: {} };
  const ck = Object.fromEntries(document.cookie.split('; ').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
  const tail = '_uid=' + ses.user.uid + '&_v=9.1.17&csrf_token=&SPC_CDS_CHAT=' + (ck.SPC_CDS_CHAT || '') + '&x-shop-region=TH&_api_source=webchat';
  const get = async p => {
    const r = await fetch('/webchat/api/' + p + (p.includes('?') ? '&' : '?') + tail, { credentials: 'include', headers: { Authorization: 'Bearer ' + ses.token } });
    if (r.status === 401 || r.status === 403) throw new Error('login');
    if (!r.ok) throw new Error('Shopee ตอบ ' + r.status);
    return r.json();
  };
  let convs;
  try { convs = await get('v1.2/conversations?direction=older&type=all&limit=30&biz_id=0'); }
  catch (e) { return { error: e.message === 'login' ? 'login' : e.message }; }
  const shopId = String(ses.shop && ses.shop.id || ''), seen = Object.assign({}, state.seen || {}), items = [];
  /* ตัดส่วนที่ไม่ใช้ (คำแปลหลายภาษา ข้อมูลติดตาม) ให้ข้อมูลดิบเล็กลง · ที่เหลือส่งทั้งก้อนให้ Chat Hub แปลงเอง */
  const DROP = /^(translated_text|buyer_translated_text|translated_with_lang|translated_text_list|noti_text_of_all_languages|follow_up_question|tracking_play_load|msg_tag|msg_attr|crm_activity_id|warning|waring_tip_types|feedback_info|request_id|region|country|model_price_info|selling_point|review_bar|edt|image_overlays_hash|pass_through_data|crm_message_preview|crm_sender_message_preview|latest_message_content|attributes|official_chat|choice_entity)$/;
  const slim = (v, d) => {
    if (d > 8 || v == null) return v;
    if (Array.isArray(v)) return v.slice(0, 8).map(x => slim(x, d + 1));
    if (typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (!DROP.test(k)) o[k] = slim(v[k], d + 1); }); return o; }
    return typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) : v;
  };
  let checked = 0;
  for (const c of convs || []) {
    const last = Date.parse(c.last_message_time) || 0, prev = Number(seen[c.id] || state.since || 0);
    if (!c.id || last <= prev) continue;
    checked++;
    try {
      const M = await get('v1.2/conversations/' + c.id + '/messages?shop_id=' + shopId + '&offset=0&limit=20&direction=older&biz_id=0&on_message_received=true');
      (M || []).forEach(m => {
        const at = Date.parse(m.created_at) || (Number(m.created_timestamp) * 1000) || 0;
        if (!m.id || at <= prev) return;
        items.push({ uid: String(c.id), name: c.to_name || '', pic: c.to_avatar || '', at, msgId: String(m.id), raw: slim(m, 0) });
      });
      seen[c.id] = last;
    } catch (e) { if (e.message === 'login') return { error: 'login' }; }
    await new Promise(r => setTimeout(r, 300));
  }
  items.sort((a, b) => a.at - b.at);
  const threads = (convs || []).filter(c => c && c.id).map(c => ({ uid: String(c.id), raw: slim(c, 0) }));   // ห้องแชท (สถานะอ่าน ฯลฯ) ให้ Chat Hub แปลงเอง
  return { user, shopId, since: state.since, seen, items, checked, threads };
}

/* รันในหน้าแชท Shopee (world: MAIN) · ส่งแบบเดียวกับคนพิมพ์: เปิดแชท → ใส่ข้อความในช่องพิมพ์ → Enter
 * ใช้ปุ่ม/ช่องพิมพ์ของหน้าเว็บเอง (ระบบของ Shopee ทำงานตามปกติทุกอย่าง) · ไม่ยุ่งถ้ามีข้อความพิมพ์ค้างอยู่ */
async function spSendInPage(convId, text, image) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fiberProps = el => { const k = Object.keys(el).find(x => x.startsWith('__reactFiber')); let f = k && el[k]; for (let i = 0; i < 8 && f; i++, f = f.return) { const p = f.memoizedProps; if (p && p.conversation && p.conversation.id) return p; } return null; };
  const cells = () => [...document.querySelectorAll('[data-cy^="webchat-conversation-cell-root"]')];
  let grid = null;
  for (let i = 0; i < 40 && !(grid = document.querySelector('[data-cy="webchat-conversation-list"] .ReactVirtualized__Grid')); i++) await sleep(500);
  if (!grid) return { error: 'หน้าแชท Shopee ยังโหลดไม่เสร็จ หรือออกจากระบบแล้ว' };
  const current = () => { const c = document.querySelector('[data-cy="webchat-conversation-cell-root-current"]'); const p = c && fiberProps(c); return p ? String(p.conversation.id) : ''; };
  if (current() !== String(convId)) {
    // หน้าแชทเปิดแท็บ "สำคัญ" ไว้ (แบ่งกลุ่ม ปักหมุด / ตอบกลับอัตโนมัติ / ตอบกลับเอง แสดงทีละกลุ่ม) → สลับไปแท็บ "ทั้งหมด" ให้เห็นทุกแชทเรียงกัน
    const wrap = document.querySelector('[data-cy="webchat-conversation-list-wrapper"]');
    const allTab = wrap && [...wrap.querySelectorAll('*')].find(e => (e.innerText || '').trim() === 'ทั้งหมด' && ![...e.children].some(c => (c.innerText || '').trim() === 'ทั้งหมด'));
    if (allTab) { allTab.click(); await sleep(1200); grid = document.querySelector('[data-cy="webchat-conversation-list"] .ReactVirtualized__Grid') || grid; }
    let cell = null; grid.scrollTop = 0; await sleep(500);
    for (let i = 0; i < 60 && !cell; i++) {
      cell = cells().find(e => { const p = fiberProps(e); return p && String(p.conversation.id) === String(convId); });
      if (cell) break;
      const before = grid.scrollTop; grid.scrollTop += Math.max(200, grid.clientHeight * 0.8); await sleep(350);
      if (grid.scrollTop === before) break;
    }
    if (!cell) return { error: 'ไม่พบแชทนี้ในรายการของหน้า Shopee (อาจเก่าเกินไป) – ตอบในหน้า Shopee แทน' };
    cell.click();
    for (let i = 0; i < 30 && current() !== String(convId); i++) await sleep(300);
    if (current() !== String(convId)) return { error: 'เปิดแชทนี้ในหน้า Shopee ไม่ได้' };
    await sleep(800);
  }
  if (image) {   // รูป: ใส่ไฟล์ให้ปุ่มแนบรูปของหน้าแชท (เหมือนคนกดเลือกรูป) แล้วรอดูว่ารูปขึ้นในแชทจริง
    const box = document.querySelector('[data-cy="webchat-conversation-detail-input"]');
    const inp = box && [...box.querySelectorAll('input[type=file]')].find(x => /image/.test(x.accept));
    if (!inp) return { error: 'ไม่พบปุ่มแนบรูปในหน้า Shopee (แชทนี้อาจส่งรูปไม่ได้)' };
    const ses = JSON.parse(localStorage.getItem('chat-session') || '{}');
    const ck = Object.fromEntries(document.cookie.split('; ').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
    const tail = '_uid=' + (ses.user || {}).uid + '&_v=9.1.17&csrf_token=&SPC_CDS_CHAT=' + (ck.SPC_CDS_CHAT || '') + '&x-shop-region=TH&_api_source=webchat';
    const lastImg = async () => {
      try {
        const r = await fetch('/webchat/api/v1.2/conversations/' + convId + '/messages?shop_id=' + (ses.shop || {}).id + '&offset=0&limit=5&direction=older&biz_id=0&on_message_received=true&' + tail, { credentials: 'include', headers: { Authorization: 'Bearer ' + ses.token } });
        const M = await r.json(); const m = (M || []).find(x => x.type === 'image' && String(x.from_shop_id) === String((ses.shop || {}).id)); return m ? String(m.id) : '';
      } catch (e) { return ''; }
    };
    // ถาดรูปที่รอส่ง (รูปที่เลือกไว้แต่ยังไม่กดส่ง) = รูป <img> ในกล่องพิมพ์ · มีของค้างอยู่ → ไม่ยุ่ง
    const trayImgs = () => [...box.querySelectorAll('img')].filter(x => x.offsetParent && x.getBoundingClientRect().width > 40);
    if (trayImgs().length) return { error: 'มีรูปที่เลือกค้างไว้ในหน้า Shopee (ยังไม่ได้กดส่ง) – ส่งหรือลบรูปนั้นในหน้า Shopee ก่อน แล้วกดส่งใหม่' };
    const ta0 = box.querySelector('textarea');
    if (ta0 && ta0.value.trim()) return { error: 'มีข้อความพิมพ์ค้างอยู่ในช่องพิมพ์ของหน้า Shopee – ไม่ได้ส่ง (กันทับข้อความที่พิมพ์ไว้)' };
    const before = await lastImg();
    const bin = atob(image.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], image.name || 'image.jpg', { type: image.mime || 'image/jpeg' }));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    // Shopee ใส่รูปลงถาดก่อน แล้วต้องกดส่ง (เหมือนคนกด Enter / ลูกศรส่ง)
    for (let i = 0; i < 20 && !trayImgs().length; i++) await sleep(500);
    if (!trayImgs().length) return { error: 'หน้า Shopee ไม่รับรูป (ไม่ขึ้นในถาดรูป) – ลองส่งในหน้า Shopee แทน' };
    await sleep(800);
    const ta = box.querySelector('textarea');
    const pressEnter = () => ta && ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    const clickSend = () => {   // ปุ่มลูกศรส่ง = ปุ่มที่กดได้ซึ่งอยู่ขวาล่างสุดของกล่องพิมพ์
      const cs = [...box.querySelectorAll('*')].filter(e => { const k = Object.keys(e).find(x => x.startsWith('__reactProps')); return k && e[k].onClick && e.offsetParent; });
      const r0 = box.getBoundingClientRect();
      const btn = cs.map(e => ({ e, r: e.getBoundingClientRect() })).filter(o => o.r.width > 0 && o.r.bottom > r0.bottom - 80 && o.r.right > r0.right - 90).sort((a, b) => (b.r.right + b.r.bottom) - (a.r.right + a.r.bottom))[0];
      if (btn) btn.e.click(); return !!btn;
    };
    pressEnter();
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const now = await lastImg(); if (now && now !== before) return { ok: true };
      if (i === 4 && trayImgs().length) clickSend();   // Enter ไม่ส่ง → กดลูกศรส่ง
    }
    return { error: 'ใส่รูปแล้วแต่ไม่เห็นรูปขึ้นในแชทภายใน 30 วินาที – ดูในหน้า Shopee: ถ้ารูปยังค้างในถาด กดส่งหรือลบรูปนั้น (ระวังส่งซ้ำ)' };
  }
  let ta = null;
  for (let i = 0; i < 20 && !(ta = document.querySelector('[data-cy="webchat-conversation-detail-input"] textarea')); i++) await sleep(300);
  if (!ta) return { error: 'ไม่พบช่องพิมพ์ในหน้า Shopee (แชทนี้อาจตอบไม่ได้แล้ว)' };
  if (ta.value.trim()) return { error: 'มีข้อความพิมพ์ค้างอยู่ในช่องพิมพ์ของหน้า Shopee – ไม่ได้ส่ง (กันทับข้อความที่พิมพ์ไว้)' };
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(400);
  if (ta.value !== text) { set.call(ta, ''); ta.dispatchEvent(new Event('input', { bubbles: true })); return { error: 'ใส่ข้อความในช่องพิมพ์ไม่ได้' }; }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  for (let i = 0; i < 25 && ta.value; i++) await sleep(300);
  if (ta.value) { set.call(ta, ''); ta.dispatchEvent(new Event('input', { bubbles: true })); return { error: 'หน้า Shopee ไม่ยอมส่ง (อาจมีหน้าต่างเตือนขึ้น) – ตอบในหน้า Shopee แทน' }; }
  return { ok: true };
}
/* รันในหน้า Shopee: เลขคำสั่งซื้อ → ผู้ซื้อ → ห้องแชทที่ลูกค้าเคยทักมา (อ่านอย่างเดียว) */
async function spResolveOrder(orderSn) {
  const ck = Object.fromEntries(document.cookie.split('; ').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
  const q = 'SPC_CDS=' + encodeURIComponent(ck.SPC_CDS || '') + '&SPC_CDS_VER=2';
  const h = await (await fetch('/api/v3/order/get_order_list_search_bar_hint?keyword=' + encodeURIComponent(orderSn) + '&category=1&order_list_tab=100&list_type=all&' + q, { credentials: 'include' })).json();
  const hit = ((((h || {}).data || {}).order_sn_result || {}).list || []).find(x => String(x.order_sn).toUpperCase() === String(orderSn).toUpperCase());
  if (!hit) return { error: 'ไม่พบคำสั่งซื้อ ' + orderSn + ' ในร้าน Shopee ที่ล็อกอินอยู่' };
  const o = await (await fetch('/api/v3/order/get_one_order?order_id=' + hit.order_id + '&' + q, { credentials: 'include' })).json();
  const buyer = ((o || {}).data || {}).buyer_user || {};
  const ses = JSON.parse(localStorage.getItem('chat-session') || 'null'); if (!ses || !ses.token) return { error: 'ต้องล็อกอิน Shopee ใหม่' };
  const tail = '_uid=' + ses.user.uid + '&_v=9.1.17&csrf_token=&SPC_CDS_CHAT=' + (ck.SPC_CDS_CHAT || '') + '&x-shop-region=TH&_api_source=webchat';
  const convs = await (await fetch('/webchat/api/v1.2/conversations?direction=older&type=all&limit=30&biz_id=0&' + tail, { credentials: 'include', headers: { Authorization: 'Bearer ' + ses.token } })).json();
  const c = (convs || []).find(x => (buyer.user_id && String(x.to_id) === String(buyer.user_id)) || (hit.buyer_name && x.to_name === hit.buyer_name));
  if (!c) return { error: 'ไม่พบห้องแชทของผู้ซื้อ ' + (hit.buyer_name || '') + ' ในแชทล่าสุด 30 ห้อง – แจ้งลูกค้าในแชทเอง' };
  return { uid: String(c.id) };
}
/* รันในหน้า Lazada: รหัสผู้ซื้อ → ห้องแชท (อ่านอย่างเดียว) */
async function lzResolveBuyer(buyerId) {
  for (let i = 0; i < 30 && !(window.lib && window.lib.mtop); i++) await new Promise(r => setTimeout(r, 500));
  if (!(window.lib && window.lib.mtop)) return { error: 'หน้า Lazada ยังโหลดไม่เสร็จ หรือออกจากระบบแล้ว' };
  const base = { accessKey: 'lazada-pc-h5', accessToken: 'lazada-test-secret', accountType: 2, nodeId: 1 }, api = 'mtop.im.use.web.seller.messagebox.querySessionList';
  for (let page = 1; page <= 3; page++) {
    let r; try { r = await window.lib.mtop.request({ v: '1.0', appKey: '4272', timeout: 30000, H5Request: true, type: 'GET', method: 'GET', api, url: api, dataType: 'json', valueType: 'original', 'x-i18n-regionID': 'LAZADA_TH', data: Object.assign({ startTime: String(Date.now()), fetchCount: 30, pageNum: page }, base) }); }
    catch (e) { return { error: 'Lazada ตอบผิดพลาด' }; }
    const L = (r.data && r.data.sessionViewDTOList) || [];
    const hit = L.find(sv => { const p = String(sv.sessionId).split('#'); return (p[3] === '1' && p[2] === String(buyerId)) || (p[5] === '1' && p[4] === String(buyerId)); });
    if (hit) return { uid: String(hit.sessionId) };
    if (L.length < 30) break;
  }
  return { error: 'ไม่พบห้องแชทของผู้ซื้อนี้ใน Lazada (ลูกค้ายังไม่เคยทัก หรือแชทเก่าเกินไป) – แจ้งลูกค้าในแชทเอง' };
}
/* รันในหน้า Lazada (world: MAIN) · ส่งด้วยคำสั่งเดียวกับปุ่มส่งของหน้าแชท Lazada (lib.mtop ของหน้าเว็บเอง) */
async function lzSendInPage(sessionId, text, image) {
  for (let i = 0; i < 30 && !(window.lib && window.lib.mtop); i++) await new Promise(r => setTimeout(r, 500));
  if (!(window.lib && window.lib.mtop)) return { error: 'หน้า Lazada ยังโหลดไม่เสร็จ หรือออกจากระบบแล้ว' };
  // รหัสแชท "1#103#<id>#<ประเภท>#<id>#<ประเภท>" · ลูกค้า = ฝั่งที่ประเภทเป็น 1 (ลำดับสลับได้)
  const p = String(sessionId).split('#'), bi = p[3] === '1' ? 2 : p[5] === '1' ? 4 : -1;
  if (p.length < 6 || bi < 0) return { error: 'รหัสแชท Lazada ไม่ถูกต้อง' };
  const buyerId = p[bi], accountType = '1';
  let content = JSON.stringify({ txt: text }), templateId = 1;
  if (image) {   // รูป: อัปโหลดเข้าที่เก็บไฟล์แชทของ Lazada (แบบเดียวกับปุ่มแนบรูป) แล้วส่งเป็นข้อความรูป
    try {
      const bin = atob(image.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const fd = new FormData(); fd.append('file', new Blob([u8], { type: image.mime || 'image/jpeg' }), image.name || 'image.jpg'); fd.append('bizCode', 'lazada_th_im_seller');
      const up = await (await fetch('https://filebroker.lazada.co.th/upload/public', { method: 'POST', body: fd, credentials: 'include' })).json();
      if (!up || up.code !== 0 || !up.url) return { error: 'อัปโหลดรูปเข้า Lazada ไม่สำเร็จ: ' + JSON.stringify(up).slice(0, 120) };
      content = JSON.stringify({ image: up.url, imgUrl: up.url, width: up.width || image.w || 0, height: up.height || image.h || 0 }); templateId = 3;
    } catch (e) { return { error: 'อัปโหลดรูปเข้า Lazada ไม่สำเร็จ: ' + (e && e.message || e) }; }
  }
  const api = 'mtop.im.receiver.web.seller.imMessage.sendImMessage';
  try {
    const r = await window.lib.mtop.request({ v: '1.0', appKey: '4272', timeout: 30000, H5Request: true, type: 'POST', method: 'POST', api, url: api, dataType: 'json', valueType: 'original', 'x-i18n-regionID': 'LAZADA_TH',
      data: { buyerId, accountType, accessKey: 'lazada-pc-h5', accessToken: 'lazada-test-secret', sessionId, content, templateId, fromAppKey: 'H5_24813843',
        bizUnique: crypto.randomUUID(), ext: JSON.stringify(templateId === 1 ? { templateId: 1, fromCode: 'sc_seller_default' } : { fromCode: 'sc_seller_default' }), extraAttr: '{}' } });
    const ret = JSON.stringify((r && r.ret) || '');
    if (/SUCCESS/.test(ret) || (r && r.data && !/FAIL|ERROR/i.test(ret))) return { ok: true };
    return { error: 'Lazada ตอบ: ' + ret.slice(0, 150) };
  } catch (e) { return { error: 'Lazada ไม่รับ: ' + JSON.stringify((e && e.ret) || (e && e.message) || e).slice(0, 150) }; }
}

async function notifyOnce(key, title, message) {
  const k = 'notified_' + key, last = await store.get(k);
  if (last && Date.now() - last < 3 * 3600e3) return;
  await store.set(k, Date.now());
  chrome.notifications.create(key, { type: 'basic', iconUrl: 'icon128.png', title, message, priority: 2 });
}

/* รันในหน้า Lazada (world: MAIN) · ใช้ lib.mtop ของหน้าเว็บเอง · อ่านอย่างเดียว */
async function lzPollInPage(state) {
  for (let i = 0; i < 30 && !(window.lib && window.lib.mtop); i++) await new Promise(r => setTimeout(r, 500));
  if (!(window.lib && window.lib.mtop)) return { error: /login/.test(location.href) ? 'login' : 'หน้า Lazada ยังโหลดไม่เสร็จ' };
  if (/\/login/.test(location.pathname)) return { error: 'login' };
  const req = (api, data) => window.lib.mtop.request({ v: '1.0', appKey: '4272', timeout: 30000, H5Request: true, type: 'GET', method: 'GET', api, url: api,
    data, dataType: 'json', valueType: 'original', 'x-i18n-regionID': 'LAZADA_TH' });
  const base = { accessKey: 'lazada-pc-h5', accessToken: 'lazada-test-secret', accountType: 2, nodeId: 1 };
  let sres;
  try { sres = await req('mtop.im.use.web.seller.messagebox.querySessionList', Object.assign({ startTime: String(Date.now()), fetchCount: 30, pageNum: 1 }, base)); }
  catch (e) { const ret = JSON.stringify((e && e.ret) || e || ''); return { error: /SESSION|LOGIN|TOKEN_EXOIRED|FAIL_SYS_SESSION/i.test(ret) ? 'login' : 'Lazada ตอบผิดพลาด: ' + ret.slice(0, 120) }; }
  const sessions = (sres && sres.data && sres.data.sessionViewDTOList) || [];
  const seen = Object.assign({}, state.seen || {}), items = [];
  const at = m => Number(((m.body || {}).typeData || {}).sendTime) || 0;
  const mid = m => { const t = (m.body || {}).typeData || {}; return t.mid || t.bizUnique || ''; };
  let checked = 0;
  for (const sv of sessions) {
    const sd = sv.sessionData || {}, last = Number(sd.lastMessageTime || 0), prev = Number(seen[sv.sessionId] || state.since || 0);
    if (!sv.sessionId || last <= prev) continue;
    checked++;
    try {
      const r = await req('mtop.im.use.seller.messagebox.queryMessageListBySessionId', Object.assign({ sessionViewId: sv.sessionId, startTime: String(Date.now()), fetchCount: 20, isDownward: false }, base));
      const fresh = ((r.data && r.data.result) || []).filter(m => mid(m) && at(m) > prev);
      // รูปที่ลูกค้าส่งมามีแค่รหัสไฟล์ (osskey) → ขอลิงก์ดาวน์โหลด (อายุ 7 วัน) แบบเดียวกับหน้าแชท Lazada · Chat Hub จะดาวน์โหลดเก็บลง Drive เอง
      const sp = String(sv.sessionId).split('#'), buyerId = sp[3] === '1' ? sp[2] : sp[5] === '1' ? sp[4] : '';
      for (const m of fresh) {
        const b = m.body || {}; let td = {}; try { td = JSON.parse(b.templateData || '{}'); } catch (e) { }
        if (td.osskey && buyerId && !/^https?:/.test(td.imgUrl || td.image || '')) {
          try {
            const dr = await req('mtop.im.use.web.seller.mtopimmediaservice.getDownloadToken', { accessKey: base.accessKey, accessToken: base.accessToken, accountType: '1', buyerId, objectKey: td.osskey });
            if (dr && dr.data && dr.data.downloadUrl) m._dl = dr.data.downloadUrl;
          } catch (e) { }
        }
        items.push({ uid: sv.sessionId, name: sd.title || '', pic: sd.headUrl || '', at: at(m), msgId: String(mid(m)), raw: m });
      }
      seen[sv.sessionId] = last;
    } catch (e) { /* แชทนี้ลองใหม่รอบหน้า */ }
    await new Promise(r => setTimeout(r, 400));
  }
  items.sort((a, b) => a.at - b.at);
  const threads = sessions.filter(sv => sv.sessionId).map(sv => ({ uid: sv.sessionId, raw: sv }));   // ห้องแชท (สถานะอ่าน ฯลฯ) ให้ Chat Hub แปลงเอง
  return { items, seen, checked, threads };
}
