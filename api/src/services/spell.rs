use crate::error::{WalletError, WalletResult};
use crate::models;
use crate::services;
use bitcoin::consensus::encode;
use charms;
use std::path::PathBuf;
use tracing::info;

pub struct SpellProver;

impl SpellProver {
    pub fn new() -> Self {
        Self
    }

    pub async fn prove_spell(
        &self,
        req: &models::ProveSpellRequest,
    ) -> WalletResult<SpellProofResult> {
        info!(
            "Processing transfer request to: {}",
            req.destination_address
        );

        // Parse and validate spell using the Spell struct
        let spell: charms::spell::Spell = serde_yaml::from_str(&req.spell_json)
            .map_err(|e| WalletError::InvalidSpell(format!("Invalid spell YAML: {}", e)))?;

        // Create the spell tx
        let tx = charms::tx::from_spell(&spell);

        // Get previous transactions
        let prev_txs = services::transaction::get_prev_txs(&tx)?;

        let prev_txs_map = charms::tx::txs_by_txid(prev_txs).map_err(|e| {
            WalletError::BitcoinError(format!("Failed to process previous transactions: {}", e))
        })?;

        // Get funding utxo and value
        let funding_utxo = services::transaction::parse_outpoint(&req.funding_utxo_id)?;
        let funding_utxo_value = services::transaction::get_funding_utxo_value(funding_utxo)?;

        // Get change address
        let change_address = services::transaction::get_change_address()?;

        // Create transactions using prove_spell_tx
        let app_bins: Vec<PathBuf> = vec![];
        let fee_rate = 2.0; // fee rate in sat/vB

        let [commit_tx, spell_tx] = charms::spell::prove_spell_tx(
            spell,
            tx,
            app_bins,
            prev_txs_map,
            funding_utxo,
            funding_utxo_value,
            change_address,
            fee_rate,
        )
        .map_err(|e| WalletError::SpellError(format!("Failed to create transactions: {}", e)))?;

        // Serialize transactions
        let commit_tx_hex = encode::serialize_hex(&commit_tx);
        let spell_tx_hex = encode::serialize_hex(&spell_tx);

        // Get taproot data from the first output of spell tx
        let script = spell_tx.output[0].script_pubkey.to_string();

        info!("Transfer request processed successfully");

        Ok(SpellProofResult {
            commit_tx: commit_tx_hex,
            spell_tx: spell_tx_hex,
            taproot_script: script,
        })
    }
}

pub struct SpellProofResult {
    pub commit_tx: String,
    pub spell_tx: String,
    pub taproot_script: String,
}
