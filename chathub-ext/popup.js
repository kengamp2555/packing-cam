const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function show(st, hub) {
  if (!hub) { $('st').innerHTML = '<span class="err">⚠️ ยังไม่ได้ตั้งลิงก์ Chat Hub</span> – กด ⚙ ตั้งค่า'; return; }
  if (!st) { $('st').textContent = 'ยังไม่เคยทำงาน – กด ↻ ดึงแชทตอนนี้'; return; }
  const lz = st.lazada || {};
  $('st').innerHTML = 'รอบล่าสุด: ' + new Date(st.at).toLocaleTimeString('th-TH') + ' (' + (st.why === 'manual' ? 'กดเอง' : 'อัตโนมัติทุก 1 นาที') + ')<br>' +
    (st.ok ? '' : '<span class="err">❌ ' + esc(st.error) + '</span><br>') +
    '<b>Lazada:</b> ' + (lz.error ? '<span class="err">❌ ' + esc(lz.error) + '</span>' : st.ok ? '<span class="ok">✅ ตรวจ ' + (lz.sessions || 0) + ' แชท · ส่งเข้า ' + (lz.items || 0) + ' ข้อความ</span>' : '-') +
    '<br><b>Shopee:</b> ' + (function(sp) { return !sp ? '-' : sp.error ? '<span class="err">❌ ' + esc(sp.error) + '</span>' : '<span class="ok">✅ ' + esc(sp.shop) + ' · ตรวจ ' + (sp.sessions || 0) + ' แชท · ส่งเข้า ' + (sp.items || 0) + ' ข้อความ</span>'; })(st.shopee);
}
async function load() { const r = await chrome.storage.local.get(['lastRun', 'hubUrl']); show(r.lastRun, r.hubUrl); return r; }
load();
$('now').onclick = async () => { $('now').disabled = true; $('now').textContent = '⏳ กำลังดึง…'; const st = await chrome.runtime.sendMessage({ cmd: 'pollNow' }); const r = await chrome.storage.local.get('hubUrl'); show(st, r.hubUrl); $('now').disabled = false; $('now').textContent = '↻ ดึงแชทตอนนี้'; };
$('hub').onclick = async () => { const r = await load(); if (r.hubUrl) chrome.tabs.create({ url: r.hubUrl.split('?')[0] }); };
$('opt').onclick = () => chrome.runtime.openOptionsPage();
