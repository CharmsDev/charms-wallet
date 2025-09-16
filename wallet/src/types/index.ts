// Re-export CharmObj directly from charms-js library
export type { CharmObj } from 'charms-js';

// Define UTXOMap and UTXO types locally
export interface UTXO {
    txid: string;
    vout: number;
    value: number;
    scriptPubKey?: string;
    address?: string;
}

export type UTXOMap = Record<string, UTXO[]>;
