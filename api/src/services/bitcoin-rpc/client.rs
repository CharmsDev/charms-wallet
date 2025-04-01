use crate::error::{WalletError, WalletResult};
use bitcoincore_rpc::{Auth, Client as RpcClient};
use std::env;

// Create Bitcoin RPC client
pub fn get_rpc_client() -> WalletResult<RpcClient> {
    let host = env::var("BITCOIN_RPC_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = env::var("BITCOIN_RPC_PORT").unwrap_or_else(|_| "48332".to_string());
    let user = env::var("BITCOIN_RPC_USER").unwrap_or_else(|_| "hello".to_string());
    let password = env::var("BITCOIN_RPC_PASSWORD").unwrap_or_else(|_| "world".to_string());

    RpcClient::new(
        &format!("http://{}:{}", host, port),
        Auth::UserPass(user, password),
    )
    .map_err(|e| WalletError::BitcoinError(e.to_string()))
}
