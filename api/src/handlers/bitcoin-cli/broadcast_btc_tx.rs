use crate::{
    models::{BroadcastTxRequest, BroadcastTxResponse},
    services::bitcoin_cli,
};
use axum::{response::IntoResponse, Json};

pub async fn broadcast_btc_tx(Json(payload): Json<BroadcastTxRequest>) -> impl IntoResponse {
    // This handler assumes the transaction is already signed
    match bitcoin_cli::send_raw_transaction(&payload) {
        Ok(result) => Json::<BroadcastTxResponse>(result).into_response(),
        Err(e) => e.into_response(),
    }
}
