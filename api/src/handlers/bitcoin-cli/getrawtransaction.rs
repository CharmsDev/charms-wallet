use crate::services::bitcoin_cli;
use axum::{
    extract::{Path, Query},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Deserialize, Serialize)]
pub struct GetRawTransactionParams {
    verbose: Option<bool>,
}

pub async fn getrawtransaction(
    Path(txid): Path<String>,
    Query(params): Query<GetRawTransactionParams>,
) -> impl IntoResponse {
    let verbose = params.verbose.unwrap_or(true);

    match bitcoin_cli::get_raw_transaction(&txid, verbose).await {
        Ok(tx_info) => Json(json!({
            "status": "success",
            "transaction": tx_info
        }))
        .into_response(),
        Err(e) => Json(json!({
            "status": "error",
            "message": format!("Failed to get raw transaction: {}", e)
        }))
        .into_response(),
    }
}
