export interface ProcessedCharm {
    uniqueId: string;
    id: string;
    amount: number;
    app: string;
    outputIndex: number;
    txid: string;
    address: string;
    commitTxId?: string | null;
    spellTxId?: string | null;
}

export interface SpellTemplate {
    version: number;
    apps: Record<string, string>;
    ins: Array<{
        utxo_id: string;
        charms: Record<string, number>;
    }>;
    outs: Array<{
        address: string;
        charms: Record<string, number>;
    }>;
}
