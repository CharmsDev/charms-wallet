/**
 * Content Script - Charms Wallet Extension
 * Acts as a bridge between the webpage (inpage.js) and the background service worker
 * Handles wallet connection requests and data migration
 */

console.log('Charms Wallet Extension: Content script loaded');

// Inject the inpage script to expose window.charmsWallet
function injectInpageScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inpage.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('Charms Wallet Extension: Inpage script injected');
  } catch (error) {
    console.error('Charms Wallet Extension: Failed to inject inpage script', error);
  }
}

// Inject immediately
injectInpageScript();

// Listen for messages from the inpage script (window.charmsWallet)
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  // Handle wallet provider requests from inpage.js
  if (event.data && event.data.type === 'CHARMS_WALLET_REQUEST') {
    const { id, method, params } = event.data;
    
    // Forward to background script
    chrome.runtime.sendMessage({
      type: 'WALLET_PROVIDER_REQUEST',
      id,
      method,
      params,
      origin: window.location.origin
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Charms Wallet Extension: Error forwarding request', chrome.runtime.lastError);
        window.postMessage({
          type: 'CHARMS_WALLET_RESPONSE',
          id,
          error: chrome.runtime.lastError.message
        }, '*');
        return;
      }

      // Send response back to inpage script
      window.postMessage({
        type: 'CHARMS_WALLET_RESPONSE',
        id,
        result: response?.result,
        error: response?.error
      }, '*');
    });
  }

  // Handle legacy export requests (data migration)
  if (event.data && event.data.type === 'CHARMS_WALLET_EXPORT') {
    console.log('Charms Wallet Extension: Received export request from web');

    chrome.runtime.sendMessage({
      type: 'IMPORT_FROM_WEB',
      data: event.data.payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Charms Wallet Extension: Error sending to background', chrome.runtime.lastError);
        window.postMessage({
          type: 'CHARMS_WALLET_IMPORT_ERROR',
          error: chrome.runtime.lastError.message
        }, '*');
        return;
      }

      console.log('Charms Wallet Extension: Import response', response);
      window.postMessage({
        type: 'CHARMS_WALLET_IMPORT_SUCCESS',
        success: response.success
      }, '*');
    });
  }

  // Check extension status request
  if (event.data && event.data.type === 'CHARMS_WALLET_CHECK_EXTENSION') {
    console.log('Charms Wallet Extension: Extension detected by web page');
    window.postMessage({
      type: 'CHARMS_WALLET_EXTENSION_DETECTED',
      version: chrome.runtime.getManifest().version
    }, '*');
  }
});

// Listen for events from background script to forward to page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHARMS_WALLET_EVENT') {
    // Forward wallet events to the page
    window.postMessage({
      type: 'CHARMS_WALLET_EVENT',
      event: message.event,
      data: message.data
    }, '*');
  }
});

// Notify web page that extension is ready
window.postMessage({
  type: 'CHARMS_WALLET_EXTENSION_READY',
  version: chrome.runtime.getManifest().version
}, '*');
