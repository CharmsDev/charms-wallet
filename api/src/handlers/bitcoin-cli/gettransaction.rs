use crate::services::bitcoin_cli;
use axum::{extract::Path, response::IntoResponse, Json};
use serde_json::json;

pub async fn gettransaction(Path(txid): Path<String>) -> impl IntoResponse {
    match bitcoin_cli::get_transaction(&txid).await {
        Ok(tx_info) => Json(json!({
            "status": "success",
            "transaction": tx_info
        }))
        .into_response(),
        Err(e) => Json(json!({
            "status": "error",
            "message": format!("Failed to get transaction: {}", e)
        }))
        .into_response(),
    }
}
