use crate::{
    models::{BroadcastTxRequest, BroadcastTxResponse},
    services::bitcoin_cli,
};
use axum::{response::IntoResponse, Json};

pub async fn submitpackagebroadcast(Json(payload): Json<BroadcastTxRequest>) -> impl IntoResponse {
    match bitcoin_cli::submit_package(&payload) {
        Ok(result) => Json::<BroadcastTxResponse>(result).into_response(),
        Err(e) => e.into_response(),
    }
}
