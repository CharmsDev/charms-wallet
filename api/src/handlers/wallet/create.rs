use crate::{
    models::{CreateWalletRequest, KeyPair},
    services::wallet::LocalWallet,
};
use axum::{response::IntoResponse, Json};

pub async fn create_wallet(Json(payload): Json<CreateWalletRequest>) -> impl IntoResponse {
    match LocalWallet::new() {
        Ok(service) => match service.create_wallet(&payload.password).await {
            Ok(result) => Json::<KeyPair>(result).into_response(),
            Err(e) => e.into_response(),
        },
        Err(e) => e.into_response(),
    }
}
