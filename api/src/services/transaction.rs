use crate::error::{WalletError, WalletResult};
use crate::models::*;
use bitcoin::{consensus::encode, hashes::hex::FromHex, OutPoint, Transaction, Txid};
use bitcoincore_rpc::{Auth, Client as RpcClient, RpcApi};
use std::{env, str::FromStr};

fn get_rpc_client() -> WalletResult<RpcClient> {
    let host = env::var("BITCOIN_RPC_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = env::var("BITCOIN_RPC_PORT").unwrap_or_else(|_| "48332".to_string());
    let user = env::var("BITCOIN_RPC_USER").unwrap_or_else(|_| "hello".to_string());
    let password = env::var("BITCOIN_RPC_PASSWORD").unwrap_or_else(|_| "world".to_string());

    RpcClient::new(
        &format!("http://{}:{}", host, port),
        Auth::UserPass(user, password),
    )
    .map_err(|e| WalletError::BitcoinError(e.to_string()))
}

pub fn parse_outpoint(s: &str) -> WalletResult<OutPoint> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err(WalletError::BitcoinError(
            "Invalid UTXO format. Expected txid:vout".to_string(),
        ));
    }

    let txid = Txid::from_str(parts[0])
        .map_err(|e| WalletError::BitcoinError(format!("Invalid txid: {}", e)))?;
    let vout = parts[1]
        .parse::<u32>()
        .map_err(|e| WalletError::BitcoinError(format!("Invalid vout: {}", e)))?;

    Ok(OutPoint::new(txid, vout))
}

// RJJ-TODO do it from teh wallet - clean this
pub fn get_funding_utxo_value(utxo: OutPoint) -> WalletResult<u64> {
    let rpc_client = get_rpc_client()?;
    let tx_out = rpc_client
        .get_tx_out(&utxo.txid, utxo.vout, Some(false))
        .map_err(|e| WalletError::BitcoinError(format!("Failed to get tx_out: {}", e)))?
        .ok_or_else(|| WalletError::BitcoinError("UTXO not found".to_string()))?;

    Ok(tx_out.value.to_sat())
}

pub fn get_change_address() -> WalletResult<String> {
    let rpc_client = get_rpc_client()?;
    let address = rpc_client
        .get_new_address(None, None)
        .map_err(|e| WalletError::BitcoinError(format!("Failed to get change address: {}", e)))?;

    Ok(address.assume_checked().to_string())
}

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

pub struct TransactionBroadcaster {
    rpc_client: RpcClient,
}

impl TransactionBroadcaster {
    pub fn new() -> WalletResult<Self> {
        // Reuse the get_rpc_client function to avoid duplication
        let rpc_client = get_rpc_client()?;
        Ok(Self { rpc_client })
    }

    pub fn broadcast(&self, request: &BroadcastTxRequest) -> WalletResult<BroadcastTxResponse> {
        // Check if we're broadcasting a package or a single transaction
        if let Some(tx_package) = &request.tx_package {
            if tx_package.len() >= 2 {
                // We have a package of transactions to broadcast together
                return self.broadcast_package(tx_package);
            }
        }

        // Single transaction broadcast
        use bitcoin::consensus::encode::Decodable;
        let tx_bytes = Vec::<u8>::from_hex(&request.tx_hex)
            .map_err(|e| WalletError::BitcoinError(format!("Invalid hex: {}", e)))?;
        let mut cursor = std::io::Cursor::new(tx_bytes);
        let tx = Transaction::consensus_decode(&mut cursor)
            .map_err(|e| WalletError::BitcoinError(format!("Deserialization failed: {}", e)))?;

        let txid = self
            .rpc_client
            .send_raw_transaction(&tx)
            .map_err(|e| WalletError::BitcoinError(format!("Broadcast failed: {}", e)))?;

        let command = format!("bitcoin-cli sendrawtransaction {}", request.tx_hex);

        // Create a response string with the transaction ID and status
        let response_str = format!("Transaction broadcast successful, txid: {}", txid);

        Ok(BroadcastTxResponse {
            txid: txid.to_string(),
            command,
            node_response: Some(response_str),
        })
    }

