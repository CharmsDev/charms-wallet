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
    dotenv::dotenv().ok();
}

#[tokio::main]
async fn main() {
    load_env();
    tracing_subscriber::fmt::init();

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

    let app = Router::new()
        .route("/health", get(handlers::health_check))
        .route(
            "/bitcoin-cli/wallet/broadcast",
            post(handlers::submitpackagebroadcast),
        )
        .route(
            "/bitcoin-cli/wallet/broadcast_btc_tx",
            post(handlers::broadcast_btc_tx),
        )
        .route(
            "/bitcoin-cli/transaction/send",
            post(handlers::sendrawtransaction),
        )
        .route(
            "/bitcoin-cli/transaction/status/{txid}",
            get(handlers::gettransaction),
        )
        .route(
            "/bitcoin-cli/transaction/raw/{txid}",
            get(handlers::getrawtransaction),
        )
        .route(
            "/bitcoin-cli/transaction/estimate-fee",
            post(handlers::estimatefee),
        )
        .route("/bitcoin-cli/utxos/{address}", get(handlers::listunspent))
        .route("/bitcoin-rpc/prev-txs/{txid}", get(handlers::get_prev_txs))
        .route("/spell/prove", post(handlers::prove_spell))
        .layer(cors);

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
