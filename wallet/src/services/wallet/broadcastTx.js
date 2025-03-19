/**
 * Broadcast Bitcoin transactions
 * @param {Object} signedCommitTx - The signed commit transaction object with hex property
 * @param {Object} signedSpellTx - The signed spell transaction object with hex property
 * @param {Function} logCallback - Optional callback for logging messages
 * @returns {Promise<Object>} The broadcast result
 */
export async function broadcastTransactions(signedCommitTx, signedSpellTx, logCallback = () => { }) {
    try {
        if (!signedCommitTx || !signedSpellTx) {
            throw new Error('Please sign the transactions first');
        }

        logCallback('Starting transaction broadcast process...');
        logCallback('Broadcasting both transactions together...');

        // API endpoint for broadcasting transactions
        const apiUrl = `${process.env.NEXT_PUBLIC_WALLET_API_URL || 'http://localhost:3355'}/wallet/broadcast`;

        // Make the API request with both transactions
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transactions: [
                    { tx_hex: signedCommitTx.hex },
                    { tx_hex: signedSpellTx.hex }
                ]
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        logCallback(`Transactions broadcast successful!`);
        if (result.txids && result.txids.length >= 2) {
            logCallback(`Commit TXID: ${result.txids[0]}`);
            logCallback(`Spell TXID: ${result.txids[1]}`);
        }

        return result;
    } catch (err) {
        logCallback(`Broadcast error: ${err.message}`);
        console.error('Broadcast error:', err);
        throw new Error(`Broadcast error: ${err.message}`);
    }
}
