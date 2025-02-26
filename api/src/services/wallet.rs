use crate::error::{WalletError, WalletResult};
use crate::models::*;
use bitcoin::key::CompressedPublicKey;
use bitcoin::secp256k1::{Secp256k1, SecretKey};
use bitcoin::Address;
use bitcoin::{Network, PrivateKey};
use bitcoincore_rpc::{Auth, Client as RpcClient, RpcApi};
use rand::thread_rng;
use reqwest::Client;
use serde_json::Value;
use std::{env, str::FromStr};

pub struct LocalWallet {
    network: Network,
    secp: Secp256k1<bitcoin::secp256k1::All>,
}

pub struct ExternalWallet {
    network: Network,
    client: Client,
}

impl LocalWallet {
    pub fn new() -> WalletResult<Self> {
        Ok(Self {
            network: Network::Testnet,
            secp: Secp256k1::new(),
        })
    }

    pub async fn create_wallet(&self, password: &str) -> WalletResult<KeyPair> {
        let wallet_name = format!("wallet_{}", password);

        let host = env::var("BITCOIN_RPC_HOST").unwrap_or_else(|_| "localhost".to_string());
        let port = env::var("BITCOIN_RPC_PORT").unwrap_or_else(|_| "18332".to_string());
        let user = env::var("BITCOIN_RPC_USER").unwrap_or_else(|_| "hello".to_string());
        let password = env::var("BITCOIN_RPC_PASSWORD").unwrap_or_else(|_| "world".to_string());

        let rpc_client = RpcClient::new(
            &format!("http://{}:{}/wallet/{}", host, port, wallet_name),
            Auth::UserPass(user, password),
        )
        .map_err(|e| WalletError::BitcoinError(e.to_string()))?;

        match rpc_client.create_wallet(&wallet_name, None, None, None, None) {
            Ok(_) => (),
            Err(e) => {
                if !e.to_string().contains("Database already exists") {
                    return Err(WalletError::BitcoinError(e.to_string()));
                }
            }
        }

        let secret_key = SecretKey::new(&mut thread_rng());
        let private_key = PrivateKey::new(secret_key, self.network);
        let compressed_pub_key = CompressedPublicKey::from_private_key(&self.secp, &private_key)
            .map_err(|e| WalletError::BitcoinError(e.to_string()))?;

        let address = bitcoin::Address::p2wpkh(&compressed_pub_key, self.network);

        Ok(KeyPair {
            private_key: private_key.to_string(),
            public_key: compressed_pub_key.to_string(),
            address: address.to_string(),
        })
    }
}

impl ExternalWallet {
    pub fn new() -> Self {
        Self {
            network: Network::Testnet,
            client: Client::new(),
        }
    }

    pub async fn get_balance(&self, address: &str) -> WalletResult<BalanceResponse> {
        tracing::info!("Getting balance for address: {}", address);

        let addr =
            Address::from_str(address).map_err(|e| WalletError::InvalidAddress(e.to_string()))?;

        addr.require_network(self.network)
            .map_err(|_| WalletError::InvalidAddress("Not a testnet4 address".to_string()))?;

        let utxo_url = format!(
            "https://mempool.space/testnet4/api/address/{}/utxo",
            address
        );
        tracing::info!("Fetching UTXOs from: {}", utxo_url);

        let response = self
            .client
            .get(&utxo_url)
            .send()
            .await
            .map_err(|e| WalletError::NetworkError(e.to_string()))?;

        let response_text = response
            .text()
            .await
            .map_err(|e| WalletError::NetworkError(e.to_string()))?;

        let utxos: Vec<Value> = serde_json::from_str(&response_text)
            .map_err(|e| WalletError::NetworkError(e.to_string()))?;

        let (confirmed_balance, unconfirmed_balance) =
            utxos.iter().fold((0u64, 0u64), |(cb, ub), utxo| {
                if let Some(value) = utxo["value"].as_u64() {
                    if utxo["status"]
                        .get("confirmed")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        (cb + value, ub)
                    } else {
                        (cb, ub + value)
                    }
                } else {
                    (cb, ub)
                }
            });

        Ok(BalanceResponse {
            address: address.to_string(),
            balance: (confirmed_balance as f64) / 100_000_000.0,
            unconfirmed_balance: (unconfirmed_balance as f64) / 100_000_000.0,
        })
    }
}
