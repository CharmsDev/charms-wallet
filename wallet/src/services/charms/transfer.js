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
    console.log("Creating transfer transactions with params:", {
        destinationAddress,
        fundingUtxoAmount,
        fundingUtxoId,
        spellJson
    });

    // Parse spell JSON
    let parsedSpell;
    try {
        parsedSpell = JSON.parse(spellJson);
    } catch (error) {
        console.error("Error parsing spell JSON:", error);
        throw new Error("Invalid spell JSON format");
    }

    // Charms prover API endpoint
    const proveApiUrl = 'https://prove.charms.dev/spells/prove';
    console.log("--> call new API: ", proveApiUrl);

    // Get previous transactions
    console.log("Fetching previous transactions for funding UTXO:", fundingUtxoId);

    // Call wallet API for previous transactions
    const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355';
    const prevTxsUrl = `${walletApiUrl}/bitcoin-rpc/prev-txs/${fundingUtxoId}`;

    let prev_txs = [];
    try {
        const prevTxsResponse = await fetch(prevTxsUrl);
        if (!prevTxsResponse.ok) {
            console.error("Failed to fetch previous transactions:", prevTxsResponse.statusText);
        } else {
            prev_txs = await prevTxsResponse.json();
            console.log("Previous transactions fetched successfully:", prev_txs.length);
        }
    } catch (error) {
        console.error("Error fetching previous transactions:", error);
    }

    // Create transactions via API
    const response = await fetch(proveApiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            spell: parsedSpell,
            binaries: {},
            prev_txs: prev_txs,
            funding_utxo: fundingUtxoId,
            funding_utxo_value: fundingUtxoAmount,
            change_address: destinationAddress,
            fee_rate: 2.0
        }),
    });

    /* Old API call - commented out
    const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355';
    console.log("--> call ", `${walletApiUrl}/spell/prove_spell`);

    // Call the API to create the transactions
    const response = await fetch(`${walletApiUrl}/spell/prove_spell`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            destination_address: destinationAddress,
            spell_json: spellJson,
            funding_utxo_id: fundingUtxoId,
            funding_utxo_amount: fundingUtxoAmount,
        }),
    });
    */

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create transfer transactions");
    }

    const result = await response.json();

    // Log response
    console.log("Raw API Response:", result);

    // Extract transactions from response
    const commit_tx = result.commit_tx || result.transactions?.commit_tx;
    const spell_tx = result.spell_tx || result.transactions?.spell_tx;

    if (!commit_tx || !spell_tx) {
        throw new Error("Invalid response format from the API");
    }

    console.log("Raw Commit Transaction:", commit_tx);
    console.log("Raw Spell Transaction:", spell_tx);

    const decodedCommitTx = decodeTx(commit_tx);
    const decodedSpellTx = decodeTx(spell_tx);

    console.log("Decoded Commit Transaction:", decodedCommitTx);
    console.log("Decoded Spell Transaction:", decodedSpellTx);

    // Format response
    const transformedResult = {
        status: "success",
        message: result.message || "",
        transactions: {
            commit_tx: commit_tx,
            spell_tx: spell_tx,
            taproot_data: {
                script: result.taproot_script || result.transactions?.taproot_script || "",
                control_block: "" // Empty as not provided by API
            }
        }
    };

    console.log("Transformed Response:", transformedResult);

    return transformedResult;
}

export const transferCharmService = {
    createTransferCharmTxs
};
