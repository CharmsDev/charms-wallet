/**
 * FallbackProvider — mempool.space + prover fallback for when Explorer API is down.
 *
 * Self-contained module with no React, no Zustand, no storage side-effects.
 * Returns the same data shapes as the Explorer API so the caller can use
 * either path transparently.
 *
 * Usage:
 *   import { fallbackProvider } from '@/services/shared/fallback-provider';
 *   const balance = await fallbackProvider.getBalance(addresses, 'mainnet');
 */

import { mempoolService } from './mempool-service';
import { normalizeMempoolUTXOs } from './data-normalizers';
import { isPotentialCharm } from '@/services/utxo/utils/charms';

// ── Config ──────────────────────────────────────────────────────────────────

const PROVER_BASE_URL = 'https://mock-prover.fly.dev';
const VERIFY_ENDPOINT = `${PROVER_BASE_URL}/spells/verify`;

const KNOWN_TOKENS = {
    't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f': {
        name: 'Bro', ticker: '$BRO', decimals: 8, type: 'token',
        image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
    },
};

// ── Private helpers ─────────────────────────────────────────────────────────

function getTokenMeta(appId) {
    const known = KNOWN_TOKENS[appId];
    if (known) return { ...known, isBroToken: true };
    if (appId?.startsWith('t/')) return { name: 'Unknown Token', ticker: 'TOKEN', decimals: 0, type: 'token', image: null, isBroToken: false };
    if (appId?.startsWith('n/')) return { name: 'NFT', ticker: null, decimals: 0, type: 'nft', image: null, isBroToken: false };
    return { name: 'Unknown Charm', ticker: null, decimals: 0, type: 'unknown', image: null, isBroToken: false };
}

function formatAmount(num) {
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(8).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function normalizeVerifiedCharm(charm, txid, address) {
    const meta = getTokenMeta(charm.app_id);
    let rawAmount = 0;
    if (typeof charm.data === 'number') rawAmount = charm.data;
    else if (charm.data && typeof charm.data === 'object') rawAmount = charm.data.remaining ?? charm.data.amount ?? 0;

    const decimals = meta.decimals || 0;
    const displayAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;

    return {
        txid,
        outputIndex: charm.output_index,
        address,
        appId: charm.app_id,
        amount: rawAmount,
        displayAmount: formatAmount(displayAmount),
        decimals,
        type: meta.type,
        name: meta.name,
        ticker: meta.ticker,
        image: meta.image,
        description: '',
        isBroToken: meta.isBroToken,
        metadata: { name: meta.name, ticker: meta.ticker, image: meta.image },
    };
}

async function verifySpell(txHex, network) {
    try {
        const resp = await fetch(VERIFY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tx_hex: txHex, network }),
        });
        if (!resp.ok) return null;
        const result = await resp.json();
        return (result.success && result.charms?.length > 0) ? result : null;
    } catch {
        return null;
    }
}

function extractAddressFromOutput(txHex, outputIndex, network) {
    try {
        const bitcoin = require('bitcoinjs-lib');
        const net = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
        const tx = bitcoin.Transaction.fromHex(txHex);
        if (!tx.outs || outputIndex >= tx.outs.length) return null;
        return bitcoin.address.fromOutputScript(tx.outs[outputIndex].script, net);
    } catch {
        return null;
    }
}

// ── FallbackProvider ────────────────────────────────────────────────────────

class FallbackProvider {

    /**
     * Fetch UTXOs for multiple addresses from mempool.space.
     * Returns flat array in the same shape as explorerWalletService.getAggregateUTXOs().
     */
    async getUTXOs(addresses, network) {
        const all = [];
        const BATCH = 5;

        for (let i = 0; i < addresses.length; i += BATCH) {
            const batch = addresses.slice(i, i + BATCH);
            const results = await Promise.allSettled(
                batch.map(addr => mempoolService.getAddressUTXOs(addr, network))
            );

            for (let j = 0; j < results.length; j++) {
                const r = results[j];
                if (r.status !== 'fulfilled' || !r.value) continue;
                const { utxos, currentBlockHeight } = r.value;
                const addr = batch[j];
                const normalized = normalizeMempoolUTXOs(utxos || [], currentBlockHeight, addr);
                all.push(...normalized);
            }
        }

        return all;
    }

