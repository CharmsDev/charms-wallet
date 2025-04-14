use axum::{http::StatusCode, Json};
use serde_json::Value;
use tracing::info;

#[axum::debug_handler]
pub async fn prove_spell(payload: Json<Value>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    info!("Received prove_spell request");

    // Return an empty JSON object with 200 status code
    Ok(Json(serde_json::json!({})))
}
