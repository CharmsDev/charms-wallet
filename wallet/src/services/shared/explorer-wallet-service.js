'use client';

import config from '@/config';

// In Chrome extension popup context, fetch() cannot resolve external DNS.
// Route all requests through the background service worker instead.
//
// IMPORTANT: `chrome.runtime.sendMessage` is exposed to regular web pages by
// Chrome (for externally_connectable scenarios), so testing for it gives a
// false positive on wallet.charms.dev and throws:
//   "chrome.runtime.sendMessage() called from a webpage must specify an
//    Extension ID (string) for its first argument"
// `chrome.runtime.id` is only defined inside an actual extension context,
// so it's the canonical extension-context check.
const _isExtensionPopup = typeof chrome !== 'undefined'
    && typeof chrome.runtime?.id === 'string'
    && typeof chrome.runtime?.sendMessage === 'function'
    && typeof window !== 'undefined';

// Build banner intentionally silent — uncomment if extension context detection
// is suspected to misfire again on prod customer consoles.
// if (typeof window !== 'undefined') {
//     console.log(`[ExplorerAPI] build=v1.3.30 ext=${_isExtensionPopup}`);
// }

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
        this.timeout = 30000; // 30s — batch calls with 3000+ UTXOs need time
        this.tipCache = { value: null, expiry: 0 };
        this.tipCacheTTL = 30 * 1000; // 30s TTL for chain tip

        // Persistent 404 cache. Stores `${endpoint}:${txid}` keys for tx
        // lookups that returned 404 (not indexed). Prevents the migration
        // from re-issuing the same failed fetch on future refreshes — the
        // browser DevTools shows every failed network call, so silencing
        // means not making the call at all.
        this._not404Loaded = false;
        this._notIndexed = new Set();

        // Circuit breaker — same as before
        this._consecutiveFailures = 0;
        this._disabledUntil = 0;
        this._failureThreshold = 5;
        this._cooldownMs = 30 * 1000;
    }

    _loadNotIndexed() {
        if (this._not404Loaded) return;
        this._not404Loaded = true;
        try {
            if (typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem('wallet:api:not-indexed');
            const arr = raw ? JSON.parse(raw) : [];
            this._notIndexed = new Set(arr);
        } catch { /* private mode / quota */ }
    }

    _markNotIndexed(key) {
        this._loadNotIndexed();
        if (this._notIndexed.has(key)) return;
        this._notIndexed.add(key);
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem('wallet:api:not-indexed', JSON.stringify([...this._notIndexed]));
        } catch { /* best-effort */ }
    }

    _isNotIndexed(key) {
        this._loadNotIndexed();
        return this._notIndexed.has(key);
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

    _onFailure(context = {}) {
        this._consecutiveFailures++;
        if (this._consecutiveFailures >= this._failureThreshold) {
            this._disabledUntil = Date.now() + this._cooldownMs;
            console.error(`[api] circuit breaker tripped (${this._consecutiveFailures} fails)`);
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
        const method = (options.method || 'GET').toUpperCase();
        const { timeout: customTimeout, network: _n, ...fetchOptions } = options;
        const t0 = performance.now();

        try {
            // In extension popup, route through background service worker (popup can't resolve DNS)
            if (_isExtensionPopup) {
                const data = await _extensionFetch(url, fetchOptions);
                const ms = (performance.now() - t0).toFixed(0);
                console.log(`[api] ✓ ${method} ${path.split('?')[0]} ${ms}ms`);
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
                // 404 is a semantic "not indexed" response — don't trip the breaker.
                const isNotFound = response.status === 404;
                if (!isNotFound) {
                    console.warn(`[api] ✗ ${method} ${path.split('?')[0]} HTTP ${response.status} ${ms}ms`);
                    this._onFailure({ url, method, status: response.status, ms: Number(ms) });
                } else {
                    this._onSuccess();
                }
                const err = new Error(`Explorer API ${response.status}: ${body}`);
                err.status = response.status;
                throw err;
            }

            console.log(`[api] ✓ ${method} ${path.split('?')[0]} ${ms}ms`);
            this._onSuccess();
            return response.json();
        } catch (err) {
            if (err.status === 404) throw err;
            const ms = (performance.now() - t0).toFixed(0);
            const isAbort = err.name === 'AbortError' || /abort/i.test(err.message || '');
            const reason = isAbort ? `timeout` : (err.message || 'error').slice(0, 80);
            console.warn(`[api] ✗ ${method} ${path.split('?')[0]} ${reason} ${ms}ms`);
            this._onFailure({ url, method, reason, ms: Number(ms), errorName: err.name });
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
            block_height: data.block_height || null,
            confirmations: data.confirmations || 0,
            time: data.time || null,
            blocktime: data.time || null,
            fee: data.fee || 0,
            // Also expose in mempool.space-style `status` so downstream code
            // that only reads `tx.status.block_*` keeps working transparently.
            status: {
                confirmed: (data.confirmations || 0) > 0,
                block_height: data.block_height || null,
                block_time: data.time || null,
                block_hash: data.block_hash || null,
            },
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
        try {
            const data = await this._makeRequest('/v1/wallet/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw_tx: txHex }),
            }, network);
            if (data.error) throw new Error(data.error);
            return data.txid;
        } catch (err) {
            // Broadcast rejections are NOT API failures — undo circuit breaker count
            this._consecutiveFailures = Math.max(0, this._consecutiveFailures - 1);
            this._disabledUntil = 0;
            throw err;
        }
    }

    // ── Unified balance batch (UTXOs + charms in one call) ──────────────

    /**
     * Batch fetch unified balance (BTC + UTXOs + charms) for multiple addresses
     * (max 50). Single round trip that subsumes utxos/batch + charms/batch.
     *
     * POST /v1/wallet/balance/batch { addresses, network }
     * Returns { results: { addr: BalanceResponse } } where BalanceResponse is
     * the same shape as GET /v1/wallet/balance/{address}.
     */
    async getBatchBalance(addresses, network) {
        const net = (network || 'mainnet').toString().toLowerCase();
        return this._makeRequest('/v1/wallet/balance/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses, network: net }),
        }, network);
    }

    // ── Transaction history batch ──────────────────────────────────────

    /**
     * Batch fetch tx history for multiple addresses (max 50). Replaces N
     * per-address GETs and inlines `charm.detected` + `assets[]` so the
     * caller skips the per-tx /v1/charms/{txid} round trip (which used to
     * 404 on non-charm txs).
     *
     * POST /v1/wallet/transactions/batch
     *   { addresses, network, since_block?, page_size? }
     *
     * Returns { results: { addr: { transactions, total, last_block } } }.
     * `since_block` enables incremental sync — the caller persists the
     * highest `last_block` seen and passes it on the next call.
     */
    async getBatchTransactions(addresses, network, { sinceBlock = null, pageSize = 100 } = {}) {
        const net = (network || 'mainnet').toString().toLowerCase();
        const body = { addresses, network: net, page_size: pageSize };
        if (sinceBlock != null) body.since_block = sinceBlock;
        return this._makeRequest('/v1/wallet/transactions/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, network);
    }

    // ── UTXO spent check ─────────────────────────────────────────────────

    async isUtxoSpent(txid, vout, network) {
        // Try the Explorer outspend endpoint. If the Explorer doesn't support
        // it (404), throw so mempoolService falls through to mempool.space.
        const resp = await this._makeRequest(
            `/v1/tx/${txid}/outspend/${vout}?network=${network}`,
            { method: 'GET' }
        );
        return resp?.spent === true;
    }

    // ── Fully decoded transaction (vin + vout addresses + sats) ─────────

    /**
     * Returns a transaction in the wallet's canonical shape:
     *
     *   {
     *     txid, block_height, block_time, confirmations, fee,
     *     inputs:  [{ txid, vout, address, value }],   // value in sats
     *     outputs: [{ vout, address, amount, isOpReturn, scriptType }], // amount in sats
     *   }
     *
     * Bitcoin RPC verbose=true (the source of /v1/wallet/tx/{txid}) does NOT
     * include prevout addresses on inputs, so we fetch each parent tx and
     * pick the corresponding output. Parent fetches run in parallel and are
     * deduped by an instance-level cache so a tx with N inputs from the same
     * parent only triggers one fetch.
     */
    async getDecodedTransaction(txid, network) {
        if (!this._txCache) this._txCache = new Map();
        const cacheKey = `${network || 'mainnet'}:${txid}`;
        if (this._txCache.has(cacheKey)) return this._txCache.get(cacheKey);

        const data = await this._makeRequest(`/v1/wallet/tx/${txid}`, {}, network);

        // Explorer wraps tx data in mempool.space (Esplora) shape:
        //   top:    fee, status, txid, version, vin, vout, weight, size, ...
        //   vin[i]: txid, vout, prevout {scriptpubkey_*, value}, scriptsig, witness, ...
        //   vout[i]: scriptpubkey_address, scriptpubkey_type, value (sats), ...
        // Crucially, vin[i].prevout is already populated — no parent fetches.
        // Falls back gracefully to RPC verbose / legacy shapes if the field
        // names differ (defensive).
        const vin  = data?.vin  || data?.inputs  || [];
        const vout = data?.vout || data?.outputs || [];

        const toSats = (v) => {
            if (v == null) return 0;
            const n = typeof v === 'string' ? parseFloat(v) : v;
            if (typeof n !== 'number' || !isFinite(n)) return 0;
            // Esplora returns sats as integer ≥ ~10²; RPC returns BTC as
            // small decimal. Heuristic: large integer = already sats.
            return n >= 1_000_000 && Number.isInteger(n)
                ? n
                : (Number.isInteger(n) && n < 1e6 && n >= 100 ? n : Math.round(n * 1e8));
        };

        const outAddr = (o) => {
            const sp = o?.script_pubkey || o?.scriptPubKey || {};
            return o?.scriptpubkey_address
                || sp.address
                || (Array.isArray(sp.addresses) ? sp.addresses[0] : null)
                || null;
        };
        const outType = (o) => {
            const sp = o?.script_pubkey || o?.scriptPubKey || {};
            return o?.scriptpubkey_type || sp.type || '';
        };

        const outputs = vout.map((o, idx) => {
            const type = outType(o);
            const isOpReturn = type === 'op_return' || type === 'nulldata';
            return {
                vout: o.n ?? idx,
                address: isOpReturn ? null : outAddr(o),
                amount: toSats(o.value),
                isOpReturn,
                scriptType: type,
            };
        });

        // Inputs: use prevout inline (Esplora). If absent (RPC-style), the
        // address will be null and the classifier just won't see it on this
        // input — fine for charm/beam detection which mostly cares about
        // outputs anyway. We DO NOT fetch parent txs (was N+1).
        const inputs = vin.map(inp => {
            if (inp.is_coinbase || inp.coinbase || !inp.txid) {
                return { txid: null, vout: null, address: null, value: 0, coinbase: true };
            }
            const prev = inp.prevout || null;
            return {
                txid: inp.txid,
                vout: inp.vout,
                address: prev ? outAddr(prev) : null,
                value: prev ? toSats(prev.value) : 0,
            };
        });

        const result = {
            txid: data.txid,
            block_height: data?.status?.block_height ?? data.block_height ?? null,
            block_time:   data?.status?.block_time   ?? data.time         ?? null,
            confirmations: data.confirmations ?? 0,
            fee: data.fee ?? 0,
            inputs,
            outputs,
        };
        this._txCache.set(cacheKey, result);
        return result;
    }

    // ── Indexed transaction (with charm metadata) ────────────────────────

    /**
     * Get an indexed tx with inline charm metadata.
     * GET /v1/transactions/{txid}
     * Returns { txid, block_height, status, confirmations, charm: {detected, ...},
     *           assets: [{app_id, name, symbol, amount, asset_type, vout, verified}] }
     * For pure BTC txs: `charm` is null (or absent) and `assets` is omitted.
     */
    async getIndexedTransaction(txid, network) {
        return this._makeRequest(`/v1/transactions/${txid}`, {}, network);
    }
}

export const explorerWalletService = new ExplorerWalletService();
export default explorerWalletService;
