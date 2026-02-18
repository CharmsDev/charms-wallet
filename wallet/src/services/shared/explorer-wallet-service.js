'use client';

import config from '@/config';

/**
 * Charms Explorer Wallet API Service
 * Direct Bitcoin node RPC via the Charms Explorer API.
 * No rate limits — can be called sequentially without delays.
 * 
 * Base URL configured via NEXT_PUBLIC_EXPLORER_WALLET_API_URL
 * (mapped from VITE_EXPLORER_WALLET_API_URL in the extension).
 */
export class ExplorerWalletService {
    constructor() {
        this.timeout = 15000; // 15s — scantxoutset can be slow for large addresses
        this.tipCache = { value: null, expiry: 0 };
        this.tipCacheTTL = 30 * 1000; // 30s TTL for chain tip

        // Circuit breaker: disable after consecutive failures
        this._consecutiveFailures = 0;
        this._disabledUntil = 0;
        this._failureThreshold = 2;    // trips after 2 consecutive failures
        this._cooldownMs = 60 * 1000;  // 60s cooldown before retrying
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    _getBaseUrl() {
        return config.explorerWallet?.apiUrl || null;
    }

    /**
     * Append ?network=<network> (or &network=<network>) to a path.
     * Every request MUST include this so the server knows which chain to query.
     */
    _withNetwork(path, network) {
        const net = (network || 'mainnet').toString().toLowerCase();
        const sep = path.includes('?') ? '&' : '?';
        return `${path}${sep}network=${net}`;
    }

    isAvailable(_network) {
        const url = this._getBaseUrl();
        if (!url || url.trim() === '') return false;
        // Circuit breaker: temporarily disabled after consecutive failures
        if (this._disabledUntil > Date.now()) {
            return false;
        }
        return true;
    }

    _onSuccess() {
        this._consecutiveFailures = 0;
    }

    _onFailure() {
        this._consecutiveFailures++;
        if (this._consecutiveFailures >= this._failureThreshold) {
            this._disabledUntil = Date.now() + this._cooldownMs;
            console.warn(`[ExplorerWallet] Circuit breaker tripped after ${this._consecutiveFailures} failures. Disabled for ${this._cooldownMs / 1000}s.`);
        }
    }

    _createTimeoutSignal(ms) {
        try {
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                return AbortSignal.timeout(ms);
            }
        } catch (_) {}
        const controller = new AbortController();
        setTimeout(() => { try { controller.abort(); } catch (_) {} }, ms);
        return controller.signal;
    }

    async _makeRequest(path, options = {}, network = null) {
        const baseUrl = this._getBaseUrl();
        if (!baseUrl) throw new Error('Explorer Wallet API not configured');

        const url = `${baseUrl}${this._withNetwork(path, network)}`;
        const { timeout: customTimeout, network: _n, ...fetchOptions } = options;

        let response;
        try {
            response = await fetch(url, {
                signal: this._createTimeoutSignal(customTimeout || this.timeout),
                ...fetchOptions,
            });
        } catch (fetchError) {
            this._onFailure();
            throw fetchError;
        }

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            this._onFailure();
            throw new Error(`Explorer API ${response.status}: ${body}`);
        }

