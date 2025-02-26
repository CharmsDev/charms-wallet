import { decodeTx } from "@utils/txDecoder";
import { transactionService } from "./index";
import type { SignedTransaction, TaprootData } from "@app-types/transaction";

export class SignTransactionService {
    async signBothTransactions(
        transactions: {
            commit_tx: string;
            spell_tx: string;
            taproot_data: TaprootData;
        },
        privateKey: string,
        onProgress: (message: string) => void
    ): Promise<{
        signedCommitTx: SignedTransaction;
        signedSpellTx: SignedTransaction;
    }> {
        // First sign the commit transaction
        onProgress("Step 1: Signing commit transaction...");
        console.log("Before signing commit transaction");
        const signedCommitTx = await transactionService.signTransaction(
            transactions.commit_tx,
            privateKey
        );

        // Get the commit tx output info
        onProgress("Decoding commit transaction...");
        const commitTxDecoded = decodeTx(transactions.commit_tx);
        if (!commitTxDecoded || !commitTxDecoded.outputs[0]) {
            throw new Error("Failed to decode commit transaction");
        }

        // Then sign the spell transaction using the commit tx info and taproot data
        onProgress("Step 2: Signing spell transaction...");
        const signedSpellTx = await transactionService.signSpellTransaction(
            transactions.spell_tx,
            {
                txid: signedCommitTx.txid,
                vout: 0,
                scriptPubKey: commitTxDecoded.outputs[0].scriptPubKey,
                amount: commitTxDecoded.outputs[0].value / 100000000,
                script: transactions.taproot_data.script,
                control_block: transactions.taproot_data.control_block
            },
            privateKey
        );

        return { signedCommitTx, signedSpellTx };
    }
}

export const signTransactionService = new SignTransactionService();
