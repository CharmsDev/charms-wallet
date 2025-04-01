use crate::models::Utxo;
use crate::services::bitcoin_cli;
use axum::{extract::Path, response::IntoResponse, Json};

pub async fn listunspent(Path(address): Path<String>) -> impl IntoResponse {
    match bitcoin_cli::list_unspent(Some(&address)).await {
        Ok(utxos) => Json::<Vec<Utxo>>(utxos).into_response(),
        Err(e) => e.into_response(),
    }
}