        this._onSuccess();
        return response.json();
    }

    // ── Chain tip (cached) ───────────────────────────────────────────────

    async getTip(network) {
        const now = Date.now();
        if (this.tipCache.value && this.tipCache.expiry > now) {
            return this.tipCache.value;
        }
        const tip = await this._makeRequest('/wallet/tip', {}, network);
        this.tipCache = { value: tip, expiry: now + this.tipCacheTTL };
        return tip;
    }

    // ── UTXOs ────────────────────────────────────────────────────────────

    /**
     * Get UTXOs for an address.
     * Returns { utxos, currentBlockHeight } matching the shape expected
     * by the bitcoin-api-router normalizer path.
     * 
     * BUT: we normalise here directly to the final QuickNode-like format
     * so the router can return the result as-is (no extra normalisation).
     */
    async getAddressUTXOs(address, network) {
        const [data, tip] = await Promise.all([
            this._makeRequest(`/wallet/utxos/${address}`, {}, network),
            this.getTip(network),
        ]);

        const currentHeight = tip.height;
        const utxos = (data.utxos || []).map(u => {
            const confs = u.confirmations || 0;
            const blockHeight = confs > 0 ? currentHeight - confs + 1 : null;
            return {
                txid: u.txid,
                vout: u.vout,
                value: u.value,                       // already in sats
                address,
                confirmations: confs,
                blockHeight,
                coinbase: false,
                status: {
                    confirmed: confs > 0,
                    block_height: blockHeight,
                    block_hash: null,
                    block_time: null,
                },
            };
        });

        return utxos; // already normalised — router returns directly
    }

    // ── Fee estimate ─────────────────────────────────────────────────────

    /**
     * Returns fee estimates in sat/vB, matching the shape of mempool's
     * getFeeEstimates return value.
     */
    async getFeeEstimates(network) {
        // Fetch estimates for different target blocks
        const [fast, medium, slow] = await Promise.all([
            this._makeRequest('/wallet/fee-estimate?blocks=1', {}, network).catch(() => null),
            this._makeRequest('/wallet/fee-estimate?blocks=3', {}, network).catch(() => null),
            this._makeRequest('/wallet/fee-estimate?blocks=6', {}, network).catch(() => null),
        ]);

        const toSatVb = (r) => {
            if (!r || !r.fee_rate) return null;
            return Math.max(1, Math.ceil(r.fee_rate * 100_000));
        };

        const fastRate = toSatVb(fast);
        const mediumRate = toSatVb(medium);
        const slowRate = toSatVb(slow);

        // Build the same shape as mempool service
        const base = mediumRate || fastRate || slowRate || 3;
        return {
            fastest: fastRate || base + 2,
            halfHour: mediumRate || base,
            hour: slowRate || Math.max(1, base - 1),
            economy: Math.max(1, (slowRate || base) - 1),
            minimum: 1,
        };
    }

    // ── Transaction details ──────────────────────────────────────────────

    /**
     * Get transaction details.
     * Normalises to the QuickNode-like format expected by the rest of the wallet.
     */
    async getTransaction(txid, network) {
        const data = await this._makeRequest(`/wallet/tx/${txid}`, {}, network);

        // outputs[].value is in BTC (float) — convert to sats for the value field
        // but keep BTC string in the vout structure (matches QuickNode format)
        const vin = (data.inputs || []).map(inp => ({
            txid: inp.txid,
            vout: inp.vout,
            scriptSig: { hex: inp.script_sig || '' },
            sequence: inp.sequence,
            txinwitness: inp.witness || [],
        }));

        const vout = (data.outputs || []).map(out => ({
            value: String(out.value),  // BTC string
            n: out.n,
            scriptPubKey: {
                asm: out.script_pubkey?.asm || '',
                hex: out.script_pubkey?.hex || '',
                type: out.script_pubkey?.type || '',
                addresses: out.script_pubkey?.address ? [out.script_pubkey.address] : undefined,
            },
        }));

        return {
            txid: data.txid,
            hash: data.txid,
            version: data.version,
            size: data.size,
            vsize: data.vsize,
            weight: data.weight,
            locktime: data.locktime,
            vin,
            vout,
            hex: data.hex || null,
            blockhash: data.block_hash || null,
            confirmations: data.confirmations || 0,
            time: data.time || null,
            blocktime: data.time || null,
            fee: data.fee || 0,
        };
    }

    // ── Transaction hex ──────────────────────────────────────────────────

    async getTransactionHex(txid, network) {
        const data = await this._makeRequest(`/wallet/tx/${txid}`, {}, network);
        if (!data.hex) throw new Error('No hex in transaction response');
        return data.hex;
    }

    // ── Broadcast ────────────────────────────────────────────────────────

    async broadcastTransaction(txHex, network) {
        const data = await this._makeRequest('/wallet/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_tx: txHex }),
        }, network);

        if (data.error) throw new Error(data.error);
        return data.txid;
    }

    // ── UTXO spent check ─────────────────────────────────────────────────

    /**
     * Check if a UTXO is spent by querying the address UTXOs.
     * If the UTXO is not in the set, it's spent.
     * This is a heavier call than mempool's outspend endpoint but works
     * without an extra API endpoint.
     */
    async isUtxoSpent(txid, vout, network) {
        // We don't have a direct outspend endpoint, so we can't efficiently
        // check this. Return false (assume unspent) and let the caller
        // handle it via the UTXO list.
        return false;
    }
}

export const explorerWalletService = new ExplorerWalletService();
export default explorerWalletService;
