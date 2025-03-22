use crate::models::Utxo;
use axum::response::{IntoResponse, Response};
use http::StatusCode;
use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BitcoinNodeError {
    #[error("Command execution failed: {0}")]
    CommandError(#[from] std::io::Error),

    #[error("JSON parsing failed: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Other error: {0}")]
    Other(String),
}

impl IntoResponse for BitcoinNodeError {
    fn into_response(self) -> Response {
        let status = match self {
            BitcoinNodeError::CommandError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            BitcoinNodeError::JsonError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            BitcoinNodeError::Other(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = self.to_string();

        (status, body).into_response()
    }
}

type Result<T> = std::result::Result<T, BitcoinNodeError>;

#[derive(Debug, Serialize, Deserialize)]
pub struct BListUnspentItem {
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

pub struct BitcoinNode;

impl BitcoinNode {
    pub fn new() -> Self {
        BitcoinNode
    }

    pub async fn list_unspent(&self, address: Option<&str>) -> Result<Vec<Utxo>> {
        // Use String instead of &str for args to avoid borrowing issues
        let mut args: Vec<String> = vec!["listunspent".to_string(), "0".to_string()];

        // If an address is provided, filter by that address
        if let Some(addr) = address {
            args.push("9999999".to_string()); // max confirmations
                                              // Format the address array as a single argument
            let address_arg = format!("[\"{}\"]", addr);
            args.push(address_arg);
        }

        // Log the command being executed for debugging
        tracing::debug!(
            "Executing bitcoin-cli command: bitcoin-cli {}",
            args.join(" ")
        );

        let b_cli = Command::new("bitcoin-cli")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let output = b_cli.wait_with_output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::error!("bitcoin-cli command failed: {}", stderr);
            return Err(BitcoinNodeError::Other(format!(
                "bitcoin-cli command failed: {}",
                stderr
            )));
        }

        if output.stdout.is_empty() {
            tracing::warn!("bitcoin-cli returned empty output");
            return Ok(Vec::new());
        }
        let b_list_unspent: Vec<BListUnspentItem> = serde_json::from_slice(&output.stdout)?;

        // Convert BListUnspentItem to Utxo
        let utxos = b_list_unspent
            .into_iter()
            .map(|item| {
                // Convert BTC amount (f64) to satoshis (u64)
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
}
