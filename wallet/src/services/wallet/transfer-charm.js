import { decodeTx } from '@/lib/bitcoin/txDecoder';

/**
 * Creates transactions for transferring charms
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

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create transfer transactions");
    }

    const result = await response.json();

    // Log raw and decoded transactions
    console.log("Raw API Response:", result);
    console.log("Raw Commit Transaction:", result.transactions.commit_tx);
    console.log("Raw Spell Transaction:", result.transactions.spell_tx);

    const decodedCommitTx = decodeTx(result.transactions.commit_tx);
    const decodedSpellTx = decodeTx(result.transactions.spell_tx);

    console.log("Decoded Commit Transaction:", decodedCommitTx);
    console.log("Decoded Spell Transaction:", decodedSpellTx);

    // Transform the API response to match the expected response interface
    const transformedResult = {
        status: result.status,
        message: result.message || "",
        transactions: {
            commit_tx: result.transactions.commit_tx,
            spell_tx: result.transactions.spell_tx,
            taproot_data: {
                script: result.transactions.taproot_script || "",
                control_block: "" // API doesn't provide control_block, so use empty string
            }
        }
    };

    console.log("Transformed Response:", transformedResult);

    return transformedResult;
}

export const transferCharmService = {
    createTransferCharmTxs
};
