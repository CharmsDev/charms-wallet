// Charms Wallet Background Service Worker
// Handles extension lifecycle, wallet provider API, and CORS-free requests

console.log('Charms Wallet background service worker loaded');

// Storage keys for connected sites
const CONNECTED_SITES_KEY = 'connected_sites';

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  if (details.reason === 'install') {
    console.log('First time installation - Charms Wallet v0.6.3');
    // Set default values
    chrome.storage.local.set({
      'active_blockchain': 'bitcoin',
      'active_network': 'testnet4',
      [CONNECTED_SITES_KEY]: {}
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated to v0.6.3');
  }
});

/**
 * Wait for user response to connection request
 */
async function waitForConnectionResponse(requestId, timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const data = await chrome.storage.local.get(['connectionResponse']);
    
    if (data.connectionResponse && data.connectionResponse.requestId === requestId) {
      const response = data.connectionResponse;
      await chrome.storage.local.remove('connectionResponse');
      return response;
    }
    
    // Wait 200ms before checking again
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Timeout - cleanup
  await chrome.storage.local.remove(['pendingConnectionRequest', 'connectionResponse']);
  return null;
}

async function getWalletData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'bitcoin_testnet4_wallet_addresses',
      'bitcoin_mainnet_wallet_addresses',
      'bitcoin_testnet4_utxos',
      'bitcoin_mainnet_utxos',
      'active_network',
      'seedPhrase'
    ], (data) => {
      resolve(data);
    });
  });
}

/**
 * Get connected sites from storage
 */
async function getConnectedSites() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONNECTED_SITES_KEY], (data) => {
      resolve(data[CONNECTED_SITES_KEY] || {});
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
    chrome.storage.local.set({ [CONNECTED_SITES_KEY]: sites }, resolve);
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
        // ALWAYS show approval popup (for demo purposes)
        // Clear any existing connection to force popup
        await chrome.storage.local.get([CONNECTED_SITES_KEY], async (data) => {
          const sites = data[CONNECTED_SITES_KEY] || {};
          delete sites[origin];
          await chrome.storage.local.set({ [CONNECTED_SITES_KEY]: sites });
        });
        
        // Check wallet exists
        const walletData = await getWalletData();
        const network = walletData.active_network || 'testnet4';
        const addressKey = `bitcoin_${network}_wallet_addresses`;
        const addresses = walletData[addressKey] ? JSON.parse(walletData[addressKey]) : [];
        
        if (addresses.length === 0) {
          return { error: 'No wallet found. Please create or import a wallet first.' };
        }
        
        // Open approval popup
        const requestId = Date.now().toString();
        await chrome.storage.local.set({
          pendingConnectionRequest: { id: requestId, origin: origin }
        });
        
        // Open popup window for approval
        await chrome.windows.create({
          url: chrome.runtime.getURL('approve.html'),
          type: 'popup',
          width: 400,
          height: 500,
          focused: true
        });
        
        // Wait for user response (poll storage)
        const response = await waitForConnectionResponse(requestId, 60000);
        
        if (!response || !response.approved) {
          return { error: 'User rejected the connection request' };
        }
        
        // Get the primary address
        const primaryAddress = addresses[0]?.address || addresses[0];
        const accountAddresses = [primaryAddress];
        
        // Save as connected site
        await saveConnectedSite(origin, accountAddresses);
        
        console.log('Site connected:', origin, 'addresses:', accountAddresses);
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
        const network = walletData.active_network || 'testnet4';
        const addressKey = `bitcoin_${network}_wallet_addresses`;
        const addresses = walletData[addressKey] ? JSON.parse(walletData[addressKey]) : [];
        
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
        const network = walletData.active_network || 'testnet4';
        const utxoKey = `bitcoin_${network}_utxos`;
        const utxos = walletData[utxoKey] || [];
        
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
        const network = walletData.active_network || 'testnet4';
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
        // TODO: Implement PSBT signing with popup approval
        return { error: 'PSBT signing not yet implemented' };
      }

      case 'signPsbts': {
        // TODO: Implement multiple PSBT signing
        return { error: 'Multiple PSBT signing not yet implemented' };
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
  const network = walletData.active_network || 'testnet4';
  const addressKey = `bitcoin_${network}_wallet_addresses`;
  const addresses = walletData[addressKey] ? JSON.parse(walletData[addressKey]) : [];
  
  if (addresses.length === 0) {
    return { result: [] };
  }
  
  const primaryAddress = addresses[0]?.address || addresses[0];
  return { result: [primaryAddress] };
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
      if (!data || !data.seedPhrase) {
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
let keepAliveInterval;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Just to keep the service worker alive
    });
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
}

// Start keep-alive on load
startKeepAlive();

// Listen for connections from popup
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    port.onDisconnect.addListener(() => {
      console.log('Popup disconnected');
    });
  }
});
