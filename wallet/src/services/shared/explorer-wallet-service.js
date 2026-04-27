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

if (typeof window !== 'undefined') {
    // One-time diagnostic so we can see on customer consoles exactly how the
    // extension-context detection resolved. If `_isExtensionPopup` is `true`
    // on wallet.charms.dev, we have another leak to investigate.
    console.log('[ExplorerAPI] build=v1.3.12 extensionPopup=', _isExtensionPopup,
        'chromeDefined=', typeof chrome !== 'undefined',
        'runtimeId=', typeof chrome !== 'undefined' ? typeof chrome.runtime?.id : 'n/a',
        'sendMessageDefined=', typeof chrome !== 'undefined' ? typeof chrome.runtime?.sendMessage : 'n/a');
}

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

        // Circuit breaker: disable after consecutive failures. Threshold is
        // intentionally generous — a cold start or transient edge hiccup can
        // easily burn through 2 requests, and tripping the breaker sends the
        // user down the mempool.space fallback path (often rate-limited /
        // CORS-blocked). Prefer retrying the primary API.
        this._consecutiveFailures = 0;
        this._disabledUntil = 0;
        this._failureThreshold = 5;     // trips after 5 consecutive failures
        this._cooldownMs = 30 * 1000;   // 30s cooldown before retrying
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
        if (this._consecutiveFailures > 0) {
            console.log(`[${this._ts()}] [ExplorerAPI] recovered — resetting failure counter (was ${this._consecutiveFailures})`);
        }
        this._consecutiveFailures = 0;
    }

    _onFailure(context = {}) {
        this._consecutiveFailures++;
        console.warn(`[${this._ts()}] [ExplorerAPI] failure ${this._consecutiveFailures}/${this._failureThreshold}`, context);
        if (this._consecutiveFailures >= this._failureThreshold) {
            this._disabledUntil = Date.now() + this._cooldownMs;
            console.error(`[${this._ts()}] [ExplorerAPI] ⚠ CIRCUIT BREAKER TRIPPED after ${this._consecutiveFailures} consecutive failures. Falling back to mempool.space for ${this._cooldownMs / 1000}s. Last failure:`, context);
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

        // One-time log so the customer can confirm which API host is in use
        if (!this._loggedBaseUrl) {
            this._loggedBaseUrl = true;
            console.log(`[${this._ts()}] [ExplorerAPI] base URL in use: ${baseUrl}`);
        }

        const fullPath = this._withNetwork(path, network);
        const url = `${baseUrl}${fullPath}`;
        const method = (options.method || 'GET').toUpperCase();
        const { timeout: customTimeout, network: _n, ...fetchOptions } = options;
        const t0 = performance.now();
        console.log(`[${this._ts()}] [ExplorerAPI] → ${method} ${fullPath}`);

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
                const bodySnippet = body ? body.slice(0, 300) : '';
                // 404 is a semantic "not indexed" response (e.g., /v1/charms/{txid}
                // for a tx that isn't a charm) — it does NOT indicate the API is
                // unhealthy. Only 5xx / network errors should trip the breaker.
                const isNotFound = response.status === 404;
                if (!isNotFound) {
                    console.warn(`[${this._ts()}] [ExplorerAPI] ✗ ${method} ${url} — HTTP ${response.status} (${ms}ms)${bodySnippet ? ` body: ${bodySnippet}` : ''}`);
                    this._onFailure({ url, method, status: response.status, ms: Number(ms), body: bodySnippet });
                } else {
                    this._onSuccess();
                }
                const err = new Error(`Explorer API ${response.status}: ${body}`);
                err.status = response.status;
                throw err;
            }

            console.log(`[${this._ts()}] [ExplorerAPI] ✓ ${fullPath} — ${response.status} (${ms}ms)`);
            this._onSuccess();
            return response.json();
        } catch (err) {
            if (err.status === 404) throw err; // already handled above
            const ms = (performance.now() - t0).toFixed(0);
            // Distinguish abort/timeout from network failure for the operator
            const isAbort = err.name === 'AbortError' || /abort/i.test(err.message || '');
            const reason = isAbort ? `timeout (>${customTimeout || this.timeout}ms)` : err.message || String(err);
            console.warn(`[${this._ts()}] [ExplorerAPI] ✗ ${method} ${url} — ${reason} (${ms}ms)`);
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
        const toSats = (v) => typeof v === 'string' ? Math.round(parseFloat(v) * 1e8) : (v || 0);

        const outputs = (data.outputs || []).map(o => {
            const sp = o.script_pubkey || {};
            const type = sp.type || '';
            const isOpReturn = type === 'nulldata' || type === 'op_return';
            return {
                vout: o.n,
                address: isOpReturn ? null : (sp.address || null),
                amount: toSats(o.value),
                isOpReturn,
                scriptType: type,
            };
        });

        // Resolve input prevouts via parent-tx fetches (parallel, deduped).
        const parentTxids = [...new Set((data.inputs || [])
            .filter(i => i.txid && !i.coinbase)
            .map(i => i.txid))];
        const parents = await Promise.all(parentTxids.map(async (parentTxid) => {
            const pkey = `${network || 'mainnet'}:${parentTxid}`;
            if (this._txCache.has(pkey)) return [parentTxid, this._txCache.get(pkey)];
            try {
                const p = await this._makeRequest(`/v1/wallet/tx/${parentTxid}`, {}, network);
                return [parentTxid, p];
            } catch {
                return [parentTxid, null];
            }
        }));
        const parentMap = new Map(parents);

        const inputs = (data.inputs || []).map(inp => {
            if (inp.coinbase || !inp.txid) {
                return { txid: null, vout: null, address: null, value: 0, coinbase: true };
            }
            const parent = parentMap.get(inp.txid);
            const pout = parent?.outputs?.[inp.vout];
            const psp = pout?.script_pubkey || {};
            return {
                txid: inp.txid,
                vout: inp.vout,
                address: psp.address || null,
                value: toSats(pout?.value),
            };
        });

        const result = {
            txid: data.txid,
            block_height: data.block_height ?? null,
            block_time: data.time ?? null,
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
