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

export interface TransferParams {
    amount: number;
    recipientAddress: string;
    privateKey: string;
    sourceAddress: string;
}

export interface TxInput {
    txid: string;
    vout: number;
    value: number;
}

export interface TxOutput {
    address: string;
    value: number;
}

export interface TxDetails {
    inputs: TxInput[];
    outputs: TxOutput[];
    fee: number;
    changeAddress: string;
}

export interface RawTx {
    version: number;
    hex: string;
    inputs: {
        txid: string;
        vout: number;
        sequence: number;
        value: number;
    }[];
    outputs: {
        address: string;
        value: number;
    }[];
}

export interface UnsignedTx {
    details: TxDetails;
    rawTx: RawTx;
    needsConfirmation: true;
}

export interface CommitTxInfo {
    txid: string;
    vout: number;
    scriptPubKey: string;
    amount: number;
    script: string;
    control_block: string;
}

export interface TaprootData {
    script: string;
    control_block: string;
}

export interface SpellTransactionInput {
    txid: string;
    vout: number;
    scriptPubKey: string;
    amount: number;
}

export interface TransferCharmsResponse {
    status: string;
    message: string;
    transactions: {
        commit_tx: string;
        spell_tx: string;
        taproot_data: TaprootData;
    };
}
