use crate::{
    models::{BroadcastTxRequest, BroadcastTxResponse},
    services::bitcoin_cli,
};
use axum::{response::IntoResponse, Json};

pub async fn sendrawtransactionbroadcast(
    Json(payload): Json<BroadcastTxRequest>,
) -> impl IntoResponse {
    match bitcoin_cli::send_raw_transaction(&payload) {
        Ok(result) => Json::<BroadcastTxResponse>(result).into_response(),
        Err(e) => e.into_response(),
    }
}
