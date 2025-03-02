use crate::error::{WalletError, WalletResult};
use crate::models;
use crate::services;
use bitcoin::consensus::encode;
use charms;
use std::path::PathBuf;
use tracing::{debug, info};

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

        // Step 1: Create the transactions
        let (commit_tx, spell_tx) = self.create_transaction_pair(req)?;

        // Step 2: Extract necessary information for signing
        let (commit_tx_hex, spell_tx_hex, script, control_block) =
            self.extract_signing_data(&commit_tx, &spell_tx, req)?;

        info!("Transfer request processed successfully");

        // Return the complete result
        Ok(SpellProofResult {
            commit_tx: commit_tx_hex,
            spell_tx: spell_tx_hex,
            taproot_script: script,
            control_block,
        })
    }

    /// Creates the commit and spell transaction pair
    fn create_transaction_pair(
        &self,
        req: &models::ProveSpellRequest,
    ) -> WalletResult<(bitcoin::Transaction, bitcoin::Transaction)> {
        // Parse spell and create base transaction
        let spell: charms::spell::Spell = serde_yaml::from_str(&req.spell_json)
            .map_err(|e| WalletError::InvalidSpell(format!("Invalid spell YAML: {}", e)))?;
        let tx = charms::tx::from_spell(&spell);

        // Gather inputs from Bitcoin node
        let prev_txs = services::transaction::get_prev_txs(&tx)?;
        let prev_txs_map = charms::tx::txs_by_txid(prev_txs).map_err(|e| {
            WalletError::BitcoinError(format!("Failed to process previous transactions: {}", e))
        })?;

        // Get funding UTXO information
        let funding_utxo = services::transaction::parse_outpoint(&req.funding_utxo_id)?;
        let funding_utxo_value = services::transaction::get_funding_utxo_value(funding_utxo)?;

        // Get change address for remaining funds
        let change_address = services::transaction::get_change_address()?;

        // Create the transaction pair
        debug!("Creating transaction pair with fee rate 2.0 sat/vB");
        let fee_rate = 2.0; // RJJ-TODO (configurable ?)
        let app_bins: Vec<PathBuf> = vec![];

        let txs = charms::spell::prove_spell_tx(
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

        // Convert the array [Transaction; 2] to a tuple (Transaction, Transaction)
        Ok((txs[0].clone(), txs[1].clone()))
    }

    /// Extracts all necessary data for transaction signing
    fn extract_signing_data(
        &self,
        commit_tx: &bitcoin::Transaction,
        spell_tx: &bitcoin::Transaction,
        req: &models::ProveSpellRequest,
    ) -> WalletResult<(String, String, String, String)> {
        // Serialize transactions to hex
        let commit_tx_hex = encode::serialize_hex(commit_tx);
        let spell_tx_hex = encode::serialize_hex(spell_tx);

        // Get script from spell transaction
        let script = spell_tx.output[0].script_pubkey.to_string();

        // Generate the control block
        let control_block = services::taproot::generate_control_block(
            &commit_tx.output[0].script_pubkey,
            &spell_tx.output[0].script_pubkey,
        )
        .unwrap_or_else(|| {
            // Fallback to the provided public key if available
            req.public_key
                .as_ref()
                .and_then(|pk| {
                    services::taproot::generate_control_block_from_key(
                        pk,
                        &spell_tx.output[0].script_pubkey,
                    )
                })
                .unwrap_or_else(|| {
                    info!("Warning: Failed to generate control block");
                    String::new()
                })
        });

        Ok((commit_tx_hex, spell_tx_hex, script, control_block))
    }
}

pub struct SpellProofResult {
    pub commit_tx: String,
    pub spell_tx: String,
    pub taproot_script: String,
    pub control_block: String,
}
