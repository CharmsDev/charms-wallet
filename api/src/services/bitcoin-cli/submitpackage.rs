use super::error::{execute_bitcoin_cli, Result};
use crate::error::WalletError;
use crate::models::*;
use bitcoin::consensus::encode::Decodable;
use bitcoin::hashes::hex::FromHex;
use bitcoin::Transaction;
use std::process::Command;

// Broadcast transaction package
pub fn submit_package(request: &BroadcastTxRequest) -> Result<BroadcastTxResponse> {
    // Check for package
    if let Some(tx_package) = &request.tx_package {
        if tx_package.is_empty() {
            return Err(super::error::BitcoinCliError::Other(
                "Transaction package is empty".to_string(),
            ));
        }

        // Validate each transaction
        for tx_hex in tx_package {
            let tx_bytes = Vec::<u8>::from_hex(tx_hex)
                .map_err(|e| super::error::BitcoinCliError::Other(format!("Invalid hex: {}", e)))?;
            let mut cursor = std::io::Cursor::new(tx_bytes);
            let _tx = Transaction::consensus_decode(&mut cursor).map_err(|e| {
                super::error::BitcoinCliError::Other(format!("Deserialization failed: {}", e))
            })?;
        }

        // Prepare arguments
        let mut args = vec!["submitpackage"];
        args.extend(tx_package.iter().map(|s| s.as_str()));

        // Execute command
        let output = execute_bitcoin_cli(&args)?;

        // Get transaction ID
        let txid = String::from_utf8_lossy(&output).trim().to_string();

        // Format command
        let command = format!("bitcoin-cli submitpackage {}", tx_package.join(" "));
        let response_str = format!(
            "Transaction package broadcast successful, first txid: {}",
            txid
        );

        Ok(BroadcastTxResponse {
            txid,
            command,
            node_response: Some(response_str),
        })
    } else {
        // Use single transaction
        // Validate transaction
        let tx_bytes = Vec::<u8>::from_hex(&request.tx_hex)
            .map_err(|e| super::error::BitcoinCliError::Other(format!("Invalid hex: {}", e)))?;
        let mut cursor = std::io::Cursor::new(tx_bytes);
        let _tx = Transaction::consensus_decode(&mut cursor).map_err(|e| {
            super::error::BitcoinCliError::Other(format!("Deserialization failed: {}", e))
        })?;

        // Execute command
        let args = vec!["submitpackage", &request.tx_hex];
        let output = execute_bitcoin_cli(&args)?;

        // Get transaction ID
        let txid = String::from_utf8_lossy(&output).trim().to_string();
        let command = format!("bitcoin-cli submitpackage {}", request.tx_hex);
        let response_str = format!("Transaction broadcast successful, txid: {}", txid);

        Ok(BroadcastTxResponse {
            txid,
            command,
            node_response: Some(response_str),
        })
    }
}
