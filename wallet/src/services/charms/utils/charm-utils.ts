import { CharmObj } from '@/types';

/**
 * Helper method to determine if a charm is an NFT
 * NFTs have appId starting with "n/"
 */
export function isNFT(charm: CharmObj): boolean {
    if (!charm.appId) return false;
    return charm.appId.startsWith('n/');
}

/**
 * Helper method to determine if a charm is a token
 * Tokens have appId starting with "t/"
 */
export function isToken(charm: CharmObj): boolean {
    if (!charm.appId) return false;
    return charm.appId.startsWith('t/');
}

/**
 * Helper method to get a display name for a charm
 */
export function getCharmDisplayName(charm: CharmObj): string {
    // If the charm has a name or ticker in metadata, use that
    if (charm.metadata?.name) {
        return charm.metadata.name;
    }

    // Otherwise, use the ticker or a fallback
    if (charm.metadata?.ticker) {
        return charm.metadata.ticker;
    }

    // Last resort fallback
    if (isNFT(charm)) {
        return `NFT: ${charm.appId}`;
    } else {
        return `Token: ${charm.appId}`;
    }
}

/**
 * Get amount from a charm UTXO (handles different formats)
 * @param utxo - Charm UTXO object
 * @returns Amount in smallest units
 */
export function getCharmUtxoAmount(utxo: CharmObj | any): number {
    // Handle different amount formats
    if (typeof utxo.amount === 'number') {
        return utxo.amount;
    }
    if (utxo.amount?.remaining !== undefined) {
        return utxo.amount.remaining;
    }
    if (utxo.amount?.value !== undefined) {
        return utxo.amount.value;
    }
    return 0;
}
