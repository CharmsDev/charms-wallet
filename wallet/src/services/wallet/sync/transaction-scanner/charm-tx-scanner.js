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
 * @param {Function} recordSentTransaction - Function to record transactions (optional, will import if not provided)
 * @param {Set} walletAddresses - Set of wallet addresses (optional, will import if not provided)
 */
export async function scanCharmTransactions(charms, blockchain, network, recordSentTransaction = null, walletAddresses = null) {
    console.log('[CharmTxScanner] Starting scan for', charms.length, 'charms');
    
    try {
        const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
        const { extractAndVerifySpell } = await import('charms-js');
        const bitcoin = await import('bitcoinjs-lib');
        
        // Get recordSentTransaction if not provided
        if (!recordSentTransaction) {
            const { useTransactionStore } = await import('@/stores/transactionStore');
            recordSentTransaction = useTransactionStore.getState().recordSentTransaction;
            if (!recordSentTransaction) {
                console.error('[CharmTxScanner] recordSentTransaction not available');
                return;
            }
        }
        
        // Get wallet addresses if not provided
        if (!walletAddresses) {
            const { useAddresses } = await import('@/stores/addressesStore');
            const addressStore = useAddresses.getState();
            walletAddresses = new Set(addressStore?.addresses?.map(a => a.address) || []);
        }
        
        console.log('[CharmTxScanner] Transaction store available');
        console.log('[CharmTxScanner] Wallet addresses:', walletAddresses.size);
        
        // Get unique transaction IDs from charms
        const txIds = [...new Set(charms.map(c => c.txid))];
        console.log('[CharmTxScanner] Scanning', txIds.length, 'unique transactions');
        
        for (const txid of txIds) {
            console.log('[CharmTxScanner] Processing txid:', txid);
            try {
                // Get transaction details for input/output counting
                const txDetails = await bitcoinApiRouter.getTransaction(txid, network);
                if (!txDetails) {
                    console.log('[CharmTxScanner] No tx details for:', txid);
                    continue;
                }
                
                // Get transaction hex
                const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
                if (!txHex) {
                    console.log('[CharmTxScanner] No tx hex for:', txid);
                    continue;
                }
                
                // Extract spell data
                const result = await extractAndVerifySpell(txHex, network);
                console.log('[CharmTxScanner] Spell extraction result:', {
                    success: result.success,
                    charmsCount: result.charms?.length || 0
                });
                
                if (!result.success || !result.charms || result.charms.length === 0) {
                    console.log('[CharmTxScanner] No valid spell data');
                    continue;
                }
                
                // Analyze charm outputs to determine transaction type
                console.log('[CharmTxScanner] ========== CHARM OUTPUTS ANALYSIS ==========');
                
                const externalOutputs = [];
                const internalOutputs = [];
                
                result.charms.forEach((charm, index) => {
                    const isExternal = charm.address && !walletAddresses.has(charm.address);
                    console.log(`[CharmTxScanner] Output ${index}:`);
                    console.log(`  Address: ${charm.address || 'N/A'}`);
                    console.log(`  Amount: ${charm.amount || 0}`);
                    console.log(`  Is External: ${isExternal}`);
                    console.log(`  In Wallet: ${charm.address ? walletAddresses.has(charm.address) : 'N/A'}`);
                    
                    if (isExternal) {
                        externalOutputs.push(charm);
                    } else if (charm.address) {
                        internalOutputs.push(charm);
                    }
                });
                
                console.log('[CharmTxScanner] ==========================================');
                console.log(`[CharmTxScanner] Summary: ${externalOutputs.length} external, ${internalOutputs.length} internal`);
                
                // Determine transaction type based on output pattern
                let transactionType;
                let targetCharm;
                
                if (externalOutputs.length > 0) {
                    // Has external outputs = Transfer (even if there's change back to wallet)
                    transactionType = 'charm_transfer';
                    targetCharm = externalOutputs[0]; // Use first external output
                    console.log('[CharmTxScanner] ✅ External output detected, recording as charm_transfer');
                    if (internalOutputs.length > 0) {
                        console.log(`[CharmTxScanner]    (with ${internalOutputs.length} change output(s) back to wallet)`);
                    }
                } else if (internalOutputs.length > 0) {
                    // All outputs internal = Consolidation
                    transactionType = 'charm_consolidation';
                    targetCharm = internalOutputs[0]; // Use first internal output
                    console.log('[CharmTxScanner] ✅ All outputs internal, recording as charm_consolidation');
                } else {
                    console.log('[CharmTxScanner] ❌ No valid outputs found, skipping');
                    continue;
                }
                
                // Find the charm data for this transaction
                const txCharms = charms.filter(c => c.txid === txid);
                if (txCharms.length === 0) continue;
                
                const firstCharm = txCharms[0];
                
                // Use the targetCharm already determined above
                if (!targetCharm) continue;
                
                // Calculate total amount
                const totalCharmAmount = targetCharm.amount || 0;
                const destinationAddress = targetCharm.address || '';
                
                // Record the transaction
                console.log(`[CharmTxScanner] Recording ${transactionType}:`, txid);
                
                // For consolidations, count actual input and output UTXOs from transaction
                // Decode transaction to count inputs and outputs with 330 sats (charm UTXOs)
                let charmInputCount = 0;
                let charmOutputCount = 0;
                
                try {
                    const tx = bitcoin.default.Transaction.fromHex(txHex);
                    
                    console.log(`[CharmTxScanner] Decoded transaction: ${tx.ins.length} inputs, ${tx.outs.length} outputs`);
                    
                    // Count outputs with 330 sats (charm outputs) - this is reliable
                    charmOutputCount = tx.outs.filter(out => out.value === 330).length;
                    console.log(`[CharmTxScanner] Outputs with 330 sats: ${charmOutputCount}`);
                    
                    // For inputs, try to get from txDetails.vin[].prevout
                    let foundPrevoutData = false;
                    if (txDetails && txDetails.vin) {
                        const inputsWithPrevout = txDetails.vin.filter(input => 
                            input.prevout && input.prevout.value === 330
                        );
                        
                        if (inputsWithPrevout.length > 0) {
                            charmInputCount = inputsWithPrevout.length;
                            foundPrevoutData = true;
                            console.log(`[CharmTxScanner] Inputs with 330 sats (from prevout): ${charmInputCount}`);
                        }
                    }
                    
                    // If no prevout data, for consolidations we can estimate:
                    // Total input value = (outputs value) + fee
                    // If outputs are mostly 330 sats charms, inputs are likely charms too
                    if (!foundPrevoutData && transactionType === 'charm_consolidation') {
                        // Calculate total output value
                        const totalOutputValue = tx.outs.reduce((sum, out) => sum + out.value, 0);
                        const estimatedFee = 330; // Typical fee
                        const estimatedInputValue = totalOutputValue + estimatedFee;
                        
                        // Estimate number of 330 sat inputs
                        charmInputCount = Math.round(estimatedInputValue / 330);
                        
                        // Sanity check: can't be more than total inputs
                        if (charmInputCount > tx.ins.length) {
                            charmInputCount = tx.ins.length;
                        }
                        
                        console.log(`[CharmTxScanner] Estimated charm inputs (no prevout data): ${charmInputCount} (from ${tx.ins.length} total inputs)`);
                        console.log(`[CharmTxScanner]   Total output value: ${totalOutputValue} sats`);
                        console.log(`[CharmTxScanner]   Estimated input value: ${estimatedInputValue} sats`);
                    }
                } catch (decodeError) {
                    console.warn('[CharmTxScanner] Failed to decode transaction:', decodeError.message);
                    charmInputCount = txCharms.length; // Fallback to charm count
                    charmOutputCount = result.charms.length || 0;
                }
                
                const inputUtxoCount = transactionType === 'charm_consolidation' ? charmInputCount : undefined;
                const outputUtxoCount = transactionType === 'charm_consolidation' ? charmOutputCount : undefined;
                
                console.log(`[CharmTxScanner] ========== UTXO COUNTS ==========`);
                console.log(`[CharmTxScanner] Transaction type: ${transactionType}`);
                console.log(`[CharmTxScanner] Charm inputs: ${charmInputCount}`);
                console.log(`[CharmTxScanner] Charm outputs: ${charmOutputCount}`);
                console.log(`[CharmTxScanner] Will save: inputUtxoCount=${inputUtxoCount}, outputUtxoCount=${outputUtxoCount}`);
                console.log(`[CharmTxScanner] ====================================`);
                
                await recordSentTransaction({
                    id: `tx_${txid}_${transactionType}`,
                    txid: txid,
                    type: transactionType,
                    amount: 330, // Typical charm output value
                    fee: 330,
                    timestamp: Date.now(), // We don't have exact timestamp, use current
                    status: 'confirmed', // Historical transactions are confirmed
                    addresses: {
                        from: txCharms.map(c => c.address).filter(Boolean),
                        to: [destinationAddress]
                    },
                    metadata: {
                        isCharmTransfer: transactionType === 'charm_transfer',
                        isCharmConsolidation: transactionType === 'charm_consolidation',
                        charmAmount: totalCharmAmount,
                        charmName: firstCharm.name || firstCharm.metadata?.name || 'Charm',
                        ticker: firstCharm.ticker || firstCharm.metadata?.ticker || 'CHARM',
                        // Consolidation details
                        inputUtxoCount,
                        outputUtxoCount
                    }
                }, blockchain, network);
                
                console.log(`[CharmTxScanner] Successfully recorded ${transactionType}:`, txid);
                
            } catch (error) {
                // Continue with next transaction on error
                console.warn(`[CharmTxScanner] Failed to process ${txid}:`, error.message);
            }
        }
    } catch (error) {
        console.error('[CharmTxScanner] Error scanning charm transactions:', error);
    }
}
