use super::error::{execute_bitcoin_cli, Result};
use crate::models::*;
use bitcoin::consensus::encode::Decodable;
use bitcoin::hashes::hex::FromHex;
use bitcoin::Transaction;

// Transaction package broadcasting function
pub fn submit_package(request: &BroadcastTxRequest) -> Result<BroadcastTxResponse> {
    // Get transaction package
    let tx_package = match &request.tx_package {
        Some(package) if !package.is_empty() => package,
        _ => {
            return Err(super::error::BitcoinCliError::Other(
                "Transaction package is empty".to_string(),
            ))
        }
    };

    // Validate transactions
    for tx_hex in tx_package {
        let tx_bytes = Vec::<u8>::from_hex(tx_hex)
            .map_err(|e| super::error::BitcoinCliError::Other(format!("Invalid hex: {}", e)))?;
        let mut cursor = std::io::Cursor::new(tx_bytes);
        let _tx = Transaction::consensus_decode(&mut cursor).map_err(|e| {
            super::error::BitcoinCliError::Other(format!("Deserialization failed: {}", e))
        })?;
    }

    // Prepare JSON array for submitpackage
    let json_array = serde_json::to_string(tx_package)
        .map_err(|e| super::error::BitcoinCliError::JsonError(e))?;

    // Execute bitcoin-cli command
    let args = vec!["submitpackage", &json_array];
    let output = execute_bitcoin_cli(&args)?;

    // Extract transaction ID from output
    let output_str = String::from_utf8_lossy(&output).trim().to_string();

    // Attempt JSON parsing
    let txid = match serde_json::from_str::<serde_json::Value>(&output_str) {
        Ok(json) => json
            .get("txid")
            .and_then(|v| v.as_str())
            .unwrap_or(&output_str)
            .to_string(),
        Err(_) => output_str.clone(),
    };

    // Format display command and response
    let command = format!("bitcoin-cli submitpackage '{}'", json_array);
    let response_str = format!(
        "Transaction package broadcast successful, first txid: {}",
        txid
    );

    // Create response
    Ok(BroadcastTxResponse {
        txid,
        command,
        node_response: Some(response_str),
        txids: Some(tx_package.clone()),
    })
}
