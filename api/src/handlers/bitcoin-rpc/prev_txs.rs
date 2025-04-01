use axum::{extract::Path, http::StatusCode, Json};
use bitcoin::Txid;
use bitcoincore_rpc::RpcApi;
use serde_json::{json, Value};
use std::str::FromStr;
use tracing::{error, info};

use crate::services::bitcoin_rpc;

/// Get previous transactions for a transaction ID
#[axum::debug_handler]
pub async fn get_prev_txs(
    Path(txid): Path<String>,
) -> Result<Json<Vec<String>>, (StatusCode, Json<Value>)> {
    info!("Getting previous transactions for txid: {}", txid);

    // Parse transaction ID
    let tx_id = match Txid::from_str(&txid) {
        Ok(id) => id,
        Err(e) => {
            error!("Invalid transaction ID: {}", e);
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "status": "error",
                    "message": format!("Invalid transaction ID: {}", e)
                })),
            ));
        }
    };

    // Get RPC client
    let client = match bitcoin_rpc::get_rpc_client() {
        Ok(client) => client,
        Err(e) => {
            error!("Failed to get RPC client: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": "Failed to connect to Bitcoin node"
                })),
            ));
        }
    };

    // Get transaction
    let tx = match client.get_raw_transaction(&tx_id, None) {
        Ok(tx) => tx,
        Err(e) => {
            error!("Transaction not found: {}", e);
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "status": "error",
                    "message": "Transaction not found"
                })),
            ));
        }
    };

    // Get previous transactions
    let prev_txs = match bitcoin_rpc::get_prev_txs(&tx) {
        Ok(txs) => txs,
        Err(e) => {
            error!("Failed to get previous transactions: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": "Failed to get previous transactions"
                })),
            ));
        }
    };

    // Convert to hex strings
    let prev_txs_hex = prev_txs
        .iter()
        .map(|tx| bitcoin::consensus::encode::serialize_hex(tx))
        .collect();

    Ok(Json(prev_txs_hex))
}
