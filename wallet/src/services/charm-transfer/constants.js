/**
 * Shared constants for the charm-transfer pipeline.
 * Single source of truth for URLs, dust amounts, and limits.
 */

export const SPELL_VERSION = 14;
export const CHARM_DUST = 546;          // sats — relay-safe P2TR dust
export const FALLBACK_FEE_RATE = 3;     // sat/vB — only if API fails
export const MIN_FEE_RATE = 2;          // sat/vB — absolute minimum
export const MAX_CHARM_INPUTS = 16;     // prover limit
export const MIN_FUNDING_SATS = 1000;   // minimum usable funding UTXO

// ── API URLs ─────────────────────────────────────────────────────────────────

export const EXPLORER_API =
    process.env.NEXT_PUBLIC_EXPLORER_WALLET_API_URL || 'https://charms-explorer-api.fly.dev';

export const PROVER_URL_MAINNET =
    process.env.NEXT_PUBLIC_PROVER_MAINNET_URL || 'https://v14.charms.dev/spells/prove';

export const PROVER_URL_TESTNET =
    process.env.NEXT_PUBLIC_PROVER_TESTNET4_URL || 'https://prove-t4.charms.dev';

export const MEMPOOL_MAINNET = 'https://mempool.space/api';
export const MEMPOOL_TESTNET = 'https://mempool.space/testnet4/api';

export function getMempoolBase(network) {
    return network === 'mainnet' ? MEMPOOL_MAINNET : MEMPOOL_TESTNET;
}

/**
 * Get the prover URL. Supports a runtime override via localStorage key
 * `wallet:prover:override` for switching between remote (v14.charms.dev)
 * and local (`charms-prover server` running on port 17784) without restarting.
 *
 * Set via browser console:
 *   localStorage.setItem('wallet:prover:override', 'http://localhost:17784/spells/prove')
 * Clear:
 *   localStorage.removeItem('wallet:prover:override')
 */
export function getProverUrl(network) {
    if (typeof window !== 'undefined') {
        try {
            const override = localStorage.getItem('wallet:prover:override');
            if (override) {
                // Auto-clear stale v12 overrides
                if (override.includes('v12.')) {
                    console.warn('[getProverUrl] Clearing stale v12 override:', override);
                    localStorage.removeItem('wallet:prover:override');
                } else {
                    console.log('[getProverUrl] Override active:', override);
                    return override;
                }
            }
        } catch { /* */ }
    }
    return network === 'mainnet' ? PROVER_URL_MAINNET : PROVER_URL_TESTNET;
}

export function getExplorerNetworkParam(network) {
    return network === 'mainnet' ? 'mainnet' : 'testnet4';
}
