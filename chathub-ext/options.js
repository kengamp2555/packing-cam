const $ = id => document.getElementById(id);
chrome.storage.local.get(['hubUrl', 'lzOn', 'spOn', 'jobsOn']).then(r => { $('url').value = r.hubUrl || ''; $('lz').checked = r.lzOn !== false; $('sp').checked = r.spOn !== false; $('jobs').checked = r.jobsOn !== false; });
$('save').onclick = async () => {
  const u = $('url').value.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\?src=ext&k=\w+$/.test(u)) { $('msg').textContent = '❌ ลิงก์ไม่ถูกต้อง – คัดลอกจาก Chat Hub → ⚙ ตั้งค่า → กล่อง Lazada / Shopee'; return; }
  await chrome.storage.local.set({ hubUrl: u, lzOn: $('lz').checked, spOn: $('sp').checked, jobsOn: $('jobs').checked });
  $('msg').textContent = '⏳ บันทึกแล้ว · กำลังลองดึงแชท (ครั้งแรกอาจใช้ 1–2 นาที)…';
  const st = await chrome.runtime.sendMessage({ cmd: 'pollNow' });
  const lz = (st && st.lazada) || {}, sp = (st && st.shopee) || {};
  $('msg').textContent = !st || !st.ok ? '❌ ' + ((st && st.error) || 'ไม่สำเร็จ') :
    'Lazada: ' + (st.lazada ? (lz.error ? '❌ ' + lz.error : '✅ ' + (lz.items || 0) + ' ข้อความ') : 'ปิด') + ' · Shopee: ' + (st.shopee ? (sp.error ? '❌ ' + sp.error : '✅ ' + sp.shop + ' ' + (sp.items || 0) + ' ข้อความ') : 'ปิด');
};
$('reset').onclick = async () => { await chrome.runtime.sendMessage({ cmd: 'reset' }); $('msg').textContent = 'ล้างความจำแล้ว – รอบหน้าจะดึงย้อน 3 วันใหม่'; };
