use super::client::get_rpc_client;
use crate::error::{WalletError, WalletResult};
use bitcoincore_rpc::RpcApi;

// Get change address
pub fn get_change_address() -> WalletResult<String> {
    let rpc_client = get_rpc_client()?;
    let address = rpc_client
        .get_new_address(None, None)
        .map_err(|e| WalletError::BitcoinError(format!("Failed to get change address: {}", e)))?;

    Ok(address.assume_checked().to_string())
}
