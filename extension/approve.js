// Approval popup script
// Storage keys (must match background.js / storage-keys.js)
const EXT_PENDING_CONNECTION = 'ext:pending_connection';
const EXT_CONNECTION_RESPONSE = 'ext:connection_response';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[approve] DOMContentLoaded, reading pending request...');
  
  // Get pending request from storage
  const data = await chrome.storage.local.get([EXT_PENDING_CONNECTION]);
  const request = data[EXT_PENDING_CONNECTION];
  console.log('[approve] Pending request:', request);

  if (!request) {
    console.warn('[approve] No pending request found!');
    document.getElementById('siteName').textContent = 'Unknown Site';
    document.getElementById('siteUrl').textContent = 'No pending request';
    return;
  }

  // Display site info
  const url = new URL(request.origin);
  document.getElementById('siteName').textContent = url.hostname;
  document.getElementById('siteUrl').textContent = request.origin;

  // Handle Cancel
  document.getElementById('btnCancel').addEventListener('click', async () => {
    console.log('[approve] User clicked CANCEL, requestId:', request.id);
    await chrome.storage.local.set({ 
      [EXT_CONNECTION_RESPONSE]: { approved: false, requestId: request.id }
    });
    await chrome.storage.local.remove(EXT_PENDING_CONNECTION);
    window.close();
  });

  // Handle Approve
  document.getElementById('btnApprove').addEventListener('click', async () => {
    console.log('[approve] User clicked APPROVE, requestId:', request.id);
    await chrome.storage.local.set({ 
      [EXT_CONNECTION_RESPONSE]: { approved: true, requestId: request.id, origin: request.origin }
    });
    console.log('[approve] connectionResponse saved to storage');
    await chrome.storage.local.remove(EXT_PENDING_CONNECTION);
    console.log('[approve] pendingConnectionRequest removed, closing popup...');
    window.close();
  });
});
