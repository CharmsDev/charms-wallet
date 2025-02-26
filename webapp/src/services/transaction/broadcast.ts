import { WALLET_API_URL, EXPLORER_URL } from '@services/shared/constants';
import type { SignedTransaction, BroadcastResponse } from '@app-types/transaction';

export class BroadcastTransactionService {
    private readonly API_URL = `${WALLET_API_URL}/wallet/broadcast`;

    async broadcastTransaction(tx_hex: string): Promise<BroadcastResponse> {
        const response = await fetch(this.API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx_hex }),
        });

        const responseText = await response.text();
        console.log("Broadcast response:", responseText);

        if (!response.ok) {
            throw new Error(`Failed to broadcast transaction: ${responseText}`);
        }

        let data;
        try {
            data = JSON.parse(responseText);
            console.log("Bitcoin-cli command:", data.command);
            return data;
        } catch (e) {
            console.error("Failed to parse response:", responseText);
            throw new Error("Failed to parse transaction response");
        }
    }

    async broadcastBothTransactions(
        signedCommitTx: SignedTransaction,
        signedSpellTx: SignedTransaction,
        onProgress: (message: string) => void
    ): Promise<{
        commitData: BroadcastResponse;
        spellData: BroadcastResponse;
    }> {
        // Broadcast commit transaction
        onProgress("Step 3: Broadcasting commit transaction...");
        console.log("Broadcasting commit tx:", { tx_hex: signedCommitTx.hex });
        const commitData = await this.broadcastTransaction(signedCommitTx.hex);

        onProgress(`Commit transaction broadcast successfully:`);
        onProgress(`${EXPLORER_URL}/tx/${commitData.txid}`);
        onProgress(`Command: ${commitData.command}`);

        // Broadcast spell transaction
        onProgress("Step 4: Broadcasting spell transaction...");
        console.log("Broadcasting spell tx:", { tx_hex: signedSpellTx.hex });
        const spellData = await this.broadcastTransaction(signedSpellTx.hex);

        onProgress(`Spell transaction broadcast successfully:`);
        onProgress(`${EXPLORER_URL}/tx/${spellData.txid}`);
        onProgress(`Command: ${spellData.command}`);
        onProgress("");
        onProgress("✅ Transfer completed successfully!");
        onProgress("Transaction links (click to view on block explorer):");
        onProgress(`Commit TX: ${EXPLORER_URL}/tx/${commitData.txid}`);
        onProgress(`Spell TX: ${EXPLORER_URL}/tx/${spellData.txid}`);
        onProgress("");
        onProgress("Bitcoin-cli commands:");
        onProgress(`Commit TX: ${commitData.command}`);
        onProgress(`Spell TX: ${spellData.command}`);

        return { commitData, spellData };
    }
}

export const broadcastTransactionService = new BroadcastTransactionService();
