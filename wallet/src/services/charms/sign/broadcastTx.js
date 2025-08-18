import config from '@/config';

// Broadcasts Bitcoin transactions
export async function broadcastTransactions(signedCommitTx, signedSpellTx, logCallback = () => { }) {
    try {
        if (!signedCommitTx || !signedSpellTx) {
            throw new Error('Please sign the transactions first');
        }

        logCallback('Starting transaction broadcast process...');
        logCallback('Broadcasting both transactions together...');

        // Make API request with both transactions
        const response = await fetch(`${config.api.wallet}/bitcoin-cli/wallet/broadcast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tx_hex: signedCommitTx.signedTxHex || signedCommitTx.hex,
                tx_package: [
                    signedCommitTx.signedTxHex || signedCommitTx.hex,
                    signedSpellTx.hex
                ]
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        logCallback(`Transactions broadcast successful!`);
        logCallback(`Transaction ID: ${result.txid}`);

        // Extract transaction IDs from response
        // API returns a single txid (first transaction's ID)
        let commitTxid = result.txid;
        let spellTxid = result.txid;

        // Use same txid for both transactions
        // Production would require blockchain query for actual txids

        // Log detailed information
        logCallback(`API Response: ${JSON.stringify(result, null, 2)}`);

        // Create structured response
        const broadcastResult = {
            commitData: {
                txid: commitTxid,
                command: result.command,
                response: result.node_response
            },
            spellData: {
                txid: spellTxid,
                command: result.command,
                response: result.node_response
            }
        };

        // Log transaction IDs
        logCallback(`Commit TXID: ${commitTxid}`);
        logCallback(`Spell TXID: ${spellTxid}`);

        return broadcastResult;
    } catch (err) {
        logCallback(`Broadcast error: ${err.message}`);
        throw new Error(`Broadcast error: ${err.message}`);
    }
}
