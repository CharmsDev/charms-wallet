import * as bitcoin from 'bitcoinjs-lib';

/**
 * Charm Verifier Service (Extension-only)
 * 
 * Self-contained module that extracts charm/token data from UTXOs
 * using the external prover verify API instead of WASM.
 * 
 * Flow:
 *   1. For each UTXO tx, fetch tx hex from mempool.space
 *   2. POST tx_hex to /spells/verify on the prover API
 *   3. Normalize the response into wallet-compatible CharmObj format
 *   4. Enrich with known token metadata (BRO, etc.)
 * 
 * This module is intentionally isolated from the core wallet code.
 * It can be replaced later with charms-js WASM or another approach.
 */

// ============================================
// Configuration
// ============================================

const PROVER_BASE_URL = 'https://mock-prover.fly.dev';
const VERIFY_ENDPOINT = `${PROVER_BASE_URL}/spells/verify`;

const MEMPOOL_API = {
  testnet4: 'https://mempool.space/testnet4/api',
  mainnet: 'https://mempool.space/api',
};

// Known token metadata registry
const KNOWN_TOKENS = {
  't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f': {
    name: 'Bro',
    ticker: '$BRO',
    image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
    decimals: 8,
    type: 'token',
  },
};

// ============================================
// Address extraction from transaction outputs
// ============================================

/**
 * Extract the Bitcoin address from a specific output of a transaction.
 * This is critical: we must verify that the charm output actually pays
 * to one of our wallet addresses, not just that the vout index matches.
 */
function extractAddressFromOutput(txHex, outputIndex, network = 'testnet4') {
  try {
    const networkObj = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    const tx = bitcoin.Transaction.fromHex(txHex);
    
    if (!tx.outs || outputIndex >= tx.outs.length) {
      return null;
    }
    
    const output = tx.outs[outputIndex];
    if (!output || !output.script) {
      return null;
    }
    
    return bitcoin.address.fromOutputScript(output.script, networkObj);
  } catch (error) {
    return null;
  }
}

// ============================================
// Mempool API helpers
// ============================================

/**
 * Get transaction hex from mempool.space
 */
async function fetchTxHex(txid, network = 'testnet4') {
  const base = MEMPOOL_API[network] || MEMPOOL_API.testnet4;
  const url = `${base}/tx/${txid}/hex`;
  
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return await response.text();
}

// ============================================
// Prover Verify API
// ============================================

/**
 * Call the prover /spells/verify endpoint
 * @param {string} txHex - Raw transaction hex
 * @param {string} network - 'mainnet' or 'testnet4'
 * @returns {Object|null} VerifyResult or null on failure
 */
async function verifySpell(txHex, network = 'testnet4') {
  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_hex: txHex, network }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (!result.success || !result.charms || result.charms.length === 0) {
      return null;
    }

    return result;
  } catch (error) {
    console.error('[CharmVerifier] verifySpell error:', error.message);
    return null;
  }
}

// ============================================
// Normalizer
// ============================================

/**
 * Check if an app_id represents a token (starts with "t/")
 */
function isTokenAppId(appId) {
  return typeof appId === 'string' && appId.startsWith('t/');
}

/**
 * Check if an app_id represents an NFT (starts with "n/")
 */
function isNFTAppId(appId) {
  return typeof appId === 'string' && appId.startsWith('n/');
}

/**
 * Get known metadata for a token, or generate defaults
 */
function getTokenMetadata(appId) {
  const known = KNOWN_TOKENS[appId];
  if (known) {
    return { ...known, isBroToken: appId === Object.keys(KNOWN_TOKENS)[0] };
  }

  // Unknown token - generate basic metadata
  if (isTokenAppId(appId)) {
    return {
      name: 'Unknown Token',
      ticker: 'TOKEN',
      image: null,
      decimals: 0,
      type: 'token',
      isBroToken: false,
    };
  }

  if (isNFTAppId(appId)) {
    return {
      name: 'NFT',
      ticker: null,
      image: null,
      decimals: 0,
      type: 'nft',
      isBroToken: false,
    };
  }

  return {
    name: 'Unknown Charm',
    ticker: null,
    image: null,
    decimals: 0,
    type: 'unknown',
    isBroToken: false,
  };
}

/**
 * Normalize a single charm from the verify API response into wallet CharmObj format.
 * 
 * Verify API returns:
 *   { app_id: "t/hash/vk", data: <number|object>, output_index: <number> }
 * 
 * Wallet expects CharmObj:
 *   { txid, outputIndex, address, appId, amount, type, name, ticker, image, ... }
 */
function normalizeCharm(verifyCharm, txid, address, utxoVout) {
  const appId = verifyCharm.app_id;
  const outputIndex = verifyCharm.output_index;
  const meta = getTokenMetadata(appId);

  // Extract raw amount from data field
  let rawAmount = 0;
  if (typeof verifyCharm.data === 'number') {
    rawAmount = verifyCharm.data;
  } else if (typeof verifyCharm.data === 'object' && verifyCharm.data !== null) {
    // Could be { remaining: N } for NFTs or other structures
    rawAmount = verifyCharm.data.remaining ?? verifyCharm.data.amount ?? 0;
  }

  // Build display amount using decimals
  const decimals = meta.decimals || 0;
  const displayAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;
  const displayAmountStr = formatDisplayAmount(displayAmount);

  return {
    // Core identifiers
    txid,
    outputIndex,
    address,
    appId,

    // Amount
    amount: rawAmount,
    displayAmount: displayAmountStr,
    decimals,

    // Type
    type: meta.type,

    // Metadata
    name: meta.name,
    ticker: meta.ticker,
    image: meta.image,
    description: '',
    isBroToken: meta.isBroToken || false,

    // For charmsStore compatibility
    metadata: {
      name: meta.name,
      ticker: meta.ticker,
      image: meta.image,
    },
  };
}

