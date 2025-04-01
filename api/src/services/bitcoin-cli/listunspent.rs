use super::error::{execute_bitcoin_cli, Result};
use crate::models::Utxo;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct BListUnspentItem {
    pub txid: String,
    pub vout: u32,
    pub address: Option<String>,
    pub amount: f64,
    pub confirmations: u32,
    pub spendable: bool,
    pub solvable: bool,
    pub desc: Option<String>,
    pub safe: bool,
}

// List unspent UTXOs
pub async fn list_unspent(address: Option<&str>) -> Result<Vec<Utxo>> {
    // Use String for args
    let mut args: Vec<&str> = vec!["listunspent", "0"];

    // Filter by address if provided
    let address_arg;
    if let Some(addr) = address {
        args.push("9999999"); // max confirmations
                              // Format address array
        address_arg = format!("[\"{}\"]", addr);
        args.push(&address_arg);
    }

    let output = execute_bitcoin_cli(&args)?;

    if output.is_empty() {
        tracing::warn!("bitcoin-cli returned empty output");
        return Ok(Vec::new());
    }

    let b_list_unspent: Vec<BListUnspentItem> = serde_json::from_slice(&output)?;

    // Convert to Utxo format
    let utxos = b_list_unspent
        .into_iter()
        .map(|item| {
            // Convert BTC to satoshis
            let value = (item.amount * 100_000_000.0) as u64;

            Utxo {
                txid: item.txid,
                vout: item.vout,
                value,
                status: crate::models::UtxoStatus {
                    confirmed: item.confirmations > 0,
                },
            }
        })
        .collect();

    Ok(utxos)
}
