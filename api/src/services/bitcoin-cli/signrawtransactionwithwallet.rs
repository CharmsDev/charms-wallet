use super::error::{execute_bitcoin_cli, Result};
use crate::models::*;
use crate::services::bitcoin_cli;
use bitcoin::consensus::encode::Decodable;
use bitcoin::hashes::hex::FromHex;
use bitcoin::Transaction;

// Sign and broadcast transaction
pub fn sign_and_broadcast_transaction(request: &SendHexTxRequest) -> Result<BroadcastTxResponse> {
    // Validate transaction
    let tx_bytes = Vec::<u8>::from_hex(&request.tx_hex)
        .map_err(|e| super::error::BitcoinCliError::Other(format!("Invalid hex: {}", e)))?;
    let mut cursor = std::io::Cursor::new(tx_bytes);
    let _tx = Transaction::consensus_decode(&mut cursor).map_err(|e| {
        super::error::BitcoinCliError::Other(format!("Deserialization failed: {}", e))
    })?;

    // Sign tx
    let sign_command = format!(
        "bitcoin-cli signrawtransactionwithwallet {}",
        request.tx_hex
    );

    let sign_args = vec!["signrawtransactionwithwallet", &request.tx_hex];
    let sign_output = execute_bitcoin_cli(&sign_args)?;

    // Parse output for signed tx
    let sign_result: serde_json::Value = serde_json::from_slice(&sign_output)
        .map_err(|e| super::error::BitcoinCliError::JsonError(e))?;

    let signed_tx_hex = sign_result["hex"]
        .as_str()
        .ok_or_else(|| {
            super::error::BitcoinCliError::Other("Failed to get signed transaction hex".to_string())
        })?
        .to_string();

    // Broadcast signed tx
    let broadcast_command = format!("bitcoin-cli sendrawtransaction {}", signed_tx_hex);

    // Create broadcast request
    let broadcast_request = BroadcastTxRequest {
        tx_hex: signed_tx_hex.clone(),
        tx_package: None,
    };

    // Send transaction
    let broadcast_result = bitcoin_cli::send_raw_transaction(&broadcast_request)?;

    // Get transaction ID
    let txid = broadcast_result.txid;
    let response_str = format!(
        "Transaction signed and broadcast successfully, txid: {}",
        txid
    );

    Ok(BroadcastTxResponse {
        txid,
        command: format!("{} && {}", sign_command, broadcast_command),
        node_response: Some(response_str),
    })
}
