use super::client::get_rpc_client;
use crate::error::{WalletError, WalletResult};
use bitcoin::Transaction;
use bitcoincore_rpc::RpcApi;

// Get previous transactions
pub fn get_prev_txs(tx: &Transaction) -> WalletResult<Vec<Transaction>> {
    let rpc_client = get_rpc_client()?;
    let mut prev_txs = Vec::new();

    for input in &tx.input {
        let raw_tx = rpc_client
            .get_raw_transaction(&input.previous_output.txid, None)
            .map_err(|e| {
                WalletError::BitcoinError(format!("Failed to get raw transaction: {}", e))
            })?;
        prev_txs.push(raw_tx);
    }

    Ok(prev_txs)
}
