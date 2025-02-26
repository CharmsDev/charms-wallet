export interface UTXO {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
        block_height?: number;
        block_time?: number;
    };
    value: number;
    scriptPubKey?: string;
}
