import { ProcessedCharm } from '@/types';

/**
 * Helper method to determine if a charm is an NFT
 */
export function isNFT(charm: ProcessedCharm): boolean {
    return charm.app && charm.app.type === 'n';
}

/**
 * Helper method to determine if a charm is a token
 */
export function isToken(charm: ProcessedCharm): boolean {
    return charm.app && charm.app.type === 't';
}

/**
 * Helper method to get a display name for a charm
 */
export function getCharmDisplayName(charm: ProcessedCharm): string {
    // If the charm has a name or ticker, use that
    if (charm.amount.name) {
        return charm.amount.name;
    }

    // Otherwise, use the ticker or a fallback
    if (charm.amount.ticker) {
        return charm.amount.ticker;
    }

    // Last resort fallback
    if (isNFT(charm)) {
        return `NFT: ${charm.id}`;
    } else {
        return `Token: ${charm.id}`;
    }
}
