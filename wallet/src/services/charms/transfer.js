import { decodeTx } from '@/lib/bitcoin/txDecoder';

// Create transfer charm transactions
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

    // Get the wallet API base URL
    const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'https://prove-t4.charms.dev/spells/prove';

    // Wallet API endpoint for spell proving
    const proveApiUrl = `${walletApiUrl}/spell/prove`;

    // Find the input that contains a charm (RJJ-TODO support multiple charms)
    let txid = null;
    let charmInputFound = false;
    if (parsedSpell.ins && parsedSpell.ins.length > 0) {
        for (const input of parsedSpell.ins) {
            if (input.charms && Object.keys(input.charms).length > 0) {
                // Extract txid from charm input
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
            // Use transaction in current format
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

        // Create request body for wallet API
        const requestBody = {
            spell: parsedSpell,
            binaries: {},
            prev_txs: prev_txs,
            funding_utxo: fundingUtxoId,
            funding_utxo_value: fundingUtxoAmount,
            change_address: destinationAddress,
            fee_rate: 2.0
        };

        // Log the request body for debugging
        console.log('=== API CALL START ===');
        console.log('Request URL:', proveApiUrl);
        console.log('Request payload:', JSON.stringify(requestBody, null, 2));
        console.log('=== PAYLOAD END ===');

        // Send the request to our wallet API
        console.log('Sending request to wallet API. This may take up to 10 minutes...');
        const startTime = new Date();

        // Execute API call
        response = await fetch(proveApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const endTime = new Date();
        const timeElapsed = (endTime - startTime) / 1000; // in seconds

        console.log('=== API RESPONSE START ===');
        console.log('Response received after', timeElapsed, 'seconds');
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
        console.log('Response text:', responseText);
    } catch (e) {
        console.error('Failed to read response:', e);
        throw new Error(`Failed to read response: ${e.message}`);
    }

    // Parse the response as JSON
    let result;
    let commit_tx;
    let spell_tx;

    try {
        // Parse the response as a JSON array with two hex strings
        result = JSON.parse(responseText);
        console.log('Response parsed as JSON');

        // Response is an array with two transactions [commit_tx, spell_tx]
        if (Array.isArray(result) && result.length === 2) {
            commit_tx = result[0];
            spell_tx = result[1];
        } else {
            throw new Error("Invalid response format: expected array with two transactions");
        }

        console.log('Commit TX:', commit_tx);
        console.log('Spell TX:', spell_tx);
    } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        throw new Error(`Invalid JSON response: ${e.message}`);
    }

    // Format response
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
