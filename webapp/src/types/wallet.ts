export interface AddressEntry {
    address: string;
    index: number;
    created: string;
}

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

export class WalletImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WalletImportError';
    }
}
