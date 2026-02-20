// Charms Wallet Background Service Worker
// Handles extension lifecycle, wallet provider API, and CORS-free requests

console.log('Charms Wallet background service worker loaded');

// ─── Storage Keys (must match wallet/src/services/storage-keys.js) ───
const SK = {
  SEED_PHRASE:        'wallet:seed_phrase',
  ACTIVE_BLOCKCHAIN:  'wallet:active_blockchain',
  ACTIVE_NETWORK:     'wallet:active_network',
  BALANCE:            'wallet:balance',
};
const EXT = {
  CONNECTED_SITES:     'ext:connected_sites',
  PENDING_CONNECTION:  'ext:pending_connection',
  CONNECTION_RESPONSE: 'ext:connection_response',
  PENDING_SIGN:        'ext:pending_sign',
  SIGN_RESPONSE:       'ext:sign_response',
};
function addressesKey(blockchain, network) {
  return `wallet:${blockchain}:${network}:addresses`;
}
function utxosKey(blockchain, network) {
  return `wallet:${blockchain}:${network}:utxos`;
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  if (details.reason === 'install') {
    console.log('First time installation - Charms Wallet v0.6.3');
    // Set default values
    chrome.storage.local.set({
      [SK.ACTIVE_BLOCKCHAIN]: 'bitcoin',
      [SK.ACTIVE_NETWORK]: 'mainnet',
      [EXT.CONNECTED_SITES]: {}
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated to v0.6.3');
  }
});

/**
 * Wait for user response to sign request
 */
async function waitForSignResponse(requestId, timeout = 120000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const data = await chrome.storage.local.get([EXT.SIGN_RESPONSE]);
    
    if (data[EXT.SIGN_RESPONSE] && data[EXT.SIGN_RESPONSE].requestId === requestId) {
      const response = data[EXT.SIGN_RESPONSE];
      await chrome.storage.local.remove(EXT.SIGN_RESPONSE);
      return response;
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Timeout - cleanup
  await chrome.storage.local.remove([EXT.PENDING_SIGN, EXT.SIGN_RESPONSE]);
  return null;
}

/**
 * Wait for user response to connection request
 */
async function waitForConnectionResponse(requestId, timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const data = await chrome.storage.local.get([EXT.CONNECTION_RESPONSE]);
    
    if (data[EXT.CONNECTION_RESPONSE] && data[EXT.CONNECTION_RESPONSE].requestId === requestId) {
      const response = data[EXT.CONNECTION_RESPONSE];
      await chrome.storage.local.remove(EXT.CONNECTION_RESPONSE);
      return response;
    }
    
    // Wait 200ms before checking again
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Timeout - cleanup
  await chrome.storage.local.remove([EXT.PENDING_CONNECTION, EXT.CONNECTION_RESPONSE]);
  return null;
}

async function getWalletData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      addressesKey('bitcoin', 'testnet4'),
      addressesKey('bitcoin', 'mainnet'),
      utxosKey('bitcoin', 'testnet4'),
      utxosKey('bitcoin', 'mainnet'),
      SK.ACTIVE_NETWORK,
      SK.SEED_PHRASE
    ], (data) => {
      resolve(data);
    });
  });
}

/**
 * Safely parse addresses from storage — handles both JSON strings and already-parsed arrays
 */
function parseAddresses(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[parseAddresses] Failed to parse string:', e);
      return [];
    }
  }
  return [];
}

/**
 * Get connected sites from storage
 */
async function getConnectedSites() {
  return new Promise((resolve) => {
    chrome.storage.local.get([EXT.CONNECTED_SITES], (data) => {
      resolve(data[EXT.CONNECTED_SITES] || {});
    });
  });
}

/**
 * Save connected site
 */
async function saveConnectedSite(origin, addresses) {
  const sites = await getConnectedSites();
  sites[origin] = {
    addresses,
    connectedAt: Date.now()
  };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [EXT.CONNECTED_SITES]: sites }, resolve);
  });
}

/**
 * Check if site is connected
 */
async function isSiteConnected(origin) {
  const sites = await getConnectedSites();
  return !!sites[origin];
}

/**
 * Handle wallet provider requests from content script
 */
