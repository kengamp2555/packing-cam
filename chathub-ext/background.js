/* 💬 Chat Hub Connector · background (Manifest V3)
 * ทุก 1 นาที: ใช้แท็บ Lazada Seller Center (ปักหมุดไว้ · เปิดให้เองถ้าไม่มี) อ่านแชทที่มีข้อความใหม่ → ส่งเข้า Chat Hub
 * อ่านอย่างเดียว: ไม่ส่งข้อความ ไม่กดอ่าน ไม่เปลี่ยนอะไรใน Lazada
 */
const LZ_CHAT = 'https://sellercenter.lazada.co.th/apps/im/chat';
const LZ_CH = 'lazada-kengamp';
const FIRST_DAYS = 3;            // ครั้งแรก: ดึงย้อนหลังกี่วัน

const store = {
  get: k => chrome.storage.local.get(k).then(r => r[k]),
  set: (k, v) => chrome.storage.local.set({ [k]: v })
};
function ensureAlarm() { chrome.alarms.get('poll', a => { if (!a) chrome.alarms.create('poll', { periodInMinutes: 1, delayInMinutes: 0.1 }); }); }
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); chrome.runtime.openOptionsPage(); });
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'poll') pollAll('auto'); });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.cmd === 'pollNow') { pollAll('manual').then(r => reply(r)); return true; }
  if (msg && msg.cmd === 'reset') { chrome.storage.local.remove(['lzState', 'spState']).then(() => reply({ ok: true })); return true; }
});
chrome.notifications.onClicked.addListener(async () => { const u = await store.get('hubUrl'); if (u) chrome.tabs.create({ url: u.split('?')[0] }); });

