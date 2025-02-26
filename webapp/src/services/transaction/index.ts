import { sha256, hexToBytes, bytesToHex, sanitizeHexString, ec } from './common';
import { taprootTransactionService } from './taproot';
import type { CommitTxInfo, SignedTransaction } from '@app-types/transaction';

class TransactionService {
    /**
     * Signs the commit transaction which creates a Taproot output.
     * This follows the pattern from charms/src/tx.rs where create_commit_tx() 
     * creates a transaction with a P2TR (Pay-to-Taproot) output.
     */
    async signTransaction(txHex: string, privateKey: string): Promise<{ hex: string; hash: string; signature: string; txid: string }> {
        // The commit transaction is always Taproot
        const result = await this.signGenericTransaction(txHex, privateKey, true);
        const signedTxHex = this.prepareSignedTransaction(txHex, result.signature, privateKey);
        console.log('Signed transaction hex:', signedTxHex);

        const signedTxBytes = hexToBytes(signedTxHex);
        const firstHash = await sha256(signedTxBytes);
        const txid = bytesToHex(await sha256(firstHash));

        return {
            hex: signedTxHex,
            hash: result.hash,
            signature: result.signature,
            txid: txid,
        };
    }

    async signSpellTransaction(
        spellTxHex: string,
        commitTxInfo: CommitTxInfo,
        privateKey: string
    ): Promise<{ hex: string; hash: string; signature: string; txid: string }> {
        /**
         * For spell transactions, we need to include the commit tx info in the signature.
         * This follows the pattern from charms/src/tx.rs where the spell transaction 
         * is a regular transaction that spends the Taproot output created by the commit tx.
         */
        console.log('Signing spell transaction with commit tx info:', commitTxInfo);

        // Validate script and control block data
        if (!commitTxInfo.script) {
            throw new Error('Missing script for taproot script path spend');
        }
        if (!commitTxInfo.control_block) {
            throw new Error('Missing control block for taproot script path spend');
        }

        console.log('Script:', commitTxInfo.script);
        console.log('Control block:', commitTxInfo.control_block);

        // First hash the transaction with commit tx info
        const txBytes = hexToBytes(spellTxHex);
        // Sanitize hex inputs before combining
        const txidHex = sanitizeHexString(commitTxInfo.txid);
        const voutHex = commitTxInfo.vout.toString(16).padStart(8, '0');
        const scriptPubKeyHex = sanitizeHexString(commitTxInfo.scriptPubKey);
        const amountHex = Math.floor(commitTxInfo.amount * 100000000).toString(16).padStart(16, '0');

        const commitInfoBytes = hexToBytes(txidHex + voutHex + scriptPubKeyHex + amountHex);

        // Combine tx bytes with commit info bytes
        const combinedBytes = new Uint8Array(txBytes.length + commitInfoBytes.length);
        combinedBytes.set(txBytes);
        combinedBytes.set(commitInfoBytes, txBytes.length);

        const firstHash = await sha256(combinedBytes);
        const txHash = await sha256(firstHash);
        console.log('Transaction hash (pre-sign):', bytesToHex(txHash));

        /**
         * For spell transactions, we use Taproot script path spending.
         * This follows the pattern from charms/src/tx.rs where the spell transaction 
         * spends the Taproot output created by the commit tx using script path.
         * Reference: append_witness_data() in tx.rs
         */
        const signature = await taprootTransactionService.signTaprootTransaction(spellTxHex, privateKey, txHash, true);
        console.log('Signature created:', signature);

        // Add SegWit marker and flag if not present
        let signedTx = spellTxHex;
        if (spellTxHex.slice(8, 12) !== '0001') {
            signedTx = spellTxHex.slice(0, 8) + '0001' + spellTxHex.slice(8);
        }

        // Create the Taproot script path witness using the script and control block from commit tx info
        const witness = taprootTransactionService.prepareWitness(
            signature,
            '81', // SIGHASH_ALL_PLUS_ANYONE_CAN_PAY as used in tx.rs
            true,  // isScriptSpend
            commitTxInfo.script,
            commitTxInfo.control_block
        );

        // Add witness to transaction before locktime
        const locktime = signedTx.slice(-8);
        const signedTxHex = signedTx.slice(0, -8) + witness + locktime;

        // Compute the txid by double-hashing the signed transaction hex
        const signedTxBytes = hexToBytes(signedTxHex);
        const txidFirstHash = await sha256(signedTxBytes);
        const txid = bytesToHex(await sha256(txidFirstHash));

        // Return the signed transaction
        return {
            hex: signedTxHex,
            hash: bytesToHex(txHash),
            signature: signature,
            txid: txid
        };
    }

    private async signGenericTransaction(txHex: string, privateKey: string, useTaproot: boolean = false): Promise<{ hex: string; hash: string; signature: string }> {
        try {
            console.log('Starting transaction signing process');
            console.log('Input transaction hex:', txHex);
            console.log('Using Taproot:', useTaproot);

            // Convert hex to bytes
            const txBytes = hexToBytes(txHex);
            console.log('Transaction bytes length:', txBytes.length);

            // Create double SHA256 hash of the transaction
            const firstHash = await sha256(txBytes);
            const txHash = await sha256(firstHash);
            console.log('Transaction hash (pre-sign):', bytesToHex(txHash));

            let signature;
            if (useTaproot) {
                // For commit transactions, we use key path spending (isScriptSpend = false)
                signature = await taprootTransactionService.signTaprootTransaction(txHex, privateKey, txHash, false);
            } else {
                // For regular transactions, use ECDSA signatures
                const keyPair = ec.keyFromPrivate(privateKey);
                signature = keyPair.sign(txHash).toDER('hex');
            }

            return {
                hex: txHex,
                hash: bytesToHex(txHash),
                signature: signature
            };
        } catch (error: any) {
            console.error('Transaction signing failed:', error);
            throw new Error(`Failed to sign transaction: ${error.message || 'Unknown error'}`);
        }
    }

    /**
     * Prepares the signed transaction. For commit transactions, this uses Taproot signing.
     * Reference implementation: charms/src/tx.rs - create_commit_tx() function
     */
    private prepareSignedTransaction(txHex: string, signature: string, privateKey: string): string {
        // Add SegWit marker and flag if not present
        let signedTx = txHex;
        if (txHex.slice(8, 12) !== '0001') {
            signedTx = txHex.slice(0, 8) + '0001' + txHex.slice(8);
        }

        // Create the Taproot witness
        const witness = taprootTransactionService.prepareWitness(signature);

        // Add witness to transaction before locktime
        const locktime = signedTx.slice(-8);
        return signedTx.slice(0, -8) + witness + locktime;
    }
}

export const transactionService = new TransactionService();
export { broadcastTransactionService } from './broadcast';
export { signTransactionService } from './sign';
export { transferService } from './transfer';