async function handleWalletProviderRequest(request, sender) {
  const { method, params, origin } = request;
  
  console.log('Wallet provider request:', method, 'from', origin);

  try {
    switch (method) {
      case 'requestAccounts': {
        console.log('[requestAccounts] Starting connection flow for', origin);
        
        // Clear any existing connection to force approval popup
        const existingSites = await new Promise(resolve => {
          chrome.storage.local.get([EXT.CONNECTED_SITES], (data) => {
            resolve(data[EXT.CONNECTED_SITES] || {});
          });
        });
        delete existingSites[origin];
        await new Promise(resolve => {
          chrome.storage.local.set({ [EXT.CONNECTED_SITES]: existingSites }, resolve);
        });
        
        // Check wallet exists — try active network first, then fallback to other network
        const walletData = await getWalletData();
        let network = walletData[SK.ACTIVE_NETWORK] || 'mainnet';
        let addrKey = addressesKey('bitcoin', network);
        
        let addresses = parseAddresses(walletData[addrKey]);
        
        // If no addresses on active network, try the other network
        if (addresses.length === 0) {
          const fallbackNetwork = network === 'mainnet' ? 'testnet4' : 'mainnet';
          const fallbackKey = addressesKey('bitcoin', fallbackNetwork);
          addresses = parseAddresses(walletData[fallbackKey]);
          if (addresses.length > 0) {
            network = fallbackNetwork;
            addrKey = fallbackKey;
          }
        }

        if (addresses.length === 0) {
          return { error: 'No wallet found. Please create or import a wallet first.' };
        }
        
        // Open approval popup
        const requestId = Date.now().toString();
        await new Promise(resolve => {
          chrome.storage.local.set({
            [EXT.PENDING_CONNECTION]: { id: requestId, origin: origin }
          }, resolve);
        });
        console.log('[requestAccounts] Pending request stored, opening popup. requestId:', requestId);
        
        // Open popup window for approval
        await chrome.windows.create({
          url: chrome.runtime.getURL('approve.html'),
          type: 'popup',
          width: 400,
          height: 500,
          focused: true
        });
        console.log('[requestAccounts] Popup opened, waiting for user response...');
        
        // Wait for user response (poll storage)
        const response = await waitForConnectionResponse(requestId, 60000);
        console.log('[requestAccounts] Got response:', response);
        
        if (!response || !response.approved) {
          console.log('[requestAccounts] User rejected or timeout');
          return { error: 'User rejected the connection request' };
        }
        
        // Return ALL wallet addresses so dApps can scan balances across all of them
        const accountAddresses = addresses.map(a => a?.address || a);
        
        // Save as connected site
        await saveConnectedSite(origin, accountAddresses);
        
        console.log('[requestAccounts] Site connected:', origin, 'addresses:', accountAddresses);
        return { result: accountAddresses };
      }

      case 'getAccounts': {
        return await handleGetAccounts(origin);
      }

      case 'getPublicKey': {
        const isConnected = await isSiteConnected(origin);
        if (!isConnected) {
          return { error: 'Site not connected. Call requestAccounts first.' };
        }
        
        const walletData = await getWalletData();
        const network = walletData[SK.ACTIVE_NETWORK] || 'mainnet';
        const addrKey = addressesKey('bitcoin', network);
        const addresses = parseAddresses(walletData[addrKey]);
        
        if (addresses.length === 0 || !addresses[0]?.publicKey) {
          return { error: 'No public key available' };
        }
        
        return { result: addresses[0].publicKey };
      }

      case 'getBalance': {
        const isConnected = await isSiteConnected(origin);
        if (!isConnected) {
          return { error: 'Site not connected. Call requestAccounts first.' };
        }
        
        const walletData = await getWalletData();
        const network = walletData[SK.ACTIVE_NETWORK] || 'mainnet';
        const uKey = utxosKey('bitcoin', network);
        const utxos = walletData[uKey] || [];
        
        // Calculate balance from UTXOs
        let confirmed = 0;
        let unconfirmed = 0;
        
        utxos.forEach(utxo => {
          const value = utxo.value || utxo.amount || 0;
          if (utxo.status?.confirmed || utxo.confirmations > 0) {
            confirmed += value;
          } else {
            unconfirmed += value;
          }
        });
        
        return { 
          result: { 
            confirmed, 
            unconfirmed, 
            total: confirmed + unconfirmed 
          } 
        };
      }

      case 'getNetwork': {
        const walletData = await getWalletData();
        const network = walletData[SK.ACTIVE_NETWORK] || 'mainnet';
        // Map to UniSat-compatible network names
        const networkMap = {
          'mainnet': 'livenet',
          'testnet4': 'testnet',
          'testnet': 'testnet'
        };
        return { result: networkMap[network] || 'testnet' };
      }

      case 'switchNetwork': {
        // TODO: Implement network switching
        return { error: 'Network switching not yet implemented' };
      }

      case 'signMessage': {
        // TODO: Implement message signing with popup approval
        return { error: 'Message signing not yet implemented' };
      }

      case 'signPsbt': {
        const isConnected = await isSiteConnected(origin);
        if (!isConnected) {
          return { error: 'Site not connected. Call requestAccounts first.' };
        }

        const { psbtHex, options } = params;
        if (!psbtHex) {
          return { error: 'Missing psbtHex parameter' };
        }

        console.log('[signPsbt] Opening approval popup for', origin);

        // Store the sign request
        const signRequestId = Date.now().toString();
        await new Promise(resolve => {
          chrome.storage.local.set({
            [EXT.PENDING_SIGN]: {
              id: signRequestId,
              origin,
              psbtHex,
              options: options || {},
            }
          }, resolve);
        });

        // Open the signing approval popup (Vite-built with crypto libs)
        await chrome.windows.create({
          url: chrome.runtime.getURL('approve-sign.html'),
          type: 'popup',
          width: 420,
          height: 600,
          focused: true
        });

        // Wait for user to approve and sign (up to 2 minutes)
        const signResult = await waitForSignResponse(signRequestId, 120000);

        if (!signResult || !signResult.approved) {
          const errorMsg = signResult?.error || 'User rejected the signing request';
          console.log('[signPsbt] Rejected:', errorMsg);
          return { error: errorMsg };
        }

        console.log('[signPsbt] Signed successfully');
        return { result: signResult.signedPsbtHex };
      }

      case 'signPsbts': {
        const isConnected = await isSiteConnected(origin);
        if (!isConnected) {
          return { error: 'Site not connected. Call requestAccounts first.' };
        }

        const { psbtHexs, options: psbtsOptions } = params;
        if (!psbtHexs || !Array.isArray(psbtHexs)) {
          return { error: 'Missing psbtHexs array parameter' };
        }

        // Sign each PSBT sequentially with approval
        const signedResults = [];
        for (let i = 0; i < psbtHexs.length; i++) {
          const signRequestId = Date.now().toString();
          const opts = Array.isArray(psbtsOptions) ? psbtsOptions[i] : psbtsOptions;

          await new Promise(resolve => {
            chrome.storage.local.set({
              [EXT.PENDING_SIGN]: {
                id: signRequestId,
                origin,
                psbtHex: psbtHexs[i],
                options: opts || {},
                batchInfo: { current: i + 1, total: psbtHexs.length },
              }
            }, resolve);
          });

          await chrome.windows.create({
            url: chrome.runtime.getURL('approve-sign.html'),
            type: 'popup',
            width: 420,
            height: 600,
            focused: true
          });

          const signResult = await waitForSignResponse(signRequestId, 120000);

          if (!signResult || !signResult.approved) {
            return { error: signResult?.error || `User rejected signing PSBT ${i + 1}/${psbtHexs.length}` };
          }

          signedResults.push(signResult.signedPsbtHex);
        }

        return { result: signedResults };
      }

      case 'pushTx': {
        // TODO: Implement transaction broadcasting
        return { error: 'Transaction broadcasting not yet implemented' };
      }

      default:
        return { error: `Unknown method: ${method}` };
    }
  } catch (error) {
    console.error('Wallet provider error:', error);
    return { error: error.message };
  }
}

