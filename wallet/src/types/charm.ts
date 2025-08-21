export interface CharmAmount {
    ticker: string;
    remaining: number;
    name?: string;
    description?: string;
    image?: string;
    image_hash?: string;
    url?: string;
}

export interface CharmApp {
    type: 'n' | 't';
    id: string;
}

export interface ProcessedCharm {
    uniqueId: string;
    id: string;
    amount: CharmAmount;
    app: CharmApp;
    outputIndex: number;
    txid: string;
    address: string;
    commitTxId: string | null;
    spellTxId: string | null;
}
