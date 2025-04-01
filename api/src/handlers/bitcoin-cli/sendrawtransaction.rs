use crate::{
    models::{BroadcastTxResponse, SendHexTxRequest},
    services::bitcoin_cli,
};
use axum::{response::IntoResponse, Json};

pub async fn sendrawtransaction(Json(payload): Json<SendHexTxRequest>) -> impl IntoResponse {
    match bitcoin_cli::sign_and_broadcast_transaction(&payload) {
        Ok(result) => Json::<BroadcastTxResponse>(result).into_response(),
        Err(e) => e.into_response(),
    }
}
