// Charms Wallet Background Service Worker
// Handles extension lifecycle, wallet provider API, and CORS-free requests.
//
// NOTE on storage keys: background.js is NOT a vite-bundled entry today
// (vite.config.js copies it verbatim), so it cannot `import` from
// `@/services/storage-keys`. The inlined constants below MUST stay
// byte-identical to those declared in `wallet/src/services/storage-keys.js`.
// Drift breaks cross-tool data sharing (extension <-> web wallet). E017 may
// promote background.js to a vite entry; until then the duplication is
// intentional and audited by `scripts/sync-from-wallet.sh` (path presence).

console.log('Charms Wallet background service worker loaded');

// ─── Storage Keys — mirror of wallet/src/services/storage-keys.js ────
const SK = {
  VERSION:           'wallet:meta:version',
  CREATED:           'wallet:meta:created',
  SEED_PHRASE:       'wallet:seed_phrase',
  // G003 auth blob. Present for both wallet types; the plaintext
  // SEED_PHRASE above only exists for legacy or web-transferred wallets.
  AUTH:              'wallet:auth',
  ACTIVE_BLOCKCHAIN: 'wallet:active_blockchain',
  ACTIVE_NETWORK:    'wallet:active_network',
  UI_PREFS:          'wallet:prefs:ui',
};
const EXT = {
  CONNECTED_SITES:     'ext:connected_sites',
  PENDING_CONNECTION:  'ext:pending_connection',
  CONNECTION_RESPONSE: 'ext:connection_response',
  PENDING_SIGN:        'ext:pending_sign',
  SIGN_RESPONSE:       'ext:sign_response',
  PENDING_PROOF:       'ext:pending_proof',
  PROVING_STATUS:      'ext:proving_status',
  // Passkey signing delegated to a wallet.charms.dev tab.
  SIGN_DELEGATE_PENDING: 'ext:sign_delegate_pending',
  SIGN_DELEGATE_RESULT:  'ext:sign_delegate_result',
  // A link handshake the popup started and /extension-link answers.
  LINK_PENDING:          'ext:link_pending',
};
const EXT_SIGN_PENDING = 'ext:sign_delegate_pending';
const EXT_SIGN_RESULT  = 'ext:sign_delegate_result';
const DATA_TYPES = {
  ADDRESSES:    'addresses',
  UTXOS:        'utxos',
  TRANSACTIONS: 'transactions',
  CHARMS:       'charms',
  ASSETS:       'assets',
  ASSET_META:   'asset_meta',
  BALANCE:      'balance',
  SYNC_META:    'sync_meta',
  INFO:         'info',
};
function netKey(blockchain, network, dataType) {
  return `wallet:net:${blockchain}:${network}:${dataType}`;
}
function addressesKey(blockchain, network) {
  return netKey(blockchain, network, DATA_TYPES.ADDRESSES);
}
function utxosKey(blockchain, network) {
  return netKey(blockchain, network, DATA_TYPES.UTXOS);
}
function balanceKey(blockchain, network) {
  return netKey(blockchain, network, DATA_TYPES.BALANCE);
}


// ─── Offscreen Document Management ──────────────────────────────────────────

const OFFSCREEN_URL = 'offscreen.html';

/**
 * Ensure one offscreen document is running.
 * Chrome allows only one offscreen document per extension at a time.
 */
async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(OFFSCREEN_URL),
    reasons: ['BLOBS'],
    justification: 'ZK proof generation for Charms token transfers',
  });
}

/** Close the offscreen document (after prover finishes or errors). */
async function closeOffscreenDocument() {
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}

/**
 * Start ZK proof generation in the offscreen document.
 * Stores prover params so the result can be matched on return.
 */
async function handleStartCharmProof({ proverParams, meta }) {
  // Store metadata immediately so it survives if the popup is closed during proving.
  // The proof result will be merged into this entry when it arrives.
  await chrome.storage.local.set({
    [EXT.PENDING_PROOF]:  { meta, status: 'proving' },
    [EXT.PROVING_STATUS]: { message: 'Starting proof…', ts: Date.now() },
  });
  await ensureOffscreenDocument();
  // Send prover params to offscreen — fire-and-forget (result comes back via onMessage)
  chrome.runtime.sendMessage({ type: 'RUN_PROVER', params: proverParams }).catch(() => {});
}

