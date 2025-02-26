// api/src/main.rs
mod error;
mod handlers;
mod models;
mod services;

use axum::{
    routing::{get, post},
    Router,
};
use http::{header, Method};
use std::{env, net::SocketAddr, str::FromStr, time::Duration};
use tower_http::cors::{Any, CorsLayer};

fn load_env() {
    let env_file = match env::var("RUST_ENV")
        .unwrap_or_else(|_| "development".to_string())
        .as_str()
    {
        "production" => ".env.production",
        _ => ".env.development",
    };

    dotenv::from_filename(env_file).ok();
}

#[tokio::main]
async fn main() {
    load_env();
    tracing_subscriber::fmt::init();

    tracing::info!("Configuring CORS with permissive settings");
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::ORIGIN,
            header::AUTHORIZATION,
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            header::ACCESS_CONTROL_REQUEST_METHOD,
        ])
        .expose_headers([header::CONTENT_TYPE, header::CONTENT_LENGTH])
        .max_age(Duration::from_secs(3600));

    tracing::info!("CORS configured with specific headers");

    tracing::info!("Setting up routes with CORS logging");
    let app = Router::new()
        .route("/health", get(handlers::health_check))
        .route("/wallet/create", post(handlers::create_wallet))
        .route("/wallet/balance/{address}", get(handlers::get_balance))
        .route("/wallet/broadcast", post(handlers::broadcast_transaction))
        .route(
            "/spell/prove_spell",
            get(|| async {
                tracing::info!("GET /spell/prove_spell");
                "OK"
            })
            .post(handlers::prove_spell)
            .options(|| async {
                tracing::info!("OPTIONS /spell/prove_spell - Preflight request received");
                "OK"
            }),
        )
        .layer(cors);

    tracing::info!("Added all routes with OPTIONS handlers");

    tracing::info!("CORS and routes configured successfully");

    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("PORT").unwrap_or("3333".to_string());
    let port: u16 = port.parse().expect("PORT must be a number");

    let addr = SocketAddr::from_str(&format!("{}:{}", host, port))
        .expect("Failed to create socket address");
    tracing::info!("Listening on {}", addr);
    axum::serve(tokio::net::TcpListener::bind(&addr).await.unwrap(), app)
        .await
        .unwrap();
}
