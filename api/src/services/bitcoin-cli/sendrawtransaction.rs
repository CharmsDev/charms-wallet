use super::error::{execute_bitcoin_cli, Result};
use crate::error::WalletError;
use crate::models::*;
use bitcoin::consensus::encode::Decodable;
use bitcoin::hashes::hex::FromHex;
use bitcoin::Transaction;
use std::process::Command;

// Broadcast transaction
pub fn send_raw_transaction(request: &BroadcastTxRequest) -> Result<BroadcastTxResponse> {
    // Check for package broadcasting
    if let Some(tx_package) = &request.tx_package {
        if tx_package.len() >= 2 {
            return Err(super::error::BitcoinCliError::Other(
                "Transaction package broadcasting is no longer supported".to_string(),
            ));
        }
    }

    // Validate transaction
    let tx_bytes = Vec::<u8>::from_hex(&request.tx_hex)
        .map_err(|e| super::error::BitcoinCliError::Other(format!("Invalid hex: {}", e)))?;
    let mut cursor = std::io::Cursor::new(tx_bytes);
    let _tx = Transaction::consensus_decode(&mut cursor).map_err(|e| {
        super::error::BitcoinCliError::Other(format!("Deserialization failed: {}", e))
    })?;

    // Send transaction
    let command = format!("bitcoin-cli sendrawtransaction {}", request.tx_hex);

    let args = vec!["sendrawtransaction", &request.tx_hex];
    let output = execute_bitcoin_cli(&args)?;

    // Get transaction ID
    let txid = String::from_utf8_lossy(&output).trim().to_string();
    let response_str = format!("Transaction broadcast successful, txid: {}", txid);

    Ok(BroadcastTxResponse {
        txid,
        command,
        node_response: Some(response_str),
        txids: None,
    })
}
