// Approval popup script
// Storage keys (must match background.js / storage-keys.js)
const EXT_PENDING_CONNECTION = 'ext:pending_connection';
const EXT_CONNECTION_RESPONSE = 'ext:connection_response';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[approve] DOMContentLoaded, reading pending request...');

  // Always wire up Cancel first so the button always works
  document.getElementById('btnCancel').addEventListener('click', async () => {
    console.log('[approve] User clicked CANCEL');
    // Read current request (may have loaded by now)
    const d = await chrome.storage.local.get([EXT_PENDING_CONNECTION]);
    const req = d[EXT_PENDING_CONNECTION];
    if (req) {
      await chrome.storage.local.set({
        [EXT_CONNECTION_RESPONSE]: { approved: false, requestId: req.id }
      });
      await chrome.storage.local.remove(EXT_PENDING_CONNECTION);
    }
    window.close();
  });

  // Get pending request from storage (with a small retry to handle race with background.js)
  let request = null;
  for (let attempt = 0; attempt < 5 && !request; attempt++) {
    const data = await chrome.storage.local.get([EXT_PENDING_CONNECTION]);
    request = data[EXT_PENDING_CONNECTION];
    if (!request) await new Promise(r => setTimeout(r, 100));
  }
  console.log('[approve] Pending request:', request);

  if (!request) {
    console.warn('[approve] No pending request found after retries');
    document.getElementById('siteName').textContent = 'Unknown Site';
    document.getElementById('siteUrl').textContent = 'No pending request';
    // Approve button does nothing without a request — disable it
    document.getElementById('btnApprove').disabled = true;
    document.getElementById('btnApprove').style.opacity = '0.4';
    return;
  }

  // Display site info
  try {
    const url = new URL(request.origin);
    document.getElementById('siteName').textContent = url.hostname;
  } catch {
    document.getElementById('siteName').textContent = request.origin;
  }
  document.getElementById('siteUrl').textContent = request.origin;

  // Handle Approve
  document.getElementById('btnApprove').addEventListener('click', async () => {
    console.log('[approve] User clicked APPROVE, requestId:', request.id);
    await chrome.storage.local.set({
      [EXT_CONNECTION_RESPONSE]: { approved: true, requestId: request.id, origin: request.origin }
    });
    console.log('[approve] connectionResponse saved to storage');
    await chrome.storage.local.remove(EXT_PENDING_CONNECTION);
    window.close();
  });
});
