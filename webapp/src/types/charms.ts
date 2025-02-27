export interface CharmAmount {
    ticker: string;
    remaining: number;
}

export interface ProcessedCharm {
    uniqueId: string;
    id: string;
    amount: CharmAmount;
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
    }>;
    outs: Array<{
        charms: Record<string, CharmAmount>;
    }>;
}