    /**
     * Calculate BTC balance from mempool UTXOs.
     * Filters out dust (≤1000 sats) — same logic as extension-wallet-sync.js.
     * Returns { confirmed, unconfirmed, total }.
     */
    async getBalance(addresses, network) {
        const utxos = await this.getUTXOs(addresses, network);
        let confirmed = 0;
        let unconfirmed = 0;

        for (const utxo of utxos) {
            const sats = utxo.value || 0;
            if (sats <= 1000) continue; // dust / potential charm
            if ((utxo.confirmations || 0) >= 1) confirmed += sats;
            else unconfirmed += sats;
        }

        return { confirmed, unconfirmed, total: confirmed + unconfirmed };
    }

    /**
     * Detect charms via prover /spells/verify.
     * SLOW (~10-30s for many UTXOs). If prover is down, returns degraded: true.
     * Returns { charms: CharmObj[], tokenBalances: [], degraded: boolean }.
     */
    async getCharmBalances(addresses, network, { onProgress, onCharmFound } = {}) {
        const utxos = await this.getUTXOs(addresses, network);

        // Build txid → [{address, vout, value}] map from potential charms
        const txMap = new Map();
        for (const utxo of utxos) {
            if (!isPotentialCharm(utxo)) continue;
            const key = utxo.txid;
            if (!txMap.has(key)) txMap.set(key, []);
            txMap.get(key).push({ address: utxo.address, vout: utxo.vout, value: utxo.value });
        }

        const txids = [...txMap.keys()];
        if (txids.length === 0) {
            return { charms: [], tokenBalances: [], degraded: false };
        }

        // Verify each tx via prover
        const charms = [];
        const seenKeys = new Set();
        let proverDown = false;

        for (let i = 0; i < txids.length; i++) {
            const txid = txids[i];
            if (onProgress) onProgress(i, txids.length);

            try {
                const txHex = await mempoolService.getTransactionHex(txid, network);
                if (!txHex) continue;

                const result = await verifySpell(txHex, network);
                if (!result) {
                    // Could be non-charm tx or prover down — check if prover is reachable
                    if (i === 0 && !result) {
                        try {
                            const ping = await fetch(PROVER_BASE_URL, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
                            if (!ping.ok) proverDown = true;
                        } catch { proverDown = true; }
                    }
                    if (proverDown) break;
                    continue;
                }

                const utxoInfos = txMap.get(txid);
                const walletAddrs = new Set(utxoInfos.map(u => u.address));

                for (const charm of result.charms) {
                    const charmAddr = extractAddressFromOutput(txHex, charm.output_index, network);
                    if (!charmAddr || !walletAddrs.has(charmAddr)) continue;
                    if (typeof charm.data === 'number' && charm.data === 0) continue;

                    const key = `${txid}:${charm.output_index}`;
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);

                    const normalized = normalizeVerifiedCharm(charm, txid, charmAddr);
                    charms.push(normalized);
                    if (onCharmFound) await onCharmFound(normalized);
                }
            } catch (err) {
                console.warn(`[FallbackProvider] Error verifying ${txid.slice(0, 8)}: ${err.message}`);
            }
        }

        if (onProgress) onProgress(txids.length, txids.length);

        // Build token balance summary
        const tokenMap = {};
        for (const c of charms) {
            if (!tokenMap[c.appId]) tokenMap[c.appId] = { appId: c.appId, name: c.name, ticker: c.ticker, amount: 0 };
            tokenMap[c.appId].amount += c.amount;
        }

        return {
            charms,
            tokenBalances: Object.values(tokenMap),
            degraded: proverDown,
        };
    }

    /**
     * Fetch tx history from mempool.space for multiple addresses.
     * Returns raw mempool tx array (caller can analyze direction).
     */
    async getTransactionHistory(addresses, network) {
        const BATCH = 5;
        const txMap = new Map();

        for (let i = 0; i < addresses.length; i += BATCH) {
            const batch = addresses.slice(i, i + BATCH);
            const results = await Promise.allSettled(
                batch.map(addr => mempoolService.getAddressTransactions(addr, network))
            );
            for (const r of results) {
                if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
                for (const tx of r.value) {
                    if (!txMap.has(tx.txid)) txMap.set(tx.txid, tx);
                }
            }
        }

        return [...txMap.values()];
    }

    /**
     * Fee estimates from mempool.space.
     */
    async getFeeEstimates(network) {
        return mempoolService.getFeeEstimates(network);
    }

    /**
     * Broadcast via mempool.space.
     */
    async broadcastTransaction(txHex, network) {
        return mempoolService.broadcastTransaction(txHex, network);
    }
}

export const fallbackProvider = new FallbackProvider();
export default FallbackProvider;
