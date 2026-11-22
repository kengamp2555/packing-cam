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
  if (msg && msg.cmd === 'reset') { chrome.storage.local.remove(['lzState']).then(() => reply({ ok: true })); return true; }
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
    if ((await store.get('lzOn')) !== false) st.lazada = await pollLazada(url);
    st.ok = true;
  } catch (e) { st.ok = false; st.error = String(e && e.message || e); }
  finally { busy = false; }
  await store.set('lastRun', st);
  badge(st);
  return st;
}
function badge(st) {
  const err = !st.ok || (st.lazada && st.lazada.error);
  chrome.action.setBadgeBackgroundColor({ color: err ? '#d93025' : '#1a73e8' });
  chrome.action.setBadgeText({ text: err ? '!' : (st.lazada && st.lazada.newIn ? String(st.lazada.newIn) : '') });
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
  for (let i = 0; i < r.items.length; i += 100) {
    const resp = await fetch(hubUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ch: LZ_CH, items: r.items.slice(i, i + 100) }) });
    let j = null; try { j = await resp.json(); } catch (e) { }
    if (!j || !j.ok) throw new Error('Chat Hub ไม่รับข้อมูล' + (j && j.error ? ' (' + j.error + ')' : ' – ตรวจลิงก์ในตั้งค่า'));
  }
  await store.set('lzState', { since: state.since, seen: r.seen });
  const newIn = r.items.filter(m => m.dir === 'in');
  if (newIn.length && state.seen && Object.keys(state.seen).length) {   // ไม่เด้งตอนดึงครั้งแรก
    const by = {}; newIn.forEach(m => { by[m.name] = m.text; });
    const names = Object.keys(by);
    chrome.notifications.create('lz' + Date.now(), { type: 'basic', iconUrl: 'icon128.png', title: '💬 Lazada · ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : ''), message: String(by[names[0]] || '').slice(0, 120), priority: 1 });
  }
  return { sessions: r.checked, items: r.items.length, newIn: newIn.length };
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
