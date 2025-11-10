/**
 * Charm Transaction Scanner
 * Detects and records historical charm transfer transactions
 */

/**
 * Scan for historical charm transfer transactions
 * Detects sent charm transactions by analyzing transaction outputs
 * 
 * @param {Array} charms - Array of charm objects to analyze
 * @param {string} blockchain - Blockchain identifier
 * @param {string} network - Network identifier (mainnet/testnet4)
 */
export async function scanCharmTransactions(charms, blockchain, network) {
    try {
        const { useTransactionStore } = await import('@/stores/transactionStore');
        const { useAddresses } = await import('@/stores/addressesStore');
        const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
        const { extractAndVerifySpell } = await import('charms-js');
        
        // Safely get store state with fallback
        const transactionStore = useTransactionStore?.getState?.();
        if (!transactionStore?.recordSentTransaction) {
            console.warn('[CharmTxScanner] Transaction store not available, skipping scan');
            return;
        }
        
        const recordSentTransaction = transactionStore.recordSentTransaction;
        const addressStore = useAddresses?.getState?.();
        const walletAddresses = new Set(addressStore?.addresses?.map(a => a.address) || []);
        
        // Get unique transaction IDs from charms
        const txIds = [...new Set(charms.map(c => c.txid))];
        
        for (const txid of txIds) {
            try {
                // Get transaction hex
                const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
                if (!txHex) continue;
                
                // Extract spell data
                const result = await extractAndVerifySpell(txHex, network);
                if (!result.success || !result.charms || result.charms.length === 0) continue;
                
                // Check if this is a sent transaction (has outputs to external addresses)
                const hasExternalOutput = result.charms.some(charm => 
                    charm.address && !walletAddresses.has(charm.address)
                );
                
                if (!hasExternalOutput) continue;
                
                // Find the charm data for this transaction
                const txCharms = charms.filter(c => c.txid === txid);
                if (txCharms.length === 0) continue;
                
                const firstCharm = txCharms[0];
                const externalCharm = result.charms.find(c => c.address && !walletAddresses.has(c.address));
                
                if (!externalCharm) continue;
                
                // Calculate total amount sent
                const totalCharmAmount = externalCharm.amount || 0;
                
                // Record the transaction
                await recordSentTransaction({
                    id: `tx_${txid}_sent_charm`,
                    txid: txid,
                    type: 'sent',
                    amount: 330, // Typical charm output value
                    fee: 330,
                    timestamp: Date.now(), // We don't have exact timestamp, use current
                    status: 'confirmed', // Historical transactions are confirmed
                    addresses: {
                        from: txCharms.map(c => c.address).filter(Boolean),
                        to: [externalCharm.address]
                    },
                    metadata: {
                        isCharmTransfer: true,
                        charmAmount: totalCharmAmount,
                        ticker: firstCharm.ticker || firstCharm.metadata?.ticker || 'CHARM'
                    }
                }, blockchain, network);
                
            } catch (error) {
                // Continue with next transaction on error
                console.warn(`[CharmTxScanner] Failed to process ${txid}:`, error.message);
            }
        }
    } catch (error) {
        console.error('[CharmTxScanner] Error scanning charm transactions:', error);
    }
}
