use crate::{
    models::{BroadcastTxRequest, BroadcastTxResponse},
    services::transaction::TransactionBroadcaster,
};
use axum::{response::IntoResponse, Json};

pub async fn broadcast_transaction(Json(payload): Json<BroadcastTxRequest>) -> impl IntoResponse {
    match TransactionBroadcaster::new() {
        Ok(service) => match service.broadcast(&payload) {
            Ok(result) => Json::<BroadcastTxResponse>(result).into_response(),
            Err(e) => e.into_response(),
        },
        Err(e) => e.into_response(),
    }
}
