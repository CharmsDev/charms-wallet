import { decodeTx } from '@/lib/bitcoin/txDecoder';

/**
 * Create transfer charm transactions
 * @param {string} destinationAddress - The destination address
 * @param {number} fundingUtxoAmount - The amount of the funding UTXO
 * @param {string} spellJson - The spell JSON
 * @param {string} fundingUtxoId - The funding UTXO ID
 * @returns {Promise<Object>} The transaction response
 */
export async function createTransferCharmTxs(
    destinationAddress,
    fundingUtxoAmount,
    spellJson,
    fundingUtxoId,
) {
    // Parse spell JSON
    let parsedSpell;
    try {
        parsedSpell = JSON.parse(spellJson);
    } catch (error) {
        throw new Error("Invalid spell JSON format");
    }

    // Charms prover API endpoint
    const proveApiUrl = process.env.NEXT_PUBLIC_PROVE_API_URL || 'https://prove-t4.charms.dev/spells/prove';

    // Find the input that contains a charm (RJJ-TODO support multiple charms)
    let txid = null;
    let charmInputFound = false;
    if (parsedSpell.ins && parsedSpell.ins.length > 0) {
        for (const input of parsedSpell.ins) {
            if (input.charms && Object.keys(input.charms).length > 0) {
                // Found an input with charms, extract its txid
                if (input.utxo_id) {
                    txid = input.utxo_id.split(':')[0];
                    charmInputFound = true;
                    console.log(`Found charm input with txid: ${txid}`);
                    break;
                }
            }
        }
    }
    if (!charmInputFound) {
        throw new Error("No charm input found in the spell. A charm input is required for transfer.");
    }

    // Call wallet API to get the raw transaction
    const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355';
    const rawTxUrl = `${walletApiUrl}/bitcoin-cli/transaction/raw/${txid}`;

    let prev_txs = [];
    try {
        console.log(`Fetching raw transaction for txid: ${txid}`);
        const rawTxResponse = await fetch(rawTxUrl);

        if (!rawTxResponse.ok) {
            throw new Error(`Failed to fetch raw transaction: ${rawTxResponse.status} ${rawTxResponse.statusText}`);
        }

        const rawTxData = await rawTxResponse.json();

        if (rawTxData.status === 'success' && rawTxData.transaction) {
            // The transaction is already in the format we need
            prev_txs = [rawTxData.transaction.hex];
            console.log(`Retrieved raw transaction`, prev_txs);
        } else {
            throw new Error(`Invalid response format from raw transaction API`);
        }
    } catch (error) {
        throw new Error(`Failed to fetch previous transactions: ${error.message}`);
    }

    // Ensure the spell has the required fields
    if (!parsedSpell.ins) {
        parsedSpell.ins = [];
    }

    if (!parsedSpell.outs) {
        parsedSpell.outs = [];
    }

    // Make API request with prev_txs
    let response = null;
    let error = null;

    try {
        // Encode the spell object in CBOR format
        //const encodedSpell = cbor.encode(parsedSpell);

        // Create the request body with the actual data
        const requestBody = {
            spell: parsedSpell,
            binaries: {},
            prev_txs: prev_txs,
            funding_utxo: fundingUtxoId,
            funding_utxo_value: fundingUtxoAmount,
            change_address: destinationAddress,
            fee_rate: 2.0
        };

        // Send the request directly to the Charms prover API
        console.log('Sending request to Charms prover API:', proveApiUrl);

        // Make the direct API call
        response = await fetch(proveApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('Response status:', response.status);
        console.log('Response status text:', response.statusText);
    } catch (e) {
        error = e.message;
    }

    // Check if we have a successful response
    if (!response) {
        throw new Error(error || "No response received from the server");
    }

    // Get the response data
    let responseText;
    try {
        responseText = await response.text();
        console.log('Response text length:', responseText.length);
        console.log('First 100 chars of response:', responseText.substring(0, 100));
    } catch (e) {
        throw new Error(`Failed to read response: ${e.message}`);
    }

    // Try to parse the response as JSON
    let result;
    try {
        result = JSON.parse(responseText);
    } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`);
    }

    // Check if the response contains an error
    if (!response.ok) {
        const errorMessage = result.error || result.details || response.statusText || "Failed to create transfer transactions";
        console.error('Error response:', result);
        throw new Error(errorMessage);
    }

    // Parse response
    if (result.rawText) {
        console.log('Received raw text response ');
        try {
            // Try to parse the raw text as JSON
            result = JSON.parse(result.rawText);
        } catch (e) {
            throw new Error(`Invalid raw text response: ${result.rawText.substring(0, 100)}...`);
        }
    }

    // Extract transactions from response
    // The prover API returns an array with two transaction hex strings
    // The first is the commit tx, and the second is the spell tx
    if (!Array.isArray(result) || result.length !== 2) {
        throw new Error("Invalid response format from the API. Expected array with two transactions.");
    }

    const commit_tx = result[0];
    const spell_tx = result[1];

    if (!commit_tx || !spell_tx) {
        throw new Error("Invalid transaction data in the API response");
    }

    console.log('Commit TX:', commit_tx.substring(0, 50) + '...');
    console.log('Spell TX:', spell_tx.substring(0, 50) + '...');

    // Format response
    const transformedResult = {
        status: "success",
        message: "Transactions received from prover",
        transactions: {
            commit_tx: commit_tx,
            spell_tx: spell_tx,
            taproot_data: {
                script: "",
                control_block: ""
            }
        }
    };

    return transformedResult;
}

export const transferCharmService = {
    createTransferCharmTxs
};