/**
 * Called when the offscreen document returns a successful proof.
 * Stores the result and notifies the popup (or shows a system notification).
 */
async function handleProverResult({ spellTxHex, prevTxMapEntries, fee }) {
  // Merge proof data with the metadata stored when proving started
  const stored = await new Promise(resolve =>
    chrome.storage.local.get([EXT.PENDING_PROOF], resolve)
  );
  const pendingProof = {
    ...(stored[EXT.PENDING_PROOF] || {}),
    status: 'ready',
    spellTxHex,
    prevTxMapEntries,
    fee,
  };

  await chrome.storage.local.set({ [EXT.PENDING_PROOF]: pendingProof });
  await chrome.storage.local.remove(EXT.PROVING_STATUS);
  await closeOffscreenDocument();

  // Try to notify popup if it is currently open; otherwise open the signing page directly
  chrome.runtime.sendMessage({ type: 'PROOF_READY', ...pendingProof }).catch(() => {
    // Popup is closed — open the signing approval page so user can confirm immediately
    chrome.windows.create({
      url: chrome.runtime.getURL('approve-sign.html'),
      type: 'popup',
      width: 420,
      height: 580,
      focused: true,
    });
  });
}

/**
 * Called when the offscreen document reports a prover error.
 */
async function handleProverError(errorMsg) {
  await chrome.storage.local.set({
    [EXT.PROVING_STATUS]: { error: errorMsg, ts: Date.now() },
  });
  await closeOffscreenDocument();

  chrome.runtime.sendMessage({ type: 'PROOF_ERROR', error: errorMsg }).catch(() => {
    chrome.notifications.create('charm-proof-error', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Charms Wallet — Transfer Failed',
      message: errorMsg.slice(0, 100),
    });
  });
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  if (details.reason === 'install') {
    console.log('First time installation - Charms Wallet v0.7.0');
    // Set default values
    chrome.storage.local.set({
      [SK.ACTIVE_BLOCKCHAIN]: 'bitcoin',
      [SK.ACTIVE_NETWORK]: 'mainnet',
      [EXT.CONNECTED_SITES]: {}
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated to v0.7.0');
  }
});

/**
 * How long to give the user to approve a signature.
 *
 * A password wallet signs inside the popup, so two minutes is plenty. A
 * passkey wallet hands the ceremony to a wallet.charms.dev tab, which
 * means a tab switch and a biometric prompt on top of the reading. The
 * delegation gives up at four minutes, so this has to outlast it or the
 * dApp is told the user rejected while they are still approving.
 */
async function getSignTimeout() {
  try {
    const data = await chrome.storage.local.get([SK.AUTH]);
    const raw = data[SK.AUTH];
    const blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (blob?.type === 'prf') return 300000;
  } catch (_) { /* unreadable blob is not a passkey wallet's problem */ }
  return 120000;
}

// ─── Wallet link ──────────────────────────────────────────────────────
//
// Mirror of wallet/src/services/extension-link.js. Replaces the old
// IMPORT_FROM_WEB, which demanded a plaintext seed that G003 no longer
// stores, so it could never succeed for a current wallet.
//
// The seed key is refused explicitly rather than merely left off the
// list: a whitelist that silently drops it would still let a caller
// believe it had been accepted.
function linkableKeys() {
  return [
    SK.AUTH,
    SK.VERSION,
    SK.CREATED,
    SK.ACTIVE_BLOCKCHAIN,
    SK.ACTIVE_NETWORK,
    addressesKey('bitcoin', 'mainnet'),
    addressesKey('bitcoin', 'testnet4'),
  ];
}

