/**
 * FAILOVER: Charm Verifier
 * 
 * Extracts charm/token data from UTXOs using the external prover verify API.
 * This is the SLOW path — fetches tx hex from mempool.space, then verifies
 * each transaction via the prover /spells/verify endpoint.
 * 
 * PRIMARY replacement: Explorer API GET /v1/wallet/charms/{address}
 * This module is only used when the Explorer API is unavailable.
 * 
 * @see ../extension-wallet-sync.js for the primary flow
 * @see ./README.md for when this can be deleted
 */

import * as bitcoin from 'bitcoinjs-lib';

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
    console.error('[FailoverCharmVerifier] verifySpell error:', error.message);
    return null;
  }
}

// ============================================
// Normalizer
// ============================================

function isTokenAppId(appId) {
  return typeof appId === 'string' && appId.startsWith('t/');
}

function isNFTAppId(appId) {
  return typeof appId === 'string' && appId.startsWith('n/');
}

function getTokenMetadata(appId) {
  const known = KNOWN_TOKENS[appId];
  if (known) {
    return { ...known, isBroToken: appId === Object.keys(KNOWN_TOKENS)[0] };
  }

  if (isTokenAppId(appId)) {
    return { name: 'Unknown Token', ticker: 'TOKEN', image: null, decimals: 0, type: 'token', isBroToken: false };
  }

  if (isNFTAppId(appId)) {
    return { name: 'NFT', ticker: null, image: null, decimals: 0, type: 'nft', isBroToken: false };
  }

  return { name: 'Unknown Charm', ticker: null, image: null, decimals: 0, type: 'unknown', isBroToken: false };
}

function normalizeCharm(verifyCharm, txid, address, utxoVout) {
  const appId = verifyCharm.app_id;
  const outputIndex = verifyCharm.output_index;
  const meta = getTokenMetadata(appId);

  let rawAmount = 0;
  if (typeof verifyCharm.data === 'number') {
    rawAmount = verifyCharm.data;
  } else if (typeof verifyCharm.data === 'object' && verifyCharm.data !== null) {
    rawAmount = verifyCharm.data.remaining ?? verifyCharm.data.amount ?? 0;
  }

  const decimals = meta.decimals || 0;
  const displayAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;
  const displayAmountStr = formatDisplayAmount(displayAmount);

  return {
    txid,
    outputIndex,
    address,
    appId,
    amount: rawAmount,
    displayAmount: displayAmountStr,
    decimals,
    type: meta.type,
    name: meta.name,
    ticker: meta.ticker,
    image: meta.image,
    description: '',
    isBroToken: meta.isBroToken || false,
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
 * SLOW: makes N requests to mempool.space + N requests to prover.
 */
export async function extractCharmsFromUTXOs(utxoMap, network = 'testnet4', onCharmFound, onProgress) {
  const stats = { charmsFound: 0, errors: 0, txProcessed: 0 };

  const txMap = new Map();
  
  for (const [address, utxos] of Object.entries(utxoMap)) {
    for (const utxo of utxos) {
      if (!txMap.has(utxo.txid)) {
        txMap.set(utxo.txid, []);
      }
      txMap.get(utxo.txid).push({ address, vout: utxo.vout, value: utxo.value });
    }
  }

  const txids = Array.from(txMap.keys());
  const total = txids.length;

  console.log(`[FailoverCharmVerifier] Processing ${total} unique transactions for charms...`);

  for (let i = 0; i < txids.length; i++) {
    const txid = txids[i];
    
    if (onProgress) onProgress(i, total);

    try {
      const txHex = await fetchTxHex(txid, network);
      if (!txHex) { stats.txProcessed++; continue; }

      const result = await verifySpell(txHex, network);
      if (!result) { stats.txProcessed++; continue; }

      const utxoInfos = txMap.get(txid);
      const walletAddresses = new Set(utxoInfos.map(u => u.address));
      
      for (const charm of result.charms) {
        const charmAddress = extractAddressFromOutput(txHex, charm.output_index, network);
        
        if (!charmAddress || !walletAddresses.has(charmAddress)) continue;

        const matchingUtxo = utxoInfos.find(u => u.address === charmAddress && u.vout === charm.output_index);
        if (!matchingUtxo) continue;

        if (typeof charm.data === 'number' && charm.data === 0) continue;

        const normalized = normalizeCharm(charm, txid, charmAddress, matchingUtxo.vout);

        if (onCharmFound) await onCharmFound(normalized);
        stats.charmsFound++;
      }

      stats.txProcessed++;
    } catch (error) {
      console.error(`[FailoverCharmVerifier] Error processing tx ${txid.slice(0, 8)}...:`, error.message);
      stats.errors++;
      stats.txProcessed++;
    }
  }

  if (onProgress) onProgress(total, total);

  console.log(`[FailoverCharmVerifier] Done. Found ${stats.charmsFound} charms in ${stats.txProcessed}/${total} txs (${stats.errors} errors)`);
  return stats;
}

export async function getCharmsForAddress(address, network = 'testnet4') {
  const base = MEMPOOL_API[network] || MEMPOOL_API.testnet4;
  
  const response = await fetch(`${base}/address/${address}/utxo`);
  if (!response.ok) return [];
  
  const utxos = await response.json();
  if (!utxos || utxos.length === 0) return [];

  const utxoMap = {
    [address]: utxos.map(u => ({ txid: u.txid, vout: u.vout, value: u.value })),
  };

  const charms = [];
  await extractCharmsFromUTXOs(utxoMap, network, async (charm) => { charms.push(charm); });
  return charms;
}

export default {
  extractCharmsFromUTXOs,
  getCharmsForAddress,
  KNOWN_TOKENS,
  VERIFY_ENDPOINT,
};
