// Approval popup script
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[approve] DOMContentLoaded, reading pending request...');
  
  // Get pending request from storage
  const data = await chrome.storage.local.get(['pendingConnectionRequest']);
  const request = data.pendingConnectionRequest;
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
      connectionResponse: { approved: false, requestId: request.id }
    });
    await chrome.storage.local.remove('pendingConnectionRequest');
    window.close();
  });

  // Handle Approve
  document.getElementById('btnApprove').addEventListener('click', async () => {
    console.log('[approve] User clicked APPROVE, requestId:', request.id);
    await chrome.storage.local.set({ 
      connectionResponse: { approved: true, requestId: request.id, origin: request.origin }
    });
    console.log('[approve] connectionResponse saved to storage');
    await chrome.storage.local.remove('pendingConnectionRequest');
    console.log('[approve] pendingConnectionRequest removed, closing popup...');
    window.close();
  });
});
