import { CharmObj } from '@/types';

/**
 * Helper method to determine if a charm is an NFT
 */
export function isNFT(charm: CharmObj): boolean {
    return charm.app && charm.app.type === 'n';
}

/**
 * Helper method to determine if a charm is a token
 */
export function isToken(charm: CharmObj): boolean {
    return charm.app && charm.app.type === 't';
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
