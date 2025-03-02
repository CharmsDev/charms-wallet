use crate::error::{WalletError, WalletResult};
use crate::models::*;
use bitcoin::{consensus::encode, hashes::hex::FromHex, OutPoint, Transaction, Txid};
use bitcoincore_rpc::{Auth, Client as RpcClient, RpcApi};
use std::{env, str::FromStr};

fn get_rpc_client() -> WalletResult<RpcClient> {
    let host = env::var("BITCOIN_RPC_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = env::var("BITCOIN_RPC_PORT").unwrap_or_else(|_| "18332".to_string());
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

pub fn get_prev_txs(tx: &Transaction) -> WalletResult<Vec<String>> {
    let rpc_client = get_rpc_client()?;
    let mut prev_txs = Vec::new();

    for input in &tx.input {
        let raw_tx = rpc_client
            .get_raw_transaction(&input.previous_output.txid, None)
            .map_err(|e| {
                WalletError::BitcoinError(format!("Failed to get raw transaction: {}", e))
            })?;
        prev_txs.push(encode::serialize_hex(&raw_tx));
    }

    Ok(prev_txs)
}

pub struct TransactionBroadcaster {
    rpc_client: RpcClient,
}

// RJJ-TODO get url from .env
impl TransactionBroadcaster {
    pub fn new() -> WalletResult<Self> {
        let rpc_client = RpcClient::new(
            "http://localhost:48332",
            Auth::UserPass("hello".into(), "world".into()),
        )
        .map_err(|e| WalletError::BitcoinError(format!("RPC client creation failed: {}", e)))?;

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

        Ok(BroadcastTxResponse {
            txid: txid.to_string(),
            command,
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

        // RJJ-TODO testing mode | sending sequentially : switch to sendpackage
        let mut last_txid = String::new();

        for (i, tx_hex) in tx_hexes.iter().enumerate() {
            tracing::info!("Broadcasting transaction {} of {}", i + 1, tx_hexes.len());

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

            tracing::info!("Sending transaction {} to Bitcoin node", i + 1);
            match self.rpc_client.send_raw_transaction(&tx) {
                Ok(txid) => {
                    last_txid = txid.to_string();
                    tracing::info!(
                        "Transaction {} broadcast successful, txid: {}",
                        i + 1,
                        last_txid
                    );
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

        tracing::info!("Package broadcast completed successfully");
        Ok(BroadcastTxResponse {
            txid: last_txid,
            command,
        })
    }
}
