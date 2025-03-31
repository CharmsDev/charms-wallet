use crate::models::FeeEstimateResponse;
use axum::{response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct EstimateFeeRequest {
    input_count: Option<u32>,
    output_count: Option<u32>,
    fee_rate: Option<f64>,
}

pub async fn estimatefee(Json(request): Json<EstimateFeeRequest>) -> impl IntoResponse {
    // Set default values
    let input_count = request.input_count.unwrap_or(1);
    let output_count = request.output_count.unwrap_or(2);
    let fee_rate = request.fee_rate.unwrap_or(1.0);

    // Calculate transaction size
    let estimated_size = (input_count * 148) + (output_count * 34) + 10;

    // Calculate fee
    let fee = (estimated_size as f64 * fee_rate) as u64;

    // Generate fee options
    let response = FeeEstimateResponse {
        fast: (fee as f64 * 1.5) as u64,
        medium: fee,
        slow: (fee as f64 * 0.5) as u64,
    };

    Json(json!({
        "status": "success",
        "fee_estimate": response
    }))
    .into_response()
}
