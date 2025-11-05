/**
 * Payload Generator for Charm Transfers
 * Generates prover API payloads from spell and transfer data
 */

import { PayloadValidator } from './payload-validator.js';
import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';

export class PayloadGenerator {
    constructor() {
        // No template loader needed - we'll use the spell directly from the transfer dialog
    }

    /**
     * Generate payload for charm transfer
     * @param {Object} spellData - The spell object from the transfer dialog
     * @param {Object} fundingUtxo - Funding UTXO object {txid, vout, value, address}
     * @param {string} network - Network (mainnet, testnet, regtest)
     * @param {number} feeRate - Fee rate in sats/vbyte
     * @returns {Promise<Object>} Generated payload
     */
    async generatePayload(spellData, fundingUtxo, network, feeRate = 1) {
        try {
            // Parse spell if it's a string
            let spell;
            if (typeof spellData === 'string') {
                spell = JSON.parse(spellData);
            } else {
                spell = spellData;
            }

            // Fetch previous transactions (charm input transaction)
            const prev_txs = await this._fetchPrevTxs(spell, network);

            // Prepare funding UTXO data
            const fundingUtxoId = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
            const fundingUtxoAmount = fundingUtxo.value;
            const changeAddress = fundingUtxo.address;

            // Map network to chain name
            const chainName = this._getChainName(network);

            // Build payload
            const payload = {
                spell: spell,
                binaries: {}, // Empty for transfers - no WASM needed
                prev_txs: prev_txs,
                funding_utxo: fundingUtxoId,
                funding_utxo_value: fundingUtxoAmount,
                change_address: changeAddress,
                fee_rate: feeRate,
                chain: chainName
            };

            // Validate payload
            PayloadValidator.validatePayload(payload);

            return payload;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Fetch previous transactions needed for the spell
     * @param {Object} spell - The spell object
     * @param {string} network - Network
     * @returns {Promise<Array<string>>} Array of transaction hex strings
     * @private
     */
    async _fetchPrevTxs(spell, network) {
        const prev_txs = [];

        // Find the input that contains a charm
        let txid = null;
        let charmInputFound = false;
        
        if (spell.ins && spell.ins.length > 0) {
            for (const input of spell.ins) {
                if (input.charms && Object.keys(input.charms).length > 0) {
                    // Extract transaction ID
                    if (input.utxo_id) {
                        txid = input.utxo_id.split(':')[0];
                        charmInputFound = true;
                        break;
                    }
                }
            }
        }

        if (!charmInputFound) {
            return prev_txs;
        }

        // Fetch raw transaction data
        try {
            const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
            
            if (txHex) {
                prev_txs.push(txHex);
            }
        } catch (error) {
            // Don't throw - let the prover handle missing prev_txs
        }

        return prev_txs;
    }

    /**
     * Map network to chain name for prover API
     * @param {string} network - Network (mainnet, testnet, regtest)
     * @returns {string} Chain name
     * @private
     */
    _getChainName(network) {
        switch (network) {
            case 'mainnet':
                return 'bitcoin';
            case 'testnet':
            case 'testnet4':
                return 'signet'; // or 'testnet' depending on prover requirements
            case 'regtest':
                return 'regtest';
            default:
                return 'bitcoin';
        }
    }
}
