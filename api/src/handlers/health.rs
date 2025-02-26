use crate::services::health::HealthChecker;
use axum::response::IntoResponse;

pub async fn health_check() -> impl IntoResponse {
    let health_checker = HealthChecker::new();
    if health_checker.check() {
        "OK"
    } else {
        "Service Unavailable"
    }
}
