use axum::{body::Bytes, extract::Json as ExtractJson, http::StatusCode, Json};
use serde_json::Value;
use tracing::{debug, error, info};

use crate::services::spell::SpellProver;

#[axum::debug_handler]
pub async fn prove_spell(body: Bytes) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    info!("Received prove_spell request");

    // Initialize SpellProver service
    let prover = SpellProver::new();

    // Convert request body to string
    let payload_str = match String::from_utf8(body.to_vec()) {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to convert request body to string: {}", e);
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": format!("Failed to parse request body: {}", e)
                })),
            ));
        }
    };

    // Validate JSON payload
    if let Err(e) = serde_json::from_str::<Value>(&payload_str) {
        error!("Invalid JSON payload: {}", e);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!("Invalid JSON payload: {}", e)
            })),
        ));
    }

    // Process spell proof request
    match prover.prove_spell(payload_str).await {
        Ok(response) => {
            // Return success response
            Ok(Json(response))
        }
        Err(err) => {
            // Log error details
            error!("Error proving spell: {}", err);

            // Return error response
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("Failed to prove spell: {}", err)
                })),
            ))
        }
    }
}
