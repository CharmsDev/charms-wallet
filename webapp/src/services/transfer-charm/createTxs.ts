import { WALLET_API_URL } from "@services/shared/constants";
import { decodeTx } from "@utils/txDecoder";
import type { TransferCharmsResponse } from "@app-types/transaction";

export async function createTransferCharmTxs(
    destinationAddress: string,
    transferAmount: number,
    spellJson: string,
    fundingUtxoId: string,
): Promise<TransferCharmsResponse> {
    console.log("Creating transfer transactions with params:", {
        destinationAddress,
        transferAmount,
        fundingUtxoId,
        spellJson
    });

    console.log("--> call ", `${WALLET_API_URL}/spell/prove_spell`);

    const response = await fetch(`${WALLET_API_URL}/spell/prove_spell`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            destination_address: destinationAddress,
            transfer_amount: transferAmount,
            spell_json: spellJson,
            funding_utxo_id: fundingUtxoId,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create transfer transactions");
    }

    const result = await response.json();

    // Log raw and decoded transactions
    console.log("Raw Commit Transaction:", result.transactions.commit_tx);
    console.log("Raw Spell Transaction:", result.transactions.spell_tx);

    const decodedCommitTx = decodeTx(result.transactions.commit_tx);
    const decodedSpellTx = decodeTx(result.transactions.spell_tx);

    console.log("Decoded Commit Transaction:", decodedCommitTx);
    console.log("Decoded Spell Transaction:", decodedSpellTx);

    return result as TransferCharmsResponse;
}
