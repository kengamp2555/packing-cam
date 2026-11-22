/* 🧰 KengAmp ผู้ช่วยร้าน · ตัวสะกิดในหน้า Chat Hub
 * หน้า Chat Hub (เปิดใน Chrome เครื่องนี้) กดส่งข้อความ Shopee / Lazada → ส่ง postMessage {type:'kengamp-chathub', cmd:'outbox'}
 * → บอกส่วนเสริมให้ไปหยิบคิวส่งทันที (ไม่ต้องรอรอบ 30 วินาที) · ไม่อ่าน / ไม่แก้อะไรในหน้าเว็บ นอกจากติดป้ายว่ามีส่วนเสริม */
(function () {
  try { document.documentElement.dataset.kengampExt = chrome.runtime.getManifest().version; } catch (e) { }
  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.type !== 'kengamp-chathub' || e.source !== window) return;
    if (d.cmd === 'outbox') { try { chrome.runtime.sendMessage({ cmd: 'outboxNow' }); } catch (err) { } }
  });
})();
