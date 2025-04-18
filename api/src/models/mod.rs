use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Utxo {
    pub txid: String,
    pub vout: u32,
    pub value: u64,
    pub status: UtxoStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UtxoStatus {
    pub confirmed: bool,
}

#[derive(Debug, Deserialize)]
pub struct TransactionRequest {}

#[derive(Debug, Serialize)]
pub struct TransactionResponse {
    pub tx_id: String,
    pub fee: u64,
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
    pub tx_package: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastTxResponse {
    pub txid: String,
    pub command: String,
    pub node_response: Option<String>,
    pub txids: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendHexTxRequest {
    #[serde(rename = "txHex")]
    pub tx_hex: String,
    pub network: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpellData {
    pub version: u32,
    pub apps: serde_json::Value,
    pub ins: Vec<serde_json::Value>,
    pub outs: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProveSpellRequest {
    pub spell: SpellData,
    pub binaries: serde_json::Value,
    pub prev_txs: Vec<String>,
    pub funding_utxo: String,
    pub funding_utxo_value: u64,
    pub change_address: String,
    pub fee_rate: f64,
}
