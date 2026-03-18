/**
 * Charm Transaction Scanner
 *
 * Legacy scanner removed — charm transaction data now comes from the
 * Charms Explorer indexed API via explorer-wallet-sync.js.
 *
 * This module is kept as a stub so existing imports don't break.
 * scanCharmTransactions is a no-op; callers should be migrated to
 * use the Explorer API transaction history endpoint instead.
 */

export async function scanCharmTransactions() {
    // No-op: charm history is now sourced from /v1/wallet/transactions/{address}
}
