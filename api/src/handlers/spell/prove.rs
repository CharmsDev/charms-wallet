use crate::models::ProveSpellRequest;
use crate::services::spell::SpellProver;
use axum::{http::StatusCode, Json};
use serde_json::{json, Value};
use tracing::error;
#[axum::debug_handler]
pub async fn prove_spell(
    Json(req): Json<ProveSpellRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Request validation
    if req.spell_json.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "message": "spell_json is required"
            })),
        ));
    }

    if req.funding_utxo_amount == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "status": "error",
                "message": "funding_utxo_amount must be greater than 0"
            })),
        ));
    }

    // Prove spell
    let prover = SpellProver::new();
    match prover.prove_spell(&req).await {
        Ok(result) => Ok(Json(json!({
            "status": "success",
            "transactions": {
                "commit_tx": result.commit_tx,
                "spell_tx": result.spell_tx,
                "taproot_script": result.taproot_script,
                "control_block": result.control_block
            }
        }))),
        Err(e) => {
            error!("Spell proving failed: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "status": "error",
                    "message": e.to_string()
                })),
            ))
        }
    }
}
