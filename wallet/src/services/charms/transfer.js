import { decodeTx } from '@/lib/bitcoin/txDecoder';

// Formats spell object with correct key order for expected format

function formatSpellWithCorrectKeyOrder(spell) {
    // Ensure spell has required properties
    const version = spell.version || 2;
    const apps = spell.apps || {};
    const ins = spell.ins || [];
    const outs = spell.outs || [];

    // Format inputs with correct key order
    const formattedIns = ins.map(input => {
        const utxo_id = input.utxo_id || '';
        const charms = input.charms || {};

        // Format charms with correct key order
        const formattedCharms = {};
        Object.keys(charms).forEach(charmKey => {
            const charm = charms[charmKey];
            formattedCharms[charmKey] = {
                "ticker": charm.ticker || '',
                "remaining": charm.remaining || 0
            };
        });

        // Return input with correct key order
        return {
            "utxo_id": utxo_id,
            "charms": formattedCharms
        };
    });

    // Format outputs with correct key order
    const formattedOuts = outs.map(output => {
        const address = output.address || '';
        const charms = output.charms || {};
        const sats = output.sats || 0;

        // Format charms with correct key order
        const formattedCharms = {};
        Object.keys(charms).forEach(charmKey => {
            const charm = charms[charmKey];
            formattedCharms[charmKey] = {
                "ticker": charm.ticker || '',
                "remaining": charm.remaining || 0
            };
        });

        // Return output with correct key order
        return {
            "address": address,
            "charms": formattedCharms,
            "sats": sats
        };
    });

    // Create formatted spell object
    const formattedSpell = {
        "version": version,
        "apps": apps,
        "ins": formattedIns,
        "outs": formattedOuts
    };

    // Return formatted spell as JSON string
    return JSON.stringify(formattedSpell);
}

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

    // Get wallet API base URL
    const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355';
    const proverApiUrl = process.env.NEXT_PUBLIC_PROVE_API_URL;

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
                    // Found charm input with txid
                    break;
                }
            }
        }
    }
    if (!charmInputFound) {
        throw new Error("No charm input found in the spell. A charm input is required for transfer.");
    }

    // Call wallet API for raw transaction
    const rawTxUrl = `${walletApiUrl}/bitcoin-cli/transaction/raw/${txid}`;

    let prev_txs = [];
    try {
        // Fetching raw transaction
        const rawTxResponse = await fetch(rawTxUrl);

        if (!rawTxResponse.ok) {
            throw new Error(`Failed to fetch raw transaction: ${rawTxResponse.status} ${rawTxResponse.statusText}`);
        }

        const rawTxData = await rawTxResponse.json();

        if (rawTxData.status === 'success' && rawTxData.transaction) {
            // Use transaction in current format
            prev_txs = [rawTxData.transaction.hex];
            // Retrieved raw transaction
        } else {
            throw new Error(`Invalid response format from raw transaction API`);
        }
    } catch (error) {
        throw new Error(`Failed to fetch previous transactions: ${error.message}`);
    }

    // Ensure spell has required fields
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
        // Create request body with exact key order as in prover.js
        const requestData = {
            spell: parsedSpell,
            binaries: {},
            prev_txs: prev_txs,
            funding_utxo: fundingUtxoId,
            funding_utxo_value: fundingUtxoAmount,
            change_address: destinationAddress,
            fee_rate: 2
        };

        // Format spell object with exact key order
        const formattedSpell = formatSpellWithCorrectKeyOrder(requestData.spell);

        // Format payload string with exact key order
        const payloadString = `{"spell":${formattedSpell},"binaries":${JSON.stringify(requestData.binaries)},"prev_txs":${JSON.stringify(requestData.prev_txs)},"funding_utxo":"${requestData.funding_utxo}","funding_utxo_value":${requestData.funding_utxo_value},"change_address":"${requestData.change_address}","fee_rate":${requestData.fee_rate}}`;


        // Send request to wallet API
        const startTime = new Date();

        // Execute API call
        response = await fetch(`${proverApiUrl}/spells/prove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: payloadString
        });

        const endTime = new Date();
        const timeElapsed = (endTime - startTime) / 1000; // in seconds

        // API response received
    } catch (e) {
        error = e.message;
    }

    // Check for successful response
    if (!response) {
        throw new Error(error || "No response received from the server");
    }

    // Get response data
    let responseText;
    try {
        responseText = await response.text();
        // Response text received
    } catch (e) {
        // Failed to read response
        throw new Error(`Failed to read response: ${e.message}`);
    }

    // Parse response as JSON
    let result;
    let commit_tx;
    let spell_tx;

    try {
        // Parse response as JSON array with two hex strings
        result = JSON.parse(responseText);
        // Response parsed as JSON

        // Response is array with two transactions
        if (Array.isArray(result) && result.length === 2) {
            commit_tx = result[0];
            spell_tx = result[1];
        } else {
            throw new Error("Invalid response format: expected array with two transactions");
        }

        // Transactions received
    } catch (e) {
        // Failed to parse response
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
