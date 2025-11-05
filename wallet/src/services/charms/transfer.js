import { decodeTx } from '@/lib/bitcoin/txDecoder';
import config from '@/config';
import { charmsSpellService } from './spell-composer';
import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';
import { DEFAULT_FEE_RATE } from './constants';

// Generate charm transfer transactions
export async function createTransferCharmTxs(
    spellJson,
    fundingUtxo, // UTXO object
    network // Network parameter
) {
    // Validate funding UTXO
    if (!fundingUtxo || !fundingUtxo.txid || typeof fundingUtxo.vout === 'undefined' || typeof fundingUtxo.value === 'undefined' || !fundingUtxo.address) {
        throw new Error("Invalid or incomplete funding UTXO object provided.");
    }

    // Prepare funding UTXO data
    const fundingUtxoId = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
    const fundingUtxoAmount = fundingUtxo.value;
    const changeAddress = fundingUtxo.address;

    // Parse spell JSON string
    let parsedSpell;
    try {
        parsedSpell = JSON.parse(spellJson);
    } catch (error) {
        throw new Error("Invalid spell JSON format");
    }

    // API endpoints

    // Find the input that contains a charm (support multiple charms)
    let txid = null;
    let charmInputFound = false;
    if (parsedSpell.ins && parsedSpell.ins.length > 0) {
        for (const input of parsedSpell.ins) {
            if (input.charms && Object.keys(input.charms).length > 0) {
                // Extract transaction ID
                if (input.utxo_id) {
                    txid = input.utxo_id.split(':')[0];
                    charmInputFound = true;
                    // Found valid charm input
                    break;
                }
            }
        }
    }
    if (!charmInputFound) {
        throw new Error("No charm input found in the spell. A charm input is required for transfer.");
    }

    // Fetch raw transaction data (prev tx) using bitcoin-api-router
    let prev_txs = [];
    try {
        // Use bitcoin-api-router to get transaction hex
        const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
        
        if (txHex) {
            prev_txs = [txHex];
        } else {
            throw new Error(`No transaction hex returned for ${txid}`);
        }
    } catch (error) {
        throw new Error(`Failed to fetch previous transactions: ${error.message}`);
    }

    // Initialize spell fields if missing
    if (!parsedSpell.ins) {
        parsedSpell.ins = [];
    }

    if (!parsedSpell.outs) {
        parsedSpell.outs = [];
    }

    // Prepare API request
    let response = null;
    let error = null;

    try {
        // Create request body with proper key ordering
        const requestData = {
            spell: parsedSpell,
            binaries: {},
            prev_txs: prev_txs,
            funding_utxo: fundingUtxoId,
            funding_utxo_value: fundingUtxoAmount,
            change_address: changeAddress,
            fee_rate: DEFAULT_FEE_RATE
        };

        // Format spell using spell-composer service
        const formattedSpell = charmsSpellService.serializeSpell(requestData.spell);

        // Create payload
        const payloadString = `{"spell":${formattedSpell},"binaries":${JSON.stringify(requestData.binaries)},"prev_txs":${JSON.stringify(requestData.prev_txs)},"funding_utxo":"${requestData.funding_utxo}","funding_utxo_value":${requestData.funding_utxo_value},"change_address":"${requestData.change_address}","fee_rate":${requestData.fee_rate}}`;

        // log time
        const startTime = new Date();

        // Get prover URL for the current network (will throw if not configured)
        const proverUrl = config.api.getProverUrl(network);

        // Send request to prover API
        response = await fetch(`${proverUrl}/spells/prove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: payloadString
        });

        const endTime = new Date();
        const timeElapsed = (endTime - startTime) / 1000; // in seconds

        // Response received
    } catch (e) {
        error = e.message;
    }

    // Validate response
    if (!response) {
        throw new Error(error || "No response received from the server");
    }

    // Extract response text
    let responseText;
    try {
        responseText = await response.text();
        // Text extracted successfully
    } catch (e) {
        // Response reading error
        throw new Error(`Failed to read response: ${e.message}`);
    }

    // Process response data
    let result;
    let commit_tx;
    let spell_tx;

    try {
        // Parse JSON response
        result = JSON.parse(responseText);

        // Extract transaction data
        if (Array.isArray(result) && result.length === 2) {
            commit_tx = result[0];
            spell_tx = result[1];
        } else {
            throw new Error("Invalid response format: expected array with two transactions");
        }

        // Transactions extracted successfully
    } catch (e) {
        // JSON parsing error
        throw new Error(`Invalid JSON response: ${e.message}`);
    }

    // Format final result
    const transformedResult = {
        status: "success",
        message: "Transactions received from prover",
        transactions: {
            commit_tx: commit_tx,
            spell_tx: spell_tx
        }
    };

    return transformedResult;
}

export const transferCharmService = {
    createTransferCharmTxs
};
