import { decodeTx } from '@/lib/bitcoin/txDecoder';
import * as cbor from 'cbor-web';

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
    const proveApiUrl = process.env.NEXT_PUBLIC_PROVE_API_URL || 'https://prove.charms.dev/spells/prove';

    // Extract transaction ID from funding UTXO (format: txid:vout)
    const txid = fundingUtxoId.split(':')[0];

    // Call wallet API for previous transactions
    const walletApiUrl = process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355';
    const prevTxsUrl = `${walletApiUrl}/bitcoin-rpc/prev-txs/${txid}`;

    let prev_txs = [];
    try {
        const prevTxsResponse = await fetch(prevTxsUrl);

        if (!prevTxsResponse.ok) {
            throw new Error(`Failed to fetch previous transactions: ${prevTxsResponse.status} ${prevTxsResponse.statusText}`);
        }

        prev_txs = await prevTxsResponse.json();
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
        const encodedSpell = cbor.encode(parsedSpell);

        const requestBody = {
            spell: Array.from(new Uint8Array(encodedSpell)), // CBOR-encoded spell
            binaries: {},
            prev_txs: prev_txs,
            funding_utxo: fundingUtxoId,
            funding_utxo_value: fundingUtxoAmount,
            change_address: destinationAddress,
            fee_rate: 2.0
        };

        response = await fetch(proveApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });
    } catch (e) {
        error = e.message;
    }

    // Check if we have a successful response
    if (!response || !response.ok) {
        throw new Error(error || "Failed to create transfer transactions");
    }

    let result;
    try {
        result = await response.json();
    } catch (e) {
        throw new Error("Invalid response format from the API");
    }

    // RJJ-TODO | review from here when prover works

    // Extract transactions from response
    const commit_tx = result.commit_tx || result.transactions?.commit_tx;
    const spell_tx = result.spell_tx || result.transactions?.spell_tx;

    if (!commit_tx || !spell_tx) {
        throw new Error("Invalid response format from the API");
    }

    // RJJ-TODO log to screen to debug or information process
    //const decodedCommitTx = decodeTx(commit_tx);
    //const decodedSpellTx = decodeTx(spell_tx);

    // Format response
    const transformedResult = {
        status: "success",
        message: result.message || "",
        transactions: {
            commit_tx: commit_tx,
            spell_tx: spell_tx,
            taproot_data: {
                script: result.taproot_script || result.transactions?.taproot_script || "",
                control_block: ""
            }
        }
    };

    return transformedResult;
}

export const transferCharmService = {
    createTransferCharmTxs
};
