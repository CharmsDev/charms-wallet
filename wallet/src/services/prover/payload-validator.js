/**
 * Payload Validator Module
 * Handles validation of payload structure and content for charm transfers
 */

export class PayloadValidator {
    /**
     * Validate payload structure
     * @param {Object} payload - The payload to validate
     * @throws {Error} If validation fails
     */
    static validatePayload(payload) {
        const requiredFields = [
            'spell',
            'binaries'
        ];

        for (const field of requiredFields) {
            if (!payload.hasOwnProperty(field)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Validate spell structure
        PayloadValidator._validateSpellStructure(payload.spell);

        // Validate required private inputs (if any)
        if (payload.spell.private_inputs) {
            PayloadValidator._validatePrivateInputs(payload.spell.private_inputs);
        }

        // prev_txs optional; if present, validate format
        PayloadValidator._validatePrevTxs(payload.prev_txs);

        // Validate data types
        PayloadValidator._validateDataTypes(payload);

        // Basic format checks
        PayloadValidator._validateFormats(payload);
    }

    /**
     * Validate spell structure
     * @private
     */
    static _validateSpellStructure(spell) {
        if (!spell.version) {
            throw new Error('Missing spell.version');
        }
        if (!spell.apps || Object.keys(spell.apps).length === 0) {
            throw new Error('Missing or empty spell.apps');
        }
        if (!spell.ins || spell.ins.length === 0) {
            throw new Error('Missing or empty spell.ins');
        }
        if (!spell.outs || spell.outs.length === 0) {
            throw new Error('Missing or empty spell.outs');
        }
    }

    /**
     * Validate private inputs
     * @private
     */
    static _validatePrivateInputs(privateInputs) {
        // For transfers, private inputs may be optional or different structure
        // Validate based on what's present
        for (const key in privateInputs) {
            const pi = privateInputs[key];
            if (pi.tx) {
                const hexRe = /^[0-9a-fA-F]+$/;
                if (!hexRe.test(pi.tx)) {
                    throw new Error(`Invalid tx hex in private inputs[${key}]`);
                }
            }
            if (pi.tx_block_proof) {
                const hexRe = /^[0-9a-fA-F]+$/;
                if (!hexRe.test(pi.tx_block_proof)) {
                    throw new Error(`Invalid tx_block_proof in private inputs[${key}]`);
                }
            }
        }
    }

    /**
     * Validate prev_txs field
     * @private
     */
    static _validatePrevTxs(prevTxs) {
        if (prevTxs !== undefined) {
            if (!Array.isArray(prevTxs) || prevTxs.length === 0) {
                throw new Error('prev_txs must include at least one parent transaction hex when provided');
            }
            const hexRe = /^[0-9a-fA-F]+$/;
            if (!hexRe.test(prevTxs[0])) {
                throw new Error('prev_txs[0] must be hex');
            }
        }
    }

    /**
     * Validate data types
     * @private
     */
    static _validateDataTypes(payload) {
        if (typeof payload.spell.version !== 'number') {
            throw new Error('spell.version must be a number');
        }
        if (payload.funding_utxo_value !== undefined) {
            if (typeof payload.funding_utxo_value !== 'number' || !(payload.funding_utxo_value > 0)) {
                throw new Error('funding_utxo_value must be a positive number when provided');
            }
        }
        if (payload.fee_rate !== undefined && typeof payload.fee_rate !== 'number') {
            throw new Error('fee_rate must be a number when provided');
        }
        if (payload.chain !== undefined && typeof payload.chain !== 'string') {
            throw new Error('chain must be a string when provided');
        }
    }

    /**
     * Validate formats
     * @private
     */
    static _validateFormats(payload) {
        // Basic format checks
        if (!/^([0-9a-fA-F]{64}):(\d+)$/.test(payload.spell.ins[0].utxo_id)) {
            throw new Error('ins[0].utxo_id must be <txid>:<vout>');
        }
        if (payload.funding_utxo !== undefined) {
            if (!/^([0-9a-fA-F]{64}):(\d+)$/.test(payload.funding_utxo)) {
                throw new Error('funding_utxo must be <txid>:<vout> when provided');
            }
        }
        if (payload.change_address !== undefined) {
            if (typeof payload.change_address !== 'string' || payload.change_address.length < 20) {
                throw new Error('change_address appears invalid');
            }
        }
    }

    /**
     * Validate prover API response
     * @param {*} response - Response from prover API
     * @throws {Error} If validation fails
     */
    static validateProverResponse(response) {
        // Expected response should contain transaction data
        // Based on the example, it should be an array of hex strings
        if (!Array.isArray(response)) {
            throw new Error('Prover response should be an array of transactions');
        }

        if (response.length === 0) {
            throw new Error('Prover response is empty');
        }

        // Validate each transaction is a hex string
        for (let i = 0; i < response.length; i++) {
            const tx = response[i];
            if (typeof tx !== 'string') {
                throw new Error(`Transaction ${i} is not a string`);
            }
            if (!/^[0-9a-fA-F]+$/.test(tx)) {
                throw new Error(`Transaction ${i} is not valid hex: ${tx.substring(0, 50)}...`);
            }
        }
    }
}
