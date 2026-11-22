/* 💬 Chat Hub Connector · background (Manifest V3)
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
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'poll') { pollAll('auto'); checkUpdate(); } if (a.name === 'out') processOutbox(); if (a.name === 'jobs') runJobs(); });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.cmd === 'pollNow') { pollAll('manual').then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'runJobs') { runJobs(true).then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'checkUpdate') { checkUpdate(true).then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'reset') { chrome.storage.local.remove(['lzState', 'spState']).then(() => reply({ ok: true })); return true; }
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
  const base = url.split('?')[0], u = new URL(base);
  const tabs = await chrome.tabs.query({ url: u.origin + (u.pathname || '/') + '*' });
  let t = tabs[0];
  if (!t) { t = await chrome.tabs.create({ url, active: false, pinned: true }); return 'opened'; }
  try { await chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (e) { }
  if (t.discarded) { await chrome.tabs.reload(t.id); return 'reloaded'; }
  return 'ok';
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
    const st = (await store.get('jobState')) || {}, now = Date.now();
    for (const t of j.tabs || []) {
      const shop = (String(t.key).match(/^(?:shopee|income):(.+)$/) || [])[1];
      if (shop && shop.toLowerCase() !== spUser) { out.items.push({ label: t.label, state: 'skip', note: 'ร้านนี้ไม่ได้ล็อกอินใน Chrome นี้' }); continue; }
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
      const tab = await chrome.tabs.create({ url: t.url, active: false });
      st[t.key] = { openedAt: now, tabId: tab.id };
      out.items.push({ label: t.label, state: 'run', note: 'เพิ่งเปิดแท็บให้' });
    }
    await store.set('jobState', st);
  } catch (e) { out.error = String(e && e.message || e); }
  finally { jobsBusy = false; }
  await store.set('jobsLast', out);
  return out;
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
    if (upd && (!prev || prev.version !== upd.version)) chrome.notifications.create('upd', { type: 'basic', iconUrl: 'icon128.png', title: '🔔 Chat Hub Connector มีเวอร์ชันใหม่ ' + upd.version, message: (upd.notes || '') + ' · กดไอคอนส่วนเสริม → ดาวน์โหลด', priority: 1 });
    return upd;
  } catch (e) { return store.get('update'); }
}

let busy = false;
/* ---------- ส่งข้อความที่ตอบจาก Chat Hub (คิว Outbox) ---------- */
async function hubPost(hubUrl, body) {
  const r = await fetch(hubUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  return r.json();
}
async function processOutbox() {
  if (busy) return;
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
      try {
        if (it.ch === LZ_CH) { const tab = await lazadaTab(); res = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: lzSendInPage, args: [it.uid, it.text, it.image || null] }))[0].result; }
        else { const tab = await shopeeTab(true); res = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: spSendInPage, args: [it.uid, it.text, it.image || null] }))[0].result; }
      } catch (e) { res = { error: String(e && e.message || e) }; }
      res = res || { error: 'ไม่มีผลตอบกลับจากหน้าเว็บ' };
      if (res.ok) sent++;
      await hubPost(hubUrl, { cmd: 'outboxDone', id: it.id, ok: !!res.ok, error: res.error || '' });
    }
  } catch (e) { console.warn('outbox', e); }
  finally { busy = false; }
  if (sent) setTimeout(() => pollAll('afterSend'), 3000);   // ดึงข้อความจริงกลับมาแทนตัวชั่วคราว
}

