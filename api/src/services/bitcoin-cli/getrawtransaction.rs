use crate::services::bitcoin_cli::{BitcoinCliError, Result};
use serde_json::Value;
use std::process::Command;

pub async fn get_raw_transaction(txid: &str, verbose: bool) -> Result<Value> {
    let verbose_arg = if verbose { "1" } else { "0" };

    let output = Command::new("bitcoin-cli")
        .arg("-regtest")
        .arg("getrawtransaction")
        .arg(txid)
        .arg(verbose_arg)
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
