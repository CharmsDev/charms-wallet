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
    
    try {
        const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
        const { extractAndVerifySpell } = await import('charms-js');
        const bitcoin = await import('bitcoinjs-lib');
        
        // Get recordSentTransaction if not provided
        if (!recordSentTransaction) {
            const { useTransactionStore } = await import('@/stores/transactionStore');
            recordSentTransaction = useTransactionStore.getState().recordSentTransaction;
            if (!recordSentTransaction) {
                return;
            }
        }
        
        // Get wallet addresses if not provided
        if (!walletAddresses) {
            const { useAddresses } = await import('@/stores/addressesStore');
            const addressStore = useAddresses.getState();
            walletAddresses = new Set(addressStore?.addresses?.map(a => a.address) || []);
        }
        
        
        // Get unique transaction IDs from charms
        const txIds = [...new Set(charms.map(c => c.txid))];
        
        for (const txid of txIds) {
            try {
                // Get transaction details with prevout data for accurate fee calculation
                const txDetails = await bitcoinApiRouter.getTransactionWithPrevout(txid, network);
                if (!txDetails) {
                    continue;
                }
                
                
                if (txDetails.tx?.vin && txDetails.tx.vin.length > 0) {
                }
                
                // Get transaction hex
                const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
                if (!txHex) {
                    continue;
                }
                
                // Extract spell data
                const result = await extractAndVerifySpell(txHex, network);
                
                if (!result.success || !result.charms || result.charms.length === 0) {
                    continue;
                }
                
                // Analyze charm outputs to determine transaction type
                
                const externalOutputs = [];
                const internalOutputs = [];
                
                result.charms.forEach((charm, index) => {
                    const isExternal = charm.address && !walletAddresses.has(charm.address);
                    
                    if (isExternal) {
                        externalOutputs.push(charm);
                    } else if (charm.address) {
                        internalOutputs.push(charm);
                    }
                });
                
                
                // Decode transaction to count inputs (needed for type detection)
                let totalInputs = 0;
                let charmInputsCount = 0;
                try {
                    const tx = bitcoin.default.Transaction.fromHex(txHex);
                    totalInputs = tx.ins.length;
                    
                    // CRITICAL: Check if inputs contain charms (330 or 1000 sats)
                    // This distinguishes MINT (no charm inputs) from SELF-TRANSFER (has charm inputs)
                    if (txDetails?.tx?.vin) {
                        charmInputsCount = txDetails.tx.vin.filter(input => 
                            input.prevout && (input.prevout.value === 330 || input.prevout.value === 1000)
                        ).length;
                    }
                } catch (e) {
                }
                
                // Determine transaction type based on output pattern and input count
                let transactionType;
                let targetCharm;
                
                if (externalOutputs.length > 0) {
                    // Has external outputs = Transfer (even if there's change back to wallet)
                    transactionType = 'charm_transfer';
                    targetCharm = externalOutputs[0]; // Use first external output
                    if (internalOutputs.length > 0) {
                    }
                } else if (internalOutputs.length > 0) {
                    // All outputs internal - check if this is a real charm transaction
                    // CRITICAL FIX: Only classify as charm transaction if inputs contain charms
                    // This prevents MINT transactions from being classified as self-transfers
                    if (charmInputsCount === 0) {
                        // No charm inputs = This is a MINT, not a charm transfer
                        // Skip this transaction (don't record it as a charm transaction)
                        continue;
                    }
                    
                    // Has charm inputs - determine if consolidation or self-transfer
                    if (charmInputsCount > 1) {
                        // Multiple charm inputs = Consolidation
                        transactionType = 'charm_consolidation';
                        targetCharm = internalOutputs[0];
                    } else {
                        // Single charm input = Self-transfer
                        transactionType = 'charm_self_transfer';
                        targetCharm = internalOutputs[0];
                    }
                } else {
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
                
                // For consolidations, count actual input and output UTXOs from transaction
                // Decode transaction to count inputs and outputs with 330 sats (charm UTXOs)
                let charmInputCount = 0;
                let charmOutputCount = 0;
                let actualFee = 330; // Default fallback
                
                try {
                    const tx = bitcoin.default.Transaction.fromHex(txHex);
                    
                    
                    // Calculate total output value
                    const totalOutputValue = tx.outs.reduce((sum, out) => sum + out.value, 0);
                    
                    // Count outputs with 330 sats (charm outputs) - this is reliable
                    charmOutputCount = tx.outs.filter(out => out.value === 330).length;
                    
                    // For inputs, try to get from txDetails.vin[].prevout
                    let foundPrevoutData = false;
                    let totalInputValue = 0;
                    
                    
                    if (txDetails?.tx?.vin) {
                        // Log all inputs with their prevout data
                        txDetails.tx.vin.forEach((input, index) => {
                        });
                        
                        const inputsWithPrevout = txDetails.tx.vin.filter(input => 
                            input.prevout && input.prevout.value === 330
                        );
                        
                        
                        if (inputsWithPrevout.length > 0) {
                            charmInputCount = inputsWithPrevout.length;
                            foundPrevoutData = true;
                        }
                        
                        // Calculate total input value if we have prevout data
                        const inputsWithValue = txDetails.tx.vin.filter(input => input.prevout && input.prevout.value);
                        
                        if (inputsWithValue.length === txDetails.tx.vin.length) {
                            totalInputValue = txDetails.tx.vin.reduce((sum, input) => sum + (input.prevout?.value || 0), 0);
                            actualFee = totalInputValue - totalOutputValue;
                        } else {
                        }
                    }
                    
                    // If no prevout data, for consolidations we can estimate:
                    // Total input value = (outputs value) + fee
                    // If outputs are mostly 330 sats charms, inputs are likely charms too
                    if (!foundPrevoutData && transactionType === 'charm_consolidation') {
                        const estimatedFee = 330; // Typical fee for estimation only
                        const estimatedInputValue = totalOutputValue + estimatedFee;
                        
                        // Estimate number of 330 sat inputs
                        charmInputCount = Math.round(estimatedInputValue / 330);
                        
                        // Sanity check: can't be more than total inputs
                        if (charmInputCount > tx.ins.length) {
                            charmInputCount = tx.ins.length;
                        }
                        
                    }
                } catch (decodeError) {
                    charmInputCount = txCharms.length; // Fallback to charm count
                    charmOutputCount = result.charms.length || 0;
                }
                
                // Only save UTXO counts for consolidations (2+ inputs)
                const inputUtxoCount = transactionType === 'charm_consolidation' ? charmInputCount : undefined;
                const outputUtxoCount = transactionType === 'charm_consolidation' ? charmOutputCount : undefined;
                
                
                await recordSentTransaction({
                    id: `tx_${txid}_${transactionType}`,
                    txid: txid,
                    type: transactionType,
                    amount: 330, // Typical charm output value
                    fee: actualFee,
                    timestamp: Date.now(), // We don't have exact timestamp, use current
                    status: 'confirmed', // Historical transactions are confirmed
                    addresses: {
                        from: txCharms.map(c => c.address).filter(Boolean),
                        to: [destinationAddress]
                    },
                    metadata: {
                        isCharmTransfer: transactionType === 'charm_transfer',
                        isCharmConsolidation: transactionType === 'charm_consolidation',
                        isCharmSelfTransfer: transactionType === 'charm_self_transfer',
                        charmAmount: totalCharmAmount,
                        charmName: firstCharm.name || firstCharm.metadata?.name || 'Charm',
                        ticker: firstCharm.ticker || firstCharm.metadata?.ticker || 'CHARM',
                        // Consolidation details
                        inputUtxoCount,
                        outputUtxoCount
                    }
                }, blockchain, network);
                
                
            } catch (error) {
                // Continue with next transaction on error
            }
        }
    } catch (error) {
    }
}
