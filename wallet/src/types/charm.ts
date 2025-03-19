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
    commitTxId: string | null;
    spellTxId: string | null;
}
