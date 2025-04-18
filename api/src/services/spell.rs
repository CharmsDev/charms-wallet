// RJJ-TMP
use crate::error::{WalletError, WalletResult};
use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tracing::{debug, error, info};

// API endpoint for the external prover service
const PROVER_API_URL: &str = "https://prove-t4.charms.dev/spells/prove";

// Define structs to represent the JSON payload
#[derive(Serialize, Deserialize, Debug)]
struct Charm {
    ticker: String,
    remaining: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct Input {
    utxo_id: String,
    charms: HashMap<String, Charm>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Output {
    address: String,
    charms: HashMap<String, Charm>,
    sats: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct Spell {
    version: u8,
    apps: HashMap<String, String>,
    ins: Vec<Input>,
    outs: Vec<Output>,
}

#[derive(Serialize, Deserialize, Debug)]
struct ProverPayload {
    spell: Spell,
    binaries: HashMap<String, String>,
    prev_txs: Vec<String>,
    funding_utxo: String,
    funding_utxo_value: u64,
    change_address: String,
    fee_rate: u8,
}

pub struct SpellProver;

impl SpellProver {
    pub fn new() -> Self {
        Self
    }

    // Sends a spell proving request to the external prover service
    pub async fn prove_spell(&self, payload_str: String) -> WalletResult<Value> {
        let request_body = payload_str;

        // Make the POST request to the charms prover service
        let client = reqwest::Client::new();
        let response = client
            .post(PROVER_API_URL)
            .header("Content-Type", "application/json")
            .body(request_body)
            .send()
            .await
            .map_err(|e| WalletError::NetworkError(format!("Failed to send request: {}", e)))?;

        // Check status code
        let status = response.status();
        info!("Prover service response status: {}", status);

        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to get error response text".to_string());

            error!("Prover service error response: {}", error_text);
            return Err(WalletError::NetworkError(format!(
                "Prover service returned error status {}: {}",
                status, error_text
            )));
        }

        // Get response text
        let response_text = response.text().await.map_err(|e| {
            error!("Failed to get response text: {}", e);
            WalletError::NetworkError(format!("Failed to get response text: {}", e))
        })?;

        // Log the response text for debugging
        info!("Response text length: {}", response_text.len());
        if response_text.len() <= 1000 {
            info!("Full response text: {}", response_text);
        } else {
            info!("Response text start: {}", &response_text[..500]);
            info!(
                "Response text end: {}",
                &response_text[response_text.len() - 500..]
            );
        }

        // Try to parse as JSON
        let response_json = match serde_json::from_str::<Value>(&response_text) {
            Ok(json) => json,
            Err(e) => {
                error!("Failed to parse response as JSON: {}", e);
                return Err(WalletError::SpellError(format!(
                    "Failed to parse response as JSON: {}",
                    e
                )));
            }
        };

        info!("Prove spell request processed successfully");
        Ok(response_json)
    }
}

pub struct SpellProofResult {
    pub commit_tx: String,
    pub spell_tx: String,
    pub taproot_script: String,
    pub control_block: String,
}