let busy = false;
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
  await sendHub(hubUrl, LZ_CH, r.items);
  await store.set('lzState', { since: state.since, seen: r.seen });
  const newIn = r.items.filter(m => m.dir === 'in');
  if (newIn.length && state.seen && Object.keys(state.seen).length) notifyNew('Lazada', newIn);   // ไม่เด้งตอนดึงครั้งแรก
  return { sessions: r.checked, items: r.items.length, newIn: newIn.length };
}
/* ---------- Shopee (Seller Centre แชท · ร้านที่ล็อกอินอยู่ในเบราว์เซอร์นี้) ---------- */
const SP_CHAT = 'https://seller.shopee.co.th/new-webchat/conversations';
const SP_CH = { kengann9: 'shopee-kengann9', keng77: 'shopee-keng77' };   // ชื่อผู้ใช้ร้าน → ช่องทางใน Chat Hub
async function shopeeTab() {
  const tabs = await chrome.tabs.query({ url: 'https://seller.shopee.co.th/*' });
  let t = tabs.find(x => /webchat/.test(x.url || '')) || tabs[0];
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
  await sendHub(hubUrl, ch, r.items);
  const first = !all[r.user];
  all[r.user] = { since: r.since, seen: r.seen };
  await store.set('spState', all);
  const newIn = r.items.filter(m => m.dir === 'in');
  if (newIn.length && !first) notifyNew('Shopee ' + r.user, newIn);
  return { shop: r.user, sessions: r.checked, items: r.items.length, newIn: newIn.length };
}
async function sendHub(hubUrl, ch, items) {
  for (let i = 0; i < items.length; i += 100) {
    const resp = await fetch(hubUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ch, items: items.slice(i, i + 100) }) });
    let j = null; try { j = await resp.json(); } catch (e) { }
    if (!j || !j.ok) throw new Error('Chat Hub ไม่รับข้อมูล' + (j && j.error ? ' (' + j.error + ')' : ' – ตรวจลิงก์ในตั้งค่า'));
  }
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
  const txt = m => {
    const c = m.content || {}, t = m.type;
    if (/^(text|extended_markdown|faq_liveagent)$/.test(t)) return String(c.text || '');
    if (t === 'rich_text') return String(c.plain_text || c.text_without_image || c.text || '');
    if (t === 'image') return '[รูปภาพ]';
    if (t === 'sticker') return '[สติกเกอร์]';
    if (/^product/.test(t)) return '[สินค้า] ' + (c.product_name || c.name || c.title || '');
    if (/order/.test(t)) return '[คำสั่งซื้อ] ' + (c.order_sn || c.order_id || '');
    if (t === 'notification' || t === 'faq_unsupported') return '';
    return typeof m.custom_preview_text === 'string' && m.custom_preview_text ? m.custom_preview_text : '[' + t + ']';
  };
  let checked = 0;
  for (const c of convs || []) {
    const last = Date.parse(c.last_message_time) || 0, prev = Number(seen[c.id] || state.since || 0);
    if (!c.id || last <= prev) continue;
    checked++;
    try {
      const M = await get('v1.2/conversations/' + c.id + '/messages?shop_id=' + shopId + '&offset=0&limit=20&direction=older&biz_id=0&on_message_received=true');
      (M || []).forEach(m => {
        const at = Date.parse(m.created_at) || (Number(m.created_timestamp) * 1000) || 0, text = txt(m);
        if (!text || at <= prev) return;
        const out = String(m.from_shop_id || '') === shopId;
        items.push({ uid: String(c.id), name: c.to_name || '', pic: c.to_avatar || '', at, dir: out ? 'out' : 'in', type: m.type === 'image' ? 'image' : 'text',
          text: (out && /^faq/.test(m.type) ? '🤖 ' : '') + text, media: m.type === 'image' ? String((m.content || {}).url || (m.content || {}).thumb_url || '') : '', msgId: String(m.id) });
      });
      seen[c.id] = last;
    } catch (e) { if (e.message === 'login') return { error: 'login' }; }
    await new Promise(r => setTimeout(r, 300));
  }
  items.sort((a, b) => a.at - b.at);
  return { user, since: state.since, seen, items, checked };
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
  const parse = m => {
    const b = m.body || {}, t = b.typeData || {}, card = b.layoutData && b.layoutData.card;
    let td = {}; try { td = JSON.parse(b.templateData || '{}'); } catch (e) { }
    let text = '';
    if (card === 1 && td.txt) { text = String(td.txt); if (/^\{/.test(text)) { try { const o = JSON.parse(text); text = o.th || o.en || Object.values(o)[0] || text; } catch (e) { } } }
    else if (card === 3) text = '[รูปภาพ]';
    else if (td.title) text = '[สินค้า] ' + td.title + (td.price ? ' · ' + td.price : '');
    else if (td.txt) { text = String(td.txt); try { const o = JSON.parse(text); text = o.th || o.en || text; } catch (e) { } }
    else text = t.summary || '[ข้อความ]';
    const ext = t.ext || {}, bot = ext.fromLisa || /assistant/i.test(ext.fromAccountNickname || '');
    return { at: Number(t.sendTime) || Date.now(), dir: Number(t.fromType) === 1 ? 'in' : 'out', type: card === 3 ? 'image' : 'text', text: (bot && Number(t.fromType) !== 1 ? '🤖 ' : '') + text, msgId: t.mid || t.bizUnique };
  };
  let checked = 0;
  for (const sv of sessions) {
    const sd = sv.sessionData || {}, last = Number(sd.lastMessageTime || 0), prev = Number(seen[sv.sessionId] || state.since || 0);
    if (!sv.sessionId || last <= prev) continue;
    checked++;
    try {
      const r = await req('mtop.im.use.seller.messagebox.queryMessageListBySessionId', Object.assign({ sessionViewId: sv.sessionId, startTime: String(Date.now()), fetchCount: 20, isDownward: false }, base));
      ((r.data && r.data.result) || []).map(parse).filter(x => x.msgId && x.at > prev)
        .forEach(x => items.push(Object.assign(x, { uid: sv.sessionId, name: sd.title || '', pic: sd.headUrl || '' })));
      seen[sv.sessionId] = last;
    } catch (e) { /* แชทนี้ลองใหม่รอบหน้า */ }
    await new Promise(r => setTimeout(r, 400));
  }
  items.sort((a, b) => a.at - b.at);
  return { items, seen, checked };
}
