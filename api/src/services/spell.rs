use crate::error::{WalletError, WalletResult};

pub struct SpellProver;

impl SpellProver {
    pub fn new() -> Self {
        Self
    }

    /*
    // Frontend handles proving now
    pub async fn prove_spell(
        &self,
        req: &models::ProveSpellRequest,
    ) -> WalletResult<SpellProofResult> {
        info!(
            "Processing transfer request to: {}",
            req.destination_address
        );

        // Create transactions
        let (commit_tx, spell_tx) = self.create_transaction_pair(req)?;

        // Serialize to hex
        let commit_tx_hex = bitcoin::consensus::encode::serialize_hex(&commit_tx);
        let spell_tx_hex = bitcoin::consensus::encode::serialize_hex(&spell_tx);

        info!("Transfer request processed successfully");

        // Return transaction hex strings
        Ok(SpellProofResult {
            commit_tx: commit_tx_hex,
            spell_tx: spell_tx_hex,
            taproot_script: String::new(),
            control_block: String::new(),
        })
    }

    // Creates transaction pair
    fn create_transaction_pair(
        &self,
        req: &models::ProveSpellRequest,
    ) -> WalletResult<(bitcoin::Transaction, bitcoin::Transaction)> {
        // Parse spell and create transaction
        let spell: charms::spell::Spell = serde_yaml::from_str(&req.spell_json)
            .map_err(|e| WalletError::InvalidSpell(format!("Invalid spell YAML: {}", e)))?;
        let tx = charms::tx::from_spell(&spell);

        // Get inputs from Bitcoin node
        let prev_txs = services::bitcoin_rpc::get_prev_txs(&tx)?;
        let prev_txs_map = charms::tx::txs_by_txid(prev_txs).map_err(|e| {
            WalletError::BitcoinError(format!("Failed to process previous transactions: {}", e))
        })?;

        // Get funding UTXO info
        let funding_utxo = services::bitcoin_rpc::parse_outpoint(&req.funding_utxo_id)?;
        let funding_utxo_value = req.funding_utxo_amount;

        // Get change address
        let change_address = services::bitcoin_rpc::get_change_address()?;

        // Create transaction pair
        debug!("Creating transaction pair with fee rate 2.0 sat/vB");
        let fee_rate = 2.0; // Fixed fee rate

        // Create empty BTreeMap for app_bins
        let app_bins: BTreeMap<charms_data::B32, Vec<u8>> = BTreeMap::new();

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

        // Convert array to tuple
        Ok((txs[0].clone(), txs[1].clone()))
    }
    */
}

pub struct SpellProofResult {
    pub commit_tx: String,
    pub spell_tx: String,
    pub taproot_script: String,
    pub control_block: String,
}
