use crate::services::bitcoin_cli::{BitcoinCliError, Result};
use serde_json::Value;
use std::process::Command;

pub async fn get_transaction(txid: &str) -> Result<Value> {
    let output = Command::new("bitcoin-cli")
        .arg("-regtest")
        .arg("gettransaction")
        .arg(txid)
        .output()
        .map_err(|e| BitcoinCliError::Other(format!("Failed to execute command: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(BitcoinCliError::Other(format!(
            "Command failed: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let tx_info: Value =
        serde_json::from_str(&stdout).map_err(|e| BitcoinCliError::JsonError(e))?;

    Ok(tx_info)
}
