use super::error::{execute_bitcoin_cli, Result};
use serde_json::Value;

pub async fn get_raw_transaction(txid: &str, verbose: bool) -> Result<Value> {
    let verbose_arg = if verbose { "1" } else { "0" };

    let args = vec!["getrawtransaction", txid, verbose_arg];
    let output = execute_bitcoin_cli(&args)?;

    if output.is_empty() {
        return Err(super::error::BitcoinCliError::Other(
            "Empty response from bitcoin-cli".to_string(),
        ));
    }

    let tx_info: Value = serde_json::from_slice(&output)?;
    Ok(tx_info)
}
