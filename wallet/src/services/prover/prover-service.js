/**
 * Prover Service - Main orchestrator for charm transfer proving
 * Combines payload generation and API communication
 */

import { PROVER_CONFIG } from './config.js';
import { ProverApiClient } from './api-client.js';
import { PayloadGenerator } from './payload-generator.js';

export class ProverService {
    constructor() {
        this.payloadGenerator = new PayloadGenerator();
    }

    /**
     * Prove a charm transfer spell
     * @param {Object} spellData - The spell object or JSON string
     * @param {Object} fundingUtxo - Funding UTXO {txid, vout, value, address}
     * @param {string} network - Network (mainnet, testnet, regtest)
     * @param {number} feeRate - Fee rate in sats/vbyte
     * @param {Function} onStatus - Optional status callback for progress updates
     * @returns {Promise<Object>} Result with commit_tx and spell_tx
     */
    async proveTransfer(spellData, fundingUtxo, network, feeRate = 1, onStatus = null) {
        try {
            // Step 1: Generate payload
            if (onStatus) {
                onStatus({ phase: 'generating_payload', message: 'Generating prover payload...' });
            }

            const payload = await this.payloadGenerator.generatePayload(
                spellData,
                fundingUtxo,
                network,
                feeRate
            );

            // Step 2: Get prover API URL for the network
            const proverUrl = PROVER_CONFIG.getApiUrl(network);

            // Step 3: Send to prover API
            if (onStatus) {
                onStatus({ phase: 'sending_to_prover', message: 'Sending to prover API...' });
            }

            const apiClient = new ProverApiClient(proverUrl);
            
            // Create status callback wrapper
            const apiStatusCallback = (status) => {
                if (onStatus) {
                    if (status.phase === 'start') {
                        onStatus({ 
                            phase: 'prover_attempt', 
                            message: `Prover API attempt ${status.attempt}...`,
                            attempt: status.attempt 
                        });
                    } else if (status.phase === 'retrying') {
                        onStatus({ 
                            phase: 'prover_retry', 
                            message: `Retrying prover API (attempt ${status.attempt})...`,
                            attempt: status.attempt,
                            nextDelayMs: status.nextDelayMs
                        });
                    } else if (status.phase === 'success') {
                        onStatus({ 
                            phase: 'prover_success', 
                            message: `Prover API succeeded on attempt ${status.attempt}`,
                            attempt: status.attempt 
                        });
                    }
                }
            };

            const response = await apiClient.sendToProver(payload, apiStatusCallback);

            // Step 4: Extract transactions
            if (!Array.isArray(response) || response.length < 2) {
                throw new Error('Invalid prover response: expected array with at least 2 transactions');
            }

            const [commit_tx, spell_tx] = response;

            if (onStatus) {
                onStatus({ phase: 'complete', message: 'Proving complete!' });
            }

            return {
                status: 'success',
                message: 'Transactions received from prover',
                transactions: {
                    commit_tx,
                    spell_tx
                }
            };

        } catch (error) {
            if (onStatus) {
                onStatus({ 
                    phase: 'error', 
                    message: `Proving failed: ${error.message}`,
                    error: error
                });
            }

            throw error;
        }
    }
}

// Export singleton instance
export const proverService = new ProverService();
export default proverService;
