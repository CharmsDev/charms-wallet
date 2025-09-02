/**
 * Represents the metadata and quantity of a Charm, particularly for fungible tokens.
 */
export interface CharmAmount {
    /** The ticker symbol for the token (e.g., "BRO"). */
    ticker: string;
    /** The remaining amount of the token. For NFTs, this is typically 1. */
    remaining: number;
    /** The display name of the Charm. */
    name?: string;
    /** A brief description of the Charm. */
    description?: string;
    /** A URL pointing to an image for the Charm. */
    image?: string;
    /** The hash of the image, for verification. */
    image_hash?: string;
    /** A URL for more information about the Charm. */
    url?: string;
    /** The canonical Application ID of the Charm. */
    appId?: string;
}

/**
 * Defines the application type of a Charm.
 */
export interface CharmApp {
    /** The type of the application: 'n' for NFT or 't' for fungible token. */
    type: 'n' | 't';
    /** The identifier for the application. */
    id: string;
}

/**
 * Represents a fully processed Charm object as used within the wallet application.
 * This interface combines data decoded from the blockchain with wallet-specific context.
 */
export interface ProcessedCharm {
    /** A unique identifier for this charm instance within the wallet, typically combining txid, appId, and vout. */
    uniqueId: string;
    /** The canonical ID of the charm, often the same as the appId. */
    id: string;
    /** The canonical Application ID, reconstructed if necessary. */
    appId?: string;
    /** The detailed amount and metadata of the charm. */
    amount: CharmAmount;
    /** The application type information. */
    app: CharmApp;
    /** The output index (vout) of the UTXO that holds this charm. */
    outputIndex: number;
    /** The transaction ID where this charm was created or received. */
    txid: string;
    /** The wallet address that holds this charm. */
    address: string;
    /** The transaction ID of the commit transaction, if applicable. */
    commitTxId: string | null;
    /** The transaction ID of the spell transaction, if applicable. */
    spellTxId: string | null;
}
