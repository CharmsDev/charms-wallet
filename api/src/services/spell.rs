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

        // Create the transactions
        let (commit_tx, spell_tx) = self.create_transaction_pair(req)?;

        // Serialize transactions to hex
        let commit_tx_hex = bitcoin::consensus::encode::serialize_hex(&commit_tx);
        let spell_tx_hex = bitcoin::consensus::encode::serialize_hex(&spell_tx);

        info!("Transfer request processed successfully");

        // Return the transaction hex strings with empty values for other fields
        Ok(SpellProofResult {
            commit_tx: commit_tx_hex,
            spell_tx: spell_tx_hex,
            taproot_script: String::new(),
            control_block: String::new(),
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
        let funding_utxo_value = req.funding_utxo_amount;

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
}

pub struct SpellProofResult {
    pub commit_tx: String,
    pub spell_tx: String,
    pub taproot_script: String,
    pub control_block: String,
}
