use crate::{models::BalanceResponse, services::wallet::ExternalWallet};
use axum::{extract::Path, response::IntoResponse, Json};

pub async fn get_balance(Path(address): Path<String>) -> impl IntoResponse {
    let service = ExternalWallet::new();
    match service.get_balance(&address).await {
        Ok(result) => Json::<BalanceResponse>(result).into_response(),
        Err(e) => e.into_response(),
    }
}
