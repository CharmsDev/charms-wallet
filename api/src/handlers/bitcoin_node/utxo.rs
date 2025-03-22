use crate::models::Utxo;
use crate::services::bitcoin_node::BitcoinNode;
use axum::{extract::Path, response::IntoResponse, Json};

pub async fn get_utxos(Path(address): Path<String>) -> impl IntoResponse {
    let service = BitcoinNode::new();

    match service.list_unspent(Some(&address)).await {
        Ok(utxos) => Json(utxos).into_response(),
        Err(e) => e.into_response(),
    }
}
