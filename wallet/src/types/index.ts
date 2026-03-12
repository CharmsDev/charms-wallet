// CharmObj — local definition (no charms-js dependency)
export interface CharmObj {
    txid: string;
    outputIndex: number;
    address: string;
    appId: string;
    amount: number;
    displayAmount: string;
    decimals: number;
    type: string;
    name: string;
    ticker: string;
    image: string | null;
    description?: string;
    isBroToken?: boolean;
    metadata?: {
        name: string;
        ticker: string;
        image: string | null;
    };
}

// Define UTXOMap and UTXO types locally
export interface UTXO {
    txid: string;
    vout: number;
    value: number;
    scriptPubKey?: string;
    address?: string;
}

export type UTXOMap = Record<string, UTXO[]>;