    fn broadcast_package(&self, tx_hexes: &[String]) -> WalletResult<BroadcastTxResponse> {
        // Log the package details
        tracing::info!("Broadcasting package of {} transactions", tx_hexes.len());
        for (i, tx_hex) in tx_hexes.iter().enumerate() {
            tracing::info!(
                "Transaction {}: {} bytes, prefix: {}",
                i + 1,
                tx_hex.len(),
                &tx_hex[..20]
            );
        }

        // Convert all transactions to JSON array format for submitpackage
        let tx_array_json = serde_json::to_string(tx_hexes)
            .map_err(|e| WalletError::BitcoinError(format!("JSON serialization failed: {}", e)))?;

        // Use bitcoin-cli submitpackage command
        let command = format!("bitcoin-cli submitpackage '{}'", tx_array_json);
        tracing::info!("Command: {}", command);

        // Try to use submitpackage RPC call if available
        tracing::info!("Attempting to use submitpackage RPC call");

        // Convert hex strings to Transaction objects
        let mut transactions = Vec::new();
        for (i, tx_hex) in tx_hexes.iter().enumerate() {
            use bitcoin::consensus::encode::Decodable;
            let tx_bytes = Vec::<u8>::from_hex(tx_hex).map_err(|e| {
                tracing::error!("Invalid hex for transaction {}: {}", i + 1, e);
                WalletError::BitcoinError(format!("Invalid hex: {}", e))
            })?;

            let mut cursor = std::io::Cursor::new(tx_bytes);
            let tx = Transaction::consensus_decode(&mut cursor).map_err(|e| {
                tracing::error!("Deserialization failed for transaction {}: {}", i + 1, e);
                WalletError::BitcoinError(format!("Deserialization failed: {}", e))
            })?;

            transactions.push(tx);
        }

        // Try submitpackage RPC call first
        let client = &self.rpc_client;
        let params = [serde_json::Value::Array(
            tx_hexes
                .iter()
                .map(|hex| serde_json::Value::String(hex.clone()))
                .collect(),
        )];

        match client.call::<serde_json::Value>("submitpackage", &params) {
            Ok(result) => {
                tracing::info!(
                    "Package broadcast successful with submitpackage: {:?}",
                    result
                );

                // Extract the result from the RPC call
                tracing::info!("Submitpackage RPC result: {:?}", result);

                // Convert the result to a string for the response
                let result_str = format!("{:?}", result);
                tracing::info!("Result as string: {}", result_str);

                // Try to extract txids from the result if possible
                let mut txids_str = String::new();

                // If the result is an array, it might contain the txids
                if let serde_json::Value::Array(arr) = &result {
                    if !arr.is_empty() {
                        // Try to extract txids from the array
                        let txids: Vec<String> = arr
                            .iter()
                            .filter_map(|v| {
                                if let serde_json::Value::String(s) = v {
                                    Some(s.clone())
                                } else {
                                    None
                                }
                            })
                            .collect();

                        if !txids.is_empty() {
                            txids_str = txids.join(", ");
                            tracing::info!("Extracted txids from result: {}", txids_str);
                        }
                    }
                }

                // If we couldn't extract txids from the result, use the transaction IDs
                if txids_str.is_empty() {
                    let txids: Vec<String> = transactions
                        .iter()
                        .map(|tx| tx.txid().to_string())
                        .collect();

                    txids_str = txids.join(", ");
                    tracing::info!("Using transaction IDs: {}", txids_str);
                }

                return Ok(BroadcastTxResponse {
                    txid: txids_str,
                    command,
                    node_response: Some(result_str),
                });
            }
            Err(e) => {
                tracing::warn!("submitpackage RPC call failed: {}", e);
                tracing::info!("Falling back to sequential transaction broadcasting");

                // Fall back to sequential broadcasting
                let mut last_txid = String::new();
                let mut all_txids = Vec::new();

                for (i, tx) in transactions.iter().enumerate() {
                    tracing::info!("Sending transaction {} to Bitcoin node", i + 1);
                    tracing::info!("Transaction {} ID before broadcast: {}", i + 1, tx.txid());

                    match self.rpc_client.send_raw_transaction(tx) {
                        Ok(txid) => {
                            last_txid = txid.to_string();
                            all_txids.push(txid.to_string());
                            tracing::info!(
                                "Transaction {} broadcast successful, txid: {}",
                                i + 1,
                                last_txid
                            );

                            // Check if the txid matches the transaction's txid
                            if txid.to_string() != tx.txid().to_string() {
                                tracing::warn!(
                                    "Transaction {} ID changed after broadcast: {} -> {}",
                                    i + 1,
                                    tx.txid(),
                                    txid
                                );
                            }
                        }
                        Err(e) => {
                            tracing::error!("Broadcast failed for transaction {}: {}", i + 1, e);
                            return Err(WalletError::BitcoinError(format!(
                                "Broadcast failed: {}",
                                e
                            )));
                        }
                    }
                }

                tracing::info!("Package broadcast completed successfully (sequential fallback)");

                // Join all txids with commas
                let txids_str = all_txids.join(", ");
                tracing::info!("All transaction IDs after broadcast: {}", txids_str);

                // Create a response string with all the transaction IDs and their status
                let response_str = all_txids
                    .iter()
                    .enumerate()
                    .map(|(i, txid)| {
                        format!("Transaction {} broadcast successful, txid: {}", i + 1, txid)
                    })
                    .collect::<Vec<String>>()
                    .join("\n");

                Ok(BroadcastTxResponse {
                    txid: txids_str,
                    command,
                    node_response: Some(response_str),
                })
            }
        }
    }
}