async function pollAll(why) {
  if (busy) return { ok: false, msg: 'กำลังทำงานอยู่' };
  busy = true;
  const st = { at: Date.now(), why };
  try {
    const url = await store.get('hubUrl');
    if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์ Chat Hub (กดไอคอน → ตั้งค่า)');
    if ((await store.get('lzOn')) !== false) { try { st.lazada = await pollLazada(url); } catch (e) { st.lazada = { error: String(e && e.message || e) }; } }
    if ((await store.get('spOn')) !== false) { try { st.shopee = await pollShopee(url); } catch (e) { st.shopee = { error: String(e && e.message || e) }; } }
    st.ok = true;
  } catch (e) { st.ok = false; st.error = String(e && e.message || e); }
  finally { busy = false; }
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
async function lazadaTab() {
  const tabs = await chrome.tabs.query({ url: 'https://sellercenter.lazada.co.th/*' });
  let t = tabs.find(x => /\/apps\/im\//.test(x.url || '')) || tabs[0];
  if (!t) {
    t = await chrome.tabs.create({ url: LZ_CHAT, active: false, pinned: true });
    await waitComplete(t.id);
  }
  try { await chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (e) { }
  if (t.discarded) { await chrome.tabs.reload(t.id); await waitComplete(t.id); }
  return t;
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
    if (r.error === 'login') await notifyOnce('lzlogin', 'Lazada Seller Center ออกจากระบบแล้ว', 'เปิดแท็บ Lazada ที่ปักหมุดไว้ แล้วล็อกอินใหม่');
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
async function shopeeTab(needChat) {
  const tabs = await chrome.tabs.query({ url: 'https://seller.shopee.co.th/*' });
  let t = tabs.find(x => /new-webchat/.test(x.url || '')) || (needChat ? null : tabs[0]);
  if (!t) { t = await chrome.tabs.create({ url: SP_CHAT, active: false, pinned: true }); await waitComplete(t.id); }
  try { await chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (e) { }
  if (t.discarded) { await chrome.tabs.reload(t.id); await waitComplete(t.id); }
  return t;
}
async function pollShopee(hubUrl) {
  const all = (await store.get('spState')) || {};
  const tab = await shopeeTab();
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: spPollInPage, args: [all] });
  const r = res && res.result;
  if (!r) return { error: 'อ่านหน้า Shopee ไม่ได้' };
  if (r.error) {
    if (r.error === 'login') await notifyOnce('splogin', 'Shopee Seller Centre ออกจากระบบแล้ว', 'เปิดแท็บ Shopee ที่ปักหมุดไว้ แล้วล็อกอินใหม่');
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
async function sendHub(hubUrl, ch, src, ctx, items, threads) {
  const fresh = [];
  for (let i = 0; i < Math.max(items.length, 1); i += 40) {   // อย่างน้อย 1 ครั้งเสมอ (ส่งข้อมูลห้องแชท = สถานะอ่าน แม้ไม่มีข้อความใหม่)
    const resp = await fetch(hubUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ch, src, ctx, ver: VER, items: items.slice(i, i + 40), threads: i === 0 ? (threads || []) : [] }) });
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
    const before = await lastImg();
    const bin = atob(image.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], image.name || 'image.jpg', { type: image.mime || 'image/jpeg' }));
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 25; i++) { await sleep(1000); const now = await lastImg(); if (now && now !== before) return { ok: true }; }
    return { error: 'ใส่รูปแล้วแต่ไม่เห็นรูปขึ้นในแชทภายใน 25 วินาที – ตรวจในหน้า Shopee ก่อนส่งใหม่ (อาจมีหน้าต่างให้กดยืนยัน)' };
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
      ((r.data && r.data.result) || []).filter(m => mid(m) && at(m) > prev)
        .forEach(m => items.push({ uid: sv.sessionId, name: sd.title || '', pic: sd.headUrl || '', at: at(m), msgId: String(mid(m)), raw: m }));
      seen[sv.sessionId] = last;
    } catch (e) { /* แชทนี้ลองใหม่รอบหน้า */ }
    await new Promise(r => setTimeout(r, 400));
  }
  items.sort((a, b) => a.at - b.at);
  const threads = sessions.filter(sv => sv.sessionId).map(sv => ({ uid: sv.sessionId, raw: sv }));   // ห้องแชท (สถานะอ่าน ฯลฯ) ให้ Chat Hub แปลงเอง
  return { items, seen, checked, threads };
}
