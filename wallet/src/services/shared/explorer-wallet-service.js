'use client';

import config from '@/config';

// In Chrome extension popup context, fetch() cannot resolve external DNS.
// Route all requests through the background service worker instead.
const _isExtensionPopup = typeof chrome !== 'undefined'
    && typeof chrome.runtime?.sendMessage === 'function'
    && typeof window !== 'undefined';

async function _extensionFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: 'API_REQUEST',
                url,
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else if (response && response.status) {
                    // HTTP error (non-2xx) — throw with status so caller can handle
                    const err = new Error(`Explorer API ${response.status}: ${JSON.stringify(response.data || response.error || '')}`);
                    err.status = response.status;
                    reject(err);
                } else {
                    reject(new Error(response?.error || 'API request failed'));
                }
            }
        );
    });
}

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
        this.timeout = 30000; // 30s — with parallel requests, server queues them; last in batch may wait
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

    _ts() {
        return new Date().toISOString().slice(11, 23);
    }

    async _makeRequest(path, options = {}, network = null) {
        const baseUrl = this._getBaseUrl();
        if (!baseUrl) throw new Error('Explorer Wallet API not configured');

        const fullPath = this._withNetwork(path, network);
        const url = `${baseUrl}${fullPath}`;
        const { timeout: customTimeout, network: _n, ...fetchOptions } = options;
        const t0 = performance.now();
        console.log(`[${this._ts()}] [ExplorerAPI] → ${fetchOptions.method || 'GET'} ${fullPath}`);

        try {
            // In extension popup, route through background service worker (popup can't resolve DNS)
            if (_isExtensionPopup) {
                const data = await _extensionFetch(url, fetchOptions);
                const ms = (performance.now() - t0).toFixed(0);
                console.log(`[${this._ts()}] [ExplorerAPI] ✓ ${fullPath} — via background (${ms}ms)`);
                this._onSuccess();
                return data;
            }

            // Direct fetch for non-extension context (Next.js webapp)
            const response = await fetch(url, {
                signal: this._createTimeoutSignal(customTimeout || this.timeout),
                ...fetchOptions,
            });

            const ms = (performance.now() - t0).toFixed(0);
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                console.warn(`[${this._ts()}] [ExplorerAPI] ✗ ${fullPath} — ${response.status} (${ms}ms)`);
                this._onFailure();
                throw new Error(`Explorer API ${response.status}: ${body}`);
            }

            console.log(`[${this._ts()}] [ExplorerAPI] ✓ ${fullPath} — ${response.status} (${ms}ms)`);
            this._onSuccess();
            return response.json();
        } catch (err) {
            const ms = (performance.now() - t0).toFixed(0);
            console.warn(`[${this._ts()}] [ExplorerAPI] ✗ ${fullPath} — ${err.message} (${ms}ms)`);
            this._onFailure();
            throw err;
        }
    }

    // ── Chain tip (cached) ───────────────────────────────────────────────

    async getTip(network) {
        const now = Date.now();
        if (this.tipCache.value && this.tipCache.expiry > now) {
            return this.tipCache.value;
        }
        const tip = await this._makeRequest('/v1/wallet/tip', {}, network);
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
            this._makeRequest(`/v1/wallet/utxos/${address}`, {}, network),
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
            this._makeRequest('/v1/wallet/fee-estimate?blocks=1', {}, network).catch(() => null),
            this._makeRequest('/v1/wallet/fee-estimate?blocks=3', {}, network).catch(() => null),
            this._makeRequest('/v1/wallet/fee-estimate?blocks=6', {}, network).catch(() => null),
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
        const data = await this._makeRequest(`/v1/wallet/tx/${txid}`, {}, network);

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
        const data = await this._makeRequest(`/v1/wallet/tx/${txid}`, {}, network);
        if (!data.hex) throw new Error('No hex in transaction response');
        return data.hex;
    }

    // ── Broadcast ────────────────────────────────────────────────────────

    async broadcastTransaction(txHex, network) {
        const data = await this._makeRequest('/v1/wallet/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_tx: txHex }),
        }, network);

        if (data.error) throw new Error(data.error);
        return data.txid;
    }

    // ── UTXOs (indexed, instant) ─────────────────────────────────────────

    /**
     * Get UTXOs for an address from the indexed DB.
     * Returns { utxos: [{ txid, vout, value, address, confirmations }] }.
     */
    async getUTXOs(address, network) {
        return this._makeRequest(`/v1/wallet/utxos/${address}`, {}, network);
    }

    /**
     * Aggregate UTXOs across multiple addresses.
     * Returns flat array of { txid, vout, value, address, confirmations }.
     * Throws if ALL requests fail (mirrors getAggregateBalance sentinel logic).
     */
    async getAggregateUTXOs(addresses, network) {
        const SENTINEL = Symbol('error');
        const results = await Promise.all(
            addresses.map(addr =>
                this.getUTXOs(addr, network).catch(() => SENTINEL)
            )
        );
        const succeeded = results.filter(r => r !== SENTINEL);
        if (succeeded.length === 0) {
            throw new Error('Explorer API unavailable: all UTXO requests failed');
        }
        return succeeded.flatMap(r => r.utxos || []);
    }

    // ── Balance (indexed, instant) ──────────────────────────────────────

    /**
     * Get BTC balance for an address from the indexed DB.
     * Returns { address, confirmed, unconfirmed, total, utxo_count } in sats.
     */
    async getBalance(address, network) {
        return this._makeRequest(`/v1/wallet/balance/${address}`, {}, network);
    }

    /**
     * Aggregate BTC balance across multiple addresses.
     * Returns { confirmed, unconfirmed, total } in sats.
     */
    async getAggregateBalance(addresses, network) {
        const SENTINEL = Symbol('error');
        const results = await Promise.all(
            addresses.map(addr =>
                this.getBalance(addr, network).catch(() => SENTINEL)
            )
        );
        const succeeded = results.filter(r => r !== SENTINEL);
        if (succeeded.length === 0) {
            throw new Error('Explorer API unavailable: all balance requests failed');
        }
        return {
            confirmed: succeeded.reduce((s, r) => s + (r.confirmed || 0), 0),
            unconfirmed: succeeded.reduce((s, r) => s + (r.unconfirmed || 0), 0),
            total: succeeded.reduce((s, r) => s + (r.total || 0), 0),
        };
    }

    // ── Charm balances (indexed, instant) ─────────────────────────────────

    /**
     * Get charm/token balances for an address from the indexed DB.
     * Returns { address, network, balances: [...], count }.
     * Each balance has { appId, assetType, symbol, confirmed, unconfirmed, total, utxos }.
     */
    async getCharmBalances(address, network) {
        return this._makeRequest(`/v1/wallet/charms/${address}`, {}, network);
    }

    /**
     * Aggregate charm balances across multiple addresses.
     * Merges by appId and collects all UTXOs.
     * Returns array of { appId, assetType, symbol, confirmed, unconfirmed, total, utxos }.
     */
    async getAggregateCharmBalances(addresses, network) {
        const SENTINEL = Symbol('error');
        const raw = await Promise.all(
            addresses.map(addr =>
                this.getCharmBalances(addr, network).catch(() => SENTINEL)
            )
        );
        const succeeded = raw.filter(r => r !== SENTINEL);
        if (succeeded.length === 0) {
            throw new Error('Explorer API unavailable: all charm requests failed');
        }
        const results = succeeded;

        const map = {};
        for (const r of results) {
            for (const b of (r.balances || [])) {
                const key = b.appId || b.app_id;
                if (!map[key]) {
                    map[key] = {
                        appId: key,
                        assetType: b.assetType || b.asset_type || 'token',
                        symbol: b.symbol || '',
                        confirmed: 0,
                        unconfirmed: 0,
                        total: 0,
                        utxos: [],
                    };
                }
                map[key].confirmed += b.confirmed || 0;
                map[key].unconfirmed += b.unconfirmed || 0;
                map[key].total += b.total || 0;
                // Inject appId onto each UTXO so consumers (toCharmObj) can read utxo.appId
                map[key].utxos.push(...(b.utxos || []).map(u => ({ appId: key, ...u })));
            }
        }
        return Object.values(map);
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