async function adoptLinkedWallet(requestId, payload) {
  const stored = await chrome.storage.local.get([EXT.LINK_PENDING, SK.AUTH]);

  // The popup writes LINK_PENDING before opening the tab. Matching on it
  // stops a tab left open from re-adopting over a wallet the user has
  // since changed.
  const pending = stored[EXT.LINK_PENDING];
  if (!pending || pending.requestId !== requestId) {
    return { error: 'No link in progress. Start it again from the extension.' };
  }

  if (!payload || typeof payload !== 'object') {
    return { error: 'Nothing to link.' };
  }
  if (payload[SK.SEED_PHRASE]) {
    return { error: 'Refused: a plaintext seed phrase must not be transferred.' };
  }

  let blob = null;
  try {
    const raw = payload[SK.AUTH];
    blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) { /* handled just below */ }
  if (!blob || (blob.type !== 'prf' && blob.type !== 'password')) {
    return { error: 'That wallet has no usable auth record.' };
  }
  if (stored[SK.AUTH]) {
    return { error: 'This extension already holds a wallet. Remove it first.' };
  }

  const toWrite = {};
  for (const key of linkableKeys()) {
    if (payload[key] != null) toWrite[key] = payload[key];
  }

  await chrome.storage.local.set(toWrite);
  await chrome.storage.local.remove(EXT.LINK_PENDING);
  console.log('[link] adopted a', blob.type, 'wallet');
  return { ok: true };
}

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
      // No seed here on purpose. Every caller wants addresses, UTXOs or
      // the network, and pulling the mnemonic into the service worker for
      // nobody to read is a secret in memory for no reason.
    ], (data) => {
      resolve(data);
    });
  });
}

/**
 * Safely parse a value from storage that may be either a JSON string or
 * an already-parsed object/array. Returns the parsed form on success or
 * the fallback on any failure.
 */