function formatDisplayAmount(num) {
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(8).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}

// ============================================
// Main Public API
// ============================================

/**
 * Extract all charms from a set of UTXOs using the external verify API.
 * 
 * @param {Object} utxoMap - { address: [{ txid, vout, value, ... }, ...] }
 * @param {string} network - 'mainnet' or 'testnet4'
 * @param {Function} onCharmFound - async callback(charmObj) for each charm found
 * @param {Function} onProgress - callback(current, total) for progress updates
 * @returns {Promise<{ charmsFound: number, errors: number }>}
 */
export async function extractCharmsFromUTXOs(utxoMap, network = 'testnet4', onCharmFound, onProgress) {
  const stats = { charmsFound: 0, errors: 0, txProcessed: 0 };

  // Collect unique txids with their address/vout info
  const txMap = new Map(); // txid -> [{ address, vout, value }]
  
  for (const [address, utxos] of Object.entries(utxoMap)) {
    for (const utxo of utxos) {
      if (!txMap.has(utxo.txid)) {
        txMap.set(utxo.txid, []);
      }
      txMap.get(utxo.txid).push({
        address,
        vout: utxo.vout,
        value: utxo.value,
      });
    }
  }

  const txids = Array.from(txMap.keys());
  const total = txids.length;

  console.log(`[CharmVerifier] Processing ${total} unique transactions for charms...`);

  for (let i = 0; i < txids.length; i++) {
    const txid = txids[i];
    
    if (onProgress) {
      onProgress(i, total);
    }

    try {
      // 1. Fetch tx hex
      const txHex = await fetchTxHex(txid, network);
      if (!txHex) {
        stats.txProcessed++;
        continue;
      }

      // 2. Verify spell via prover API
      const result = await verifySpell(txHex, network);
      if (!result) {
        stats.txProcessed++;
        continue;
      }

      // 3. Match charms to our UTXOs — with address ownership verification
      const utxoInfos = txMap.get(txid);
      const walletAddresses = new Set(utxoInfos.map(u => u.address));
      
      console.log(`[CharmVerifier] tx ${txid.slice(0,8)}... has ${result.charms.length} charms, wallet owns vouts: ${utxoInfos.map(u => u.vout).join(',')}, addresses: ${[...walletAddresses].map(a => a.slice(0,12)).join(',')}`);
      
      for (const charm of result.charms) {
        // CRITICAL: Extract the actual address from the charm's output in the tx
        // This prevents counting charms that belong to other addresses
        // (e.g., when we own a change output from a charm tx but not the charm output)
        const charmAddress = extractAddressFromOutput(txHex, charm.output_index, network);
        
        console.log(`[CharmVerifier]   charm output_index=${charm.output_index} app=${charm.app_id?.slice(0,20)}... charmAddr=${charmAddress?.slice(0,12) || 'NULL'} ours=${charmAddress ? walletAddresses.has(charmAddress) : false}`);
        
        if (!charmAddress || !walletAddresses.has(charmAddress)) {
          continue;
        }

        // Verify the UTXO actually exists at this output index for this address
        const matchingUtxo = utxoInfos.find(u => u.address === charmAddress && u.vout === charm.output_index);
        if (!matchingUtxo) {
          console.log(`[CharmVerifier]   SKIP: address matches but no UTXO at vout ${charm.output_index}`);
          continue;
        }

        // Skip non-token charms with zero amount (e.g., order book entries)
        if (typeof charm.data === 'number' && charm.data === 0) continue;

        // 4. Normalize into wallet format
        const normalized = normalizeCharm(charm, txid, charmAddress, matchingUtxo.vout);

        if (onCharmFound) {
          await onCharmFound(normalized);
        }

        stats.charmsFound++;
      }

      stats.txProcessed++;
    } catch (error) {
      console.error(`[CharmVerifier] Error processing tx ${txid.slice(0, 8)}...:`, error.message);
      stats.errors++;
      stats.txProcessed++;
    }
  }

  if (onProgress) {
    onProgress(total, total);
  }

  console.log(`[CharmVerifier] Done. Found ${stats.charmsFound} charms in ${stats.txProcessed}/${total} txs (${stats.errors} errors)`);
  return stats;
}

/**
 * Get charms for a single address (convenience wrapper).
 * Fetches UTXOs from mempool.space, then extracts charms.
 * 
 * @param {string} address - Bitcoin address
 * @param {string} network - 'mainnet' or 'testnet4'
 * @returns {Promise<Array>} Array of normalized CharmObj
 */
export async function getCharmsForAddress(address, network = 'testnet4') {
  const base = MEMPOOL_API[network] || MEMPOOL_API.testnet4;
  
  // Fetch UTXOs
  const response = await fetch(`${base}/address/${address}/utxo`);
  if (!response.ok) {
    console.error(`[CharmVerifier] Failed to fetch UTXOs for ${address.slice(0, 12)}...`);
    return [];
  }
  
  const utxos = await response.json();
  if (!utxos || utxos.length === 0) return [];

  // Build utxoMap
  const utxoMap = {
    [address]: utxos.map(u => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
    })),
  };

  // Extract charms
  const charms = [];
  await extractCharmsFromUTXOs(utxoMap, network, async (charm) => {
    charms.push(charm);
  });

  return charms;
}

export default {
  extractCharmsFromUTXOs,
  getCharmsForAddress,
  KNOWN_TOKENS,
  VERIFY_ENDPOINT,
};
