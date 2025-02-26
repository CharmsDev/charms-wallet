export interface Wallet {
    public_key: string;
    private_key: string;
    address: string;
}

export interface BalanceResponse {
    address: string;
    balance: number;
    unconfirmed_balance: number;
}

export interface SignedTransaction {
    hex: string;
    hash: string;
    signature: string;
    txid: string;
}

export interface BroadcastResponse {
    txid: string;
    command: string;
}

export class WalletImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WalletImportError';
    }
}
