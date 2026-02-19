/**
 * FAILOVER: Charm Transaction Extractor
 * 
 * Enriches transaction history with charm token data using the prover API.
 * Used by TransactionRecorder when the Explorer API is unavailable.
 * 
 * PRIMARY replacement: Explorer API GET /v1/wallet/charms/{address}
 * 
 * @see ./README.md for when this can be deleted
 */

import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';

const PROVER_BASE_URL = 'https://mock-prover.fly.dev';
const VERIFY_ENDPOINT = `${PROVER_BASE_URL}/spells/verify`;

const MEMPOOL_API = {
    testnet4: 'https://mempool.space/testnet4/api',
    mainnet: 'https://mempool.space/api',
};

const BRO_TOKEN_FALLBACK = {
    name: 'Bro',
    ticker: '$BRO',
    image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
    decimals: 8
};

async function fetchTxHex(txid, network = 'mainnet') {
    const base = MEMPOOL_API[network] || MEMPOOL_API.mainnet;
    const url = `${base}/tx/${txid}/hex`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        console.warn(`[FailoverCharmTxExtractor] Failed to fetch tx hex for ${txid}:`, error.message);
        return null;
    }
}

async function verifySpell(txHex, network = 'mainnet') {
    try {
        const response = await fetch(VERIFY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tx_hex: txHex, network }),
        });
        if (!response.ok) return null;
        const result = await response.json();
        if (!result.success || !result.charms || result.charms.length === 0) return null;
        return result;
    } catch (error) {
        return null;
    }
}

export async function extractCharmTokenData(txid, network, myAddresses = []) {
    try {
        const txHex = await fetchTxHex(txid, network);
        if (!txHex) return null;

        const spellResult = await verifySpell(txHex, network);
        if (!spellResult) return null;

        const charm = spellResult.charms[0];
        const appId = charm.app_id || charm.appId;
        if (!appId) return null;

        let tokenName = 'Unknown Token';
        let tokenTicker = 'TOKEN';
        let tokenImage = null;

        const broAppId = getBroTokenAppId();
        const isBroToken = appId === broAppId;

        if (isBroToken) {
            tokenName = BRO_TOKEN_FALLBACK.name;
            tokenTicker = BRO_TOKEN_FALLBACK.ticker;
            tokenImage = BRO_TOKEN_FALLBACK.image;
        }

        let rawAmount = 0;
        if (typeof charm.data === 'number') {
            rawAmount = charm.data;
        } else if (typeof charm.data === 'object' && charm.data !== null) {
            rawAmount = charm.data.remaining ?? charm.data.amount ?? 0;
        }

        const decimals = isBroToken ? BRO_TOKEN_FALLBACK.decimals : 0;
        const tokenAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;

        return {
            appId,
            tokenName,
            tokenTicker,
            tokenImage,
            tokenAmount,
            tokenAmountSats: rawAmount,
            charmData: charm
        };
    } catch (error) {
        console.warn('[FailoverCharmTxExtractor] Error:', error.message);
        return null;
    }
}

export async function extractCharmTokenDataBatch(transactions, network, myAddresses = [], onProgress = null) {
    const results = new Map();
    
    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        if (onProgress) onProgress(i + 1, transactions.length);
        
        try {
            const charmData = await extractCharmTokenData(tx.txid, network, myAddresses);
            if (charmData) {
                results.set(tx.txid, charmData);
            }
        } catch (error) {
            // Continue with next transaction
        }
    }
    
    return results;
}