function safeParse(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
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
 * Sort addresses so P2WPKH (bc1q/tb1q) comes first.
 */
function sortP2wpkhFirst(addrs) {
  const sorted = [...addrs];
  const idx = sorted.findIndex(a => a.startsWith('bc1q') || a.startsWith('tb1q'));
  if (idx > 0) sorted.unshift(sorted.splice(idx, 1)[0]);
  return sorted;
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
        
        // Return ALL wallet addresses — P2WPKH (bc1q/tb1q) first for CAST compatibility
        const accountAddresses = sortP2wpkhFirst(addresses.map(a => a?.address || a));

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
        const isConnected = await isSiteConnected(origin);
        if (!isConnected) {
          return { error: 'Site not connected. Call requestAccounts first.' };
        }

        const { message, address } = params;
        if (!message) return { error: 'Missing message parameter' };

        const signRequestId = Date.now().toString();
        const connectedSites = await getConnectedSites();
        const connectedAddresses = connectedSites[origin]?.addresses || [];
        await new Promise(resolve => {
          chrome.storage.local.set({
            [EXT.PENDING_SIGN]: {
              id: signRequestId,
              type: 'signMessage',
              origin,
              message,
              signingAddress: address || null,
              connectedAddresses,
            }
          }, resolve);
        });

        await chrome.windows.create({
          url: chrome.runtime.getURL('approve-sign.html'),
          type: 'popup',
          width: 420,
          height: 500,
          focused: true
        });

        const signResult = await waitForSignResponse(signRequestId, await getSignTimeout());

        if (!signResult || !signResult.approved) {
          return { error: signResult?.error || 'User rejected the signing request' };
        }

        return { result: signResult.signature };
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
        const signResult = await waitForSignResponse(signRequestId, await getSignTimeout());

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

          const signResult = await waitForSignResponse(signRequestId, await getSignTimeout());

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

      // ─── E019 — Cardano namespace (read-only routes today) ────────
      //
      // Read methods route through chrome.storage on the canonical
      // wallet:net:cardano:<net>:* keys (written by @/stores/cardanoStore
      // in popup contexts). State-modifying methods are stubbed; the
      // signing surface (CSL in approve-sign) lands together with
      // E017b runner migration.
      case 'cardano.requestAccounts':
      case 'cardano.getAccounts': {
        const isConnected = await isSiteConnected(origin);
        if (method === 'cardano.getAccounts' && !isConnected) return { result: [] };
        if (method === 'cardano.requestAccounts' && !isConnected) {
          return { error: 'Site not connected. Call requestAccounts (BTC) first; Cardano shares the same connection.' };
        }
        const walletData = await getWalletData();
        const adaNet = walletData[SK.ACTIVE_NETWORK] === 'mainnet' ? 'mainnet' : 'preprod';
        const addrs = parseAddresses(walletData[netKey('cardano', adaNet, DATA_TYPES.ADDRESSES)]);
        return { result: addrs.map(a => a?.address || a) };
      }

      case 'cardano.getBalance': {
        if (!(await isSiteConnected(origin))) return { error: 'Site not connected.' };
        const walletData = await getWalletData();
        const adaNet = walletData[SK.ACTIVE_NETWORK] === 'mainnet' ? 'mainnet' : 'preprod';
        const utxosRaw = walletData[netKey('cardano', adaNet, DATA_TYPES.UTXOS)] || [];
        const utxos = typeof utxosRaw === 'string' ? safeParse(utxosRaw) : utxosRaw;
        const lovelace = (utxos || []).reduce((s, u) => s + BigInt(u.lovelace || '0'), 0n);
        return { result: { lovelace: lovelace.toString(), ada: Number(lovelace) / 1_000_000 } };
      }

      case 'cardano.getAssets': {
        if (!(await isSiteConnected(origin))) return { error: 'Site not connected.' };
        const walletData = await getWalletData();
        const adaNet = walletData[SK.ACTIVE_NETWORK] === 'mainnet' ? 'mainnet' : 'preprod';
        const assetsRaw = walletData[netKey('cardano', adaNet, DATA_TYPES.ASSETS)] || [];
        const assets = typeof assetsRaw === 'string' ? safeParse(assetsRaw) : assetsRaw;
        return { result: assets || [] };
      }

      case 'cardano.signTx':
      case 'cardano.submitTx':
      case 'cardano.sendAda':
      case 'cardano.sendCnt':
        return { error: 'not_yet_implemented', detail: 'Cardano signing lands with E017b (runner migration + approve-sign CSL host).' };

      // ─── E019 — Beam namespace ────────────────────────────────────
      case 'beam.list':
      case 'beam.getState': {
        const raw = await new Promise(resolve =>
          chrome.storage.local.get(['charms_beam_operations'], r =>
            resolve(r['charms_beam_operations'] ?? null))
        );
        const all = raw ? (typeof raw === 'string' ? safeParse(raw) : raw) : {};
        if (method === 'beam.getState') {
          const id = params?.beamId;
          return { result: id ? all?.[id] || null : null };
        }
        return { result: Object.values(all || {}) };
      }

      case 'beam.out':
      case 'beam.back':
      case 'beam.ebtcMint':
      case 'beam.ebtcRedeem':
        return { error: 'not_yet_implemented', detail: 'DApp-initiated beams land with E017b (SW-driven executors + approve-beam popup).' };

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
  
  // Return ALL addresses — P2WPKH (bc1q/tb1q) first for CAST compatibility
  const accountAddresses = sortP2wpkhFirst(addresses.map(a => a?.address || a));
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


  // ── Offscreen prover messages ─────────────────────────────────────────────

  // Popup → Background: start ZK proof in offscreen document
  if (request.type === 'START_CHARM_PROOF') {
    handleStartCharmProof(request.params)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Popup → Background: check if a proof result is waiting
  if (request.type === 'GET_PENDING_PROOF') {
    chrome.storage.local.get([EXT.PENDING_PROOF, EXT.PROVING_STATUS], (data) => {
      sendResponse({
        pendingProof:   data[EXT.PENDING_PROOF]   || null,
        provingStatus:  data[EXT.PROVING_STATUS]  || null,
      });
    });
    return true;
  }

  // Popup → Background: discard pending proof (user cancelled)
  if (request.type === 'CLEAR_PENDING_PROOF') {
    chrome.storage.local.remove([EXT.PENDING_PROOF, EXT.PROVING_STATUS], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Offscreen → Background: live status update (forwarded to popup if open)
  if (request.type === 'PROVER_STATUS') {
    chrome.storage.local.set({ [EXT.PROVING_STATUS]: { message: request.message, ts: Date.now() } });
    chrome.runtime.sendMessage({ type: 'PROVER_STATUS_UPDATE', message: request.message }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // Offscreen → Background: proof succeeded
  if (request.type === 'PROVER_RESULT') {
    handleProverResult({
      spellTxHex:       request.spellTxHex,
      prevTxMapEntries: request.prevTxMapEntries,
      fee:              request.fee,
    });
    sendResponse({ ok: true });
    return true;
  }

  // Offscreen → Background: proof failed
  if (request.type === 'PROVER_ERROR') {
    handleProverError(request.error);
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'API_REQUEST') {
    // Forward API requests to bypass CORS
    const fetchOptions = {
      method: request.method || 'GET',
      headers: request.headers || {},
    };
    
    if (request.body && request.method !== 'GET') {
      fetchOptions.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
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
  
  // Check if a wallet exists. A G003 wallet is identified by its auth
  // blob; only legacy or web-transferred wallets keep a plaintext seed,
  // so testing SEED_PHRASE alone reported hasWallet=false for every
  // wallet created since G003.
  // ── Passkey signing delegation ───────────────────────────────────────
  // The popup writes EXT_SIGN_PENDING then opens the wallet tab. The page
  // reads it through EXT_SIGN_GET, signs with the passkey, and returns the
  // artifact via EXT_SIGN_RESOLVE. Only the signature crosses back; the
  // mnemonic stays in the wallet tab.

  if (request.type === 'EXT_SIGN_GET') {
    chrome.storage.local.get([EXT_SIGN_PENDING], (data) => {
      const pending = data[EXT_SIGN_PENDING];
      // Match on id so a stale tab cannot answer a newer request.
      const payload = pending && pending.requestId === request.requestId ? pending.payload : null;
      sendResponse({ payload });
    });
    return true;
  }

  if (request.type === 'EXT_SIGN_RESOLVE') {
    chrome.storage.local.get([EXT_SIGN_PENDING], (data) => {
      const pending = data[EXT_SIGN_PENDING];
      if (!pending || pending.requestId !== request.requestId) {
        sendResponse({ ok: false });
        return;
      }
      chrome.storage.local.set({
        [EXT_SIGN_RESULT]: {
          requestId: request.requestId,
          result: request.result ?? null,
          error: request.error ?? null,
          at: Date.now(),
        },
      }, () => {
        chrome.storage.local.remove(EXT_SIGN_PENDING, () => sendResponse({ ok: true }));
      });
    });
    return true;
  }

  if (request.type === 'CHECK_WALLET_STATUS') {
    chrome.storage.local.get([SK.AUTH, SK.SEED_PHRASE], (data) => {
      sendResponse({ hasWallet: !!(data[SK.AUTH] || data[SK.SEED_PHRASE]) });
    });
    return true;
  }

  // Adopt a wallet handed over by /extension-link.
  if (request.type === 'EXT_LINK_ADOPT') {
    adoptLinkedWallet(request.requestId, request.payload).then(sendResponse);
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

// ─── Beam keep-alive (E017 — partial) ──────────────────────────────────────
//
// Beams run for 60–90 min and the popup may close at any time. Today's
// executor still lives in the popup React context (BeamOperationsContext
// + executeBeamOut / executeEbtcBeam / etc), so the actual signing /
// proving / broadcasting only progresses while the popup is open. This
// block makes the service worker re-wake periodically while a beam is
// "active" in storage so:
//   1. The popup-side runner can rely on chrome.storage onChange events
//      reaching it (the SW must be alive to dispatch them).
//   2. When E017's full migration moves the runner into the SW, the
//      keep-alive scaffolding is already in place.
//
// Source of truth for "active beam exists": the wallet's beam
// persistence layer (services/beam/core/persistence.js) writes to
// chrome.storage.local key `charms_beam_operations`. We scan it for any
// entry whose phase ≠ 'complete' and ≠ 'error'.

const BEAM_ALARM_NAME = 'beam:keepalive';
const BEAM_STORAGE_KEY = 'charms_beam_operations';
const BEAM_ALARM_INTERVAL_MIN = 4.5; // ms idle limit is 5 min — ping just under that

async function hasActiveBeam() {
  try {
    const raw = await new Promise(resolve =>
      chrome.storage.local.get([BEAM_STORAGE_KEY], r => resolve(r[BEAM_STORAGE_KEY] ?? null))
    );
    if (!raw) return false;
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj).some(op => {
      const phase = op?.phase;
      return phase && phase !== 'complete' && phase !== 'error';
    });
  } catch { return false; }
}

async function scheduleBeamKeepalive() {
  if (!(await hasActiveBeam())) return;
  try {
    await chrome.alarms.create(BEAM_ALARM_NAME, {
      delayInMinutes: BEAM_ALARM_INTERVAL_MIN,
      periodInMinutes: BEAM_ALARM_INTERVAL_MIN,
    });
  } catch (e) { console.warn('[beam-keepalive] schedule failed:', e?.message); }
}

async function cancelBeamKeepalive() {
  try { await chrome.alarms.clear(BEAM_ALARM_NAME); } catch {}
}

// Re-evaluate whenever beam state changes (popup writes via persistence).
// Also broadcasts beam:phase / beam:complete / beam:error events to all
// open tabs so DApps subscribed via window.charmsWallet.on('beam:*', cb)
// receive lifecycle updates. The diff between oldValue and newValue
// drives the per-op event emission (E019).
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !(BEAM_STORAGE_KEY in changes)) return;
  if (await hasActiveBeam()) {
    await scheduleBeamKeepalive();
  } else {
    await cancelBeamKeepalive();
  }
  await broadcastBeamDiff(changes[BEAM_STORAGE_KEY]);
});

/** Forward beam lifecycle events to every tab so any inpage.js listener
 *  in a connected DApp receives them. Diff-based — only fires when a
 *  phase actually changes or completion/error transitions. */
async function broadcastBeamDiff(change) {
  if (!change) return;
  const oldMap = change.oldValue
    ? (typeof change.oldValue === 'string' ? safeParse(change.oldValue, {}) : change.oldValue) || {}
    : {};
  const newMap = change.newValue
    ? (typeof change.newValue === 'string' ? safeParse(change.newValue, {}) : change.newValue) || {}
    : {};

  const events = [];
  for (const [id, op] of Object.entries(newMap)) {
    const prev = oldMap[id];
    const phase = op?.phase;
    if (!phase) continue;
    if (phase === 'complete' && (!prev || prev.phase !== 'complete')) {
      events.push({ event: 'beam:complete', data: { id, op } });
    } else if (phase === 'error' && (!prev || prev.phase !== 'error')) {
      events.push({ event: 'beam:error', data: { id, op, error: op?.error } });
    } else if (!prev || prev.phase !== phase) {
      events.push({ event: 'beam:phase', data: { id, phase, statusMessage: op?.statusMessage } });
    }
  }
  if (!events.length) return;

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      for (const evt of events) {
        chrome.tabs.sendMessage(tab.id, { type: 'CHARMS_WALLET_EVENT', ...evt }).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[beam-events] broadcast failed:', e?.message);
  }
}

// On alarm fire: keep SW alive, reschedule if still active. The next
// fire is automatic via `periodInMinutes`, but we re-check active status
// so a completed beam doesn't keep waking us forever.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== BEAM_ALARM_NAME) return;
  if (!(await hasActiveBeam())) {
    await cancelBeamKeepalive();
  }
});

// On SW startup, re-arm if a beam was active before the worker was
// killed (browser restart, idle eviction).
chrome.runtime.onStartup?.addListener(() => { scheduleBeamKeepalive(); });
chrome.runtime.onInstalled.addListener(() => { scheduleBeamKeepalive(); });
