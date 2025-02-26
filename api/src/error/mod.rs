// api/src/error/mod.rs
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum WalletError {
    #[error("Bitcoin error: {0}")]
    BitcoinError(String),
    #[error("Invalid address: {0}")]
    InvalidAddress(String),
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Invalid spell: {0}")]
    InvalidSpell(String),
    #[error("Spell error: {0}")]
    SpellError(String),
}

pub type WalletResult<T> = Result<T, WalletError>;

impl IntoResponse for WalletError {
    fn into_response(self) -> Response {
        let (status, err_msg) = match self {
            WalletError::BitcoinError(msg) => (StatusCode::BAD_REQUEST, msg),
            WalletError::InvalidAddress(msg) => (StatusCode::BAD_REQUEST, msg),
            WalletError::NetworkError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            WalletError::InvalidSpell(msg) => (StatusCode::BAD_REQUEST, msg),
            WalletError::SpellError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        let body = Json(json!({
            "error": err_msg
        }));

        (status, body).into_response()
    }
}
