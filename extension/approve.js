// Approval popup script
document.addEventListener('DOMContentLoaded', async () => {
  // Get pending request from storage
  const data = await chrome.storage.local.get(['pendingConnectionRequest']);
  const request = data.pendingConnectionRequest;

  if (!request) {
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
    await chrome.storage.local.set({ 
      connectionResponse: { approved: false, requestId: request.id }
    });
    await chrome.storage.local.remove('pendingConnectionRequest');
    window.close();
  });

  // Handle Approve
  document.getElementById('btnApprove').addEventListener('click', async () => {
    await chrome.storage.local.set({ 
      connectionResponse: { approved: true, requestId: request.id, origin: request.origin }
    });
    await chrome.storage.local.remove('pendingConnectionRequest');
    window.close();
  });
});