/**
 * Handle getAccounts request
 */
async function handleGetAccounts(origin) {
  const isConnected = await isSiteConnected(origin);
  if (!isConnected) {
    return { result: [] }; // Not connected, return empty array (no error)
  }
  
  const walletData = await getWalletData();
  const network = walletData[SK.ACTIVE_NETWORK] || 'mainnet';
  const addrKey = addressesKey('bitcoin', network);
  const addresses = parseAddresses(walletData[addrKey]);
  
  if (addresses.length === 0) {
    return { result: [] };
  }
  
  // Return ALL addresses so dApps can scan balances across all of them
  const accountAddresses = addresses.map(a => a?.address || a);
  return { result: accountAddresses };
}

// Message handler for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle wallet provider requests from content script
  if (request.type === 'WALLET_PROVIDER_REQUEST') {
    handleWalletProviderRequest(request, sender)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === 'API_REQUEST') {
    // Forward API requests to bypass CORS
    const fetchOptions = {
      method: request.method || 'GET',
      headers: request.headers || {},
    };
    
    if (request.body && request.method !== 'GET') {
      fetchOptions.body = JSON.stringify(request.body);
    }
    
    fetch(request.url, fetchOptions)
      .then(async response => {
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }
        
        sendResponse({ 
          success: response.ok, 
          data,
          status: response.status,
          statusText: response.statusText
        });
      })
      .catch(error => {
        console.error('API request failed:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          stack: error.stack
        });
      });
    
    return true; // Keep message channel open for async response
  }
  
  // Handle storage sync requests
  if (request.type === 'STORAGE_SYNC') {
    chrome.storage.local.get(null, (items) => {
      sendResponse({ success: true, data: items });
    });
    return true;
  }
  
  // Handle import from web wallet
  if (request.type === 'IMPORT_FROM_WEB') {
    console.log('Background: Received import request from web');
    
    try {
      const data = request.data;
      
      // Validate data
      if (!data || !data[SK.SEED_PHRASE]) {
        sendResponse({ success: false, error: 'No seed phrase provided' });
        return true;
      }
      
      // Import all data to chrome.storage.local
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('Background: Import failed', chrome.runtime.lastError);
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
        } else {
          console.log('Background: Import successful');
          sendResponse({ 
            success: true, 
            message: 'Wallet data imported successfully' 
          });
        }
      });
    } catch (error) {
      console.error('Background: Import error', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true;
  }
});

// Keep service worker alive
setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);

// Listen for connections from popup
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    port.onDisconnect.addListener(() => {
      console.log('Popup disconnected');
    });
  }
});
