const $ = id => document.getElementById(id);
chrome.storage.local.get(['hubUrl', 'lzOn']).then(r => { $('url').value = r.hubUrl || ''; $('lz').checked = r.lzOn !== false; });
$('save').onclick = async () => {
  const u = $('url').value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\?src=ext&k=\w+$/.test(u)) { $('msg').textContent = '❌ ลิงก์ไม่ถูกต้อง – คัดลอกจาก Chat Hub → ⚙ ตั้งค่า → กล่อง Lazada / Shopee'; return; }
  await chrome.storage.local.set({ hubUrl: u, lzOn: $('lz').checked });
  $('msg').textContent = '⏳ บันทึกแล้ว · กำลังลองดึงแชท (ครั้งแรกอาจใช้ 1–2 นาที)…';
  const st = await chrome.runtime.sendMessage({ cmd: 'pollNow' });
  const lz = (st && st.lazada) || {};
  $('msg').textContent = st && st.ok && !lz.error ? '✅ ใช้ได้แล้ว · Lazada ส่งเข้า Chat Hub ' + (lz.items || 0) + ' ข้อความ จาก ' + (lz.sessions || 0) + ' แชท'
    : '❌ ' + ((st && st.error) || lz.error || 'ไม่สำเร็จ');
};
$('reset').onclick = async () => { await chrome.runtime.sendMessage({ cmd: 'reset' }); $('msg').textContent = 'ล้างความจำแล้ว – รอบหน้าจะดึงย้อน 3 วันใหม่'; };
