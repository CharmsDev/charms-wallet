// api/src/models/mod.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct KeyPair {
    pub public_key: String,
    pub private_key: String,
    pub address: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct TransactionRequest {}

#[derive(Debug, Serialize)]
pub struct TransactionResponse {
    pub tx_id: String,
    pub fee: u64,
}

#[derive(Debug, Serialize)]
pub struct BalanceResponse {
    pub address: String,
    pub balance: f64,
    pub unconfirmed_balance: f64,
}

#[derive(Debug, Serialize)]
pub struct FeeEstimateResponse {
    pub fast: u64,
    pub medium: u64,
    pub slow: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastTxRequest {
    pub tx_hex: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastTxResponse {
    pub txid: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProveSpellRequest {
    pub spell_json: String,
    pub funding_utxo_id: String,
    pub destination_address: String,
}
