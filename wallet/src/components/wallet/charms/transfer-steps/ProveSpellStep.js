'use client';

import { useState, useEffect } from 'react';
import { useNetwork } from '@/contexts/NetworkContext';
import { transferCharmService } from '@/services/charms/transfer';
import { proverService } from '@/services/prover';
import { useUTXOs } from '@/stores/utxoStore';

export default function ProveSpellStep({
    charm,
    destinationAddress,
    transferAmount,
    finalSpell,
    addLogMessage,
    setCommitTxHex,
    setSpellTxHex,
    setTransactionResult,
    commitTxHex,
    spellTxHex,
    handleNext
}) {
    const { activeNetwork } = useNetwork();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [highestUtxo, setHighestUtxo] = useState(null);
    const [hasScanned, setHasScanned] = useState(false); // Track if we've scanned
    const { utxos } = useUTXOs();

    // Find suitable funding UTXO
    // Optimization: Stop scanning when we find a valid UTXO (>= MIN_FUNDING_AMOUNT)
    // Only run ONCE when UTXOs are available
    useEffect(() => {
        // Skip if we already scanned
        if (hasScanned) {
            return;
        }

        // Skip if no UTXOs available yet
        if (!utxos || Object.keys(utxos).length === 0) {
            return;
        }

        const MIN_FUNDING_AMOUNT = 1000; // Minimum sats needed for funding
        let selectedUtxo = null;
        let maxValue = 0;

        // Early exit optimization: stop when we find a suitable UTXO
        outerLoop: for (const [address, addressUtxos] of Object.entries(utxos)) {
            for (const utxo of addressUtxos) {
                // Track highest value UTXO
                if (utxo.value > maxValue) {
                    maxValue = utxo.value;
                    selectedUtxo = {
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.value,
                        address
                    };
                    
                    // Optimization: If we found a valid UTXO, we can stop scanning
                    // This is safe because we only need ONE funding UTXO
                    if (utxo.value >= MIN_FUNDING_AMOUNT) {
                        break outerLoop;
                    }
                }
            }
        }

        if (selectedUtxo) {
            setHighestUtxo(selectedUtxo);
        }
        
        // Mark as scanned to prevent re-scanning
        setHasScanned(true);
    }, [utxos, hasScanned]); // Run when UTXOs are available, but only once

    // Generate charm transfer transactions using new prover service
    const createTransferTransactions = async () => {
        setIsLoading(true);
        setError(null);

        try {
            addLogMessage(`Initiating transfer of ${transferAmount} charms to ${destinationAddress}...`);

            // Verify funding UTXO availability
            if (!highestUtxo) {
                const errorMsg = "No suitable funding UTXO found. Please ensure you have Bitcoin UTXOs available in your wallet.";
                setError(errorMsg);
                addLogMessage(`Error: ${errorMsg}`);
                setIsLoading(false);
                return;
            }

            // Get all available UTXOs for retry logic
            const availableUtxos = [];
            for (const [address, addressUtxos] of Object.entries(utxos)) {
                for (const utxo of addressUtxos) {
                    if (utxo.value >= 1000) { // Minimum funding amount
                        availableUtxos.push({
                            txid: utxo.txid,
                            vout: utxo.vout,
                            value: utxo.value,
                            address
                        });
                    }
                }
            }

            // Sort by value (highest first)
            availableUtxos.sort((a, b) => b.value - a.value);

            if (availableUtxos.length === 0) {
                const errorMsg = "No suitable funding UTXOs found.";
                setError(errorMsg);
                addLogMessage(`Error: ${errorMsg}`);
                setIsLoading(false);
                return;
            }

            // Try with different UTXOs if we get duplicate funding UTXO error
            let lastError = null;
            for (let i = 0; i < Math.min(availableUtxos.length, 3); i++) {
                const fundingUtxo = availableUtxos[i];

                if (i > 0) {
                    addLogMessage(`⚠️ Retrying with different funding UTXO (attempt ${i + 1})...`);
                }

                addLogMessage(`Using funding UTXO: ${fundingUtxo.txid}:${fundingUtxo.vout} with amount: ${fundingUtxo.value} sats`);
                addLogMessage(`Change address will be: ${fundingUtxo.address}`);

                try {
                    // Status callback for prover progress
                    const onProverStatus = (status) => {
                        if (status.phase === 'generating_payload') {
                            addLogMessage('📦 Generating prover payload...');
                        } else if (status.phase === 'sending_to_prover') {
                            addLogMessage('🚀 Sending to prover API...');
                        } else if (status.phase === 'prover_attempt') {
                            addLogMessage(`🔄 Prover API attempt ${status.attempt}...`);
                        } else if (status.phase === 'prover_retry') {
                            addLogMessage(`⏳ Retrying prover API (attempt ${status.attempt})...`);
                        } else if (status.phase === 'prover_success') {
                            addLogMessage(`✅ Prover API succeeded!`);
                        } else if (status.phase === 'complete') {
                            addLogMessage('✅ Proving complete!');
                        } else if (status.phase === 'error') {
                            addLogMessage(`❌ Error: ${status.message}`);
                        }
                    };

                    // Use new prover service
                    addLogMessage('🔮 Calling prover service...');
                    const result = await proverService.proveTransfer(
                        finalSpell,
                        fundingUtxo,
                        activeNetwork,
                        1, // fee rate
                        onProverStatus
                    );

                    addLogMessage(`Commit TX: ${result.transactions.commit_tx.substring(0, 64)}...`);
                    addLogMessage(`Spell TX: ${result.transactions.spell_tx.substring(0, 64)}...`);

                    // Set transaction hex values
                    setCommitTxHex(result.transactions.commit_tx);
                    setSpellTxHex(result.transactions.spell_tx);
                    setTransactionResult(result);

                    addLogMessage('✅ Transactions ready for signing');

                    // Auto-advance to next step
                    if (handleNext) {
                        setTimeout(() => {
                            handleNext();
                        }, 500); // Small delay to ensure state updates are processed
                    }

                    return result;
                } catch (attemptError) {
                    lastError = attemptError;
                    
                    // Check if it's the duplicate funding UTXO error
                    const isDuplicateFundingError = attemptError.message && 
                        attemptError.message.includes('duplicate funding UTXO spend');
                    
                    if (isDuplicateFundingError) {
                        addLogMessage(`⚠️ Duplicate funding UTXO detected. Trying next UTXO...`);
                        // Continue to next iteration
                        continue;
                    } else {
                        // For other errors, throw immediately
                        throw attemptError;
                    }
                }
            }

            // If we exhausted all UTXOs, throw the last error
            if (lastError) {
                throw lastError;
            }
        } catch (error) {
            setError(error.message);
            addLogMessage(`Error creating transactions: ${error.message}`);

            // Check network errors
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the prover API server is running');
            }

            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // Check button state
    const buttonDisabled = isLoading || !finalSpell || commitTxHex || !highestUtxo;

    return (
        <div className="space-y-6">
            {/* Prominent Call-to-Action Button */}
            {!commitTxHex && highestUtxo && finalSpell && (
                <div className="bg-primary-900/20 border-2 border-primary-500 rounded-xl p-6 text-center animate-pulse">
                    <h4 className="text-xl font-bold text-primary-400 mb-3">Ready to Create Transactions</h4>
                    <p className="text-dark-300 mb-4">Click the button below to generate the commit and spell transactions.</p>
                    <button
                        onClick={createTransferTransactions}
                        disabled={buttonDisabled}
                        className={`px-8 py-4 text-lg font-bold rounded-lg ${buttonDisabled
                            ? 'bg-dark-600 cursor-not-allowed text-dark-400'
                            : 'bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/50'
                            }`}
                    >
                        {isLoading ? '⏳ Creating Transactions...' : '🚀 Create Transactions'}
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center">
                <div>
                    <h4 className="font-bold gradient-text">Prove Spell</h4>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/30 p-4 rounded-lg border border-red-800 text-red-400">
                    <h5 className="font-medium mb-2">Error</h5>
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="glass-effect p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-4">
                    This step creates the transactions needed to transfer your charm. Click the button above to generate the transactions.
                </p>

                {/* Funding UTXO Details */}
                <div className="mb-4 p-3 bg-blue-900/20 rounded-md border border-blue-800/50">
                    <h5 className="text-sm font-medium text-blue-400 mb-1">Funding UTXO Information</h5>
                    {highestUtxo ? (
                        <div className="text-xs font-mono">
                            <div className="mb-1">
                                <span className="text-blue-400">UTXO ID:</span>
                                <div className="text-white break-all mt-1">{highestUtxo.txid}:{highestUtxo.vout}</div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-blue-400">Amount:</span>
                                <span className="text-white font-semibold">{highestUtxo.value} sats</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs font-mono">
                            <div className="mb-1">
                                <span className="text-blue-400">UTXO ID:</span>
                                <div className="text-white break-all mt-1">{charm.txid}:{charm.outputIndex}</div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-blue-400">Amount:</span>
                                <span className="text-white font-semibold">{charm.amount.remaining} {charm.amount.ticker}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* auto-proceeding to next step */}

                {!commitTxHex && !isLoading && (
                    <div className="text-center py-8">
                        <p className="text-dark-300">
                            {highestUtxo ? 'No transactions created yet.' : 'No suitable funding UTXO found.'}
                        </p>
                        <p className="text-dark-400 text-sm mt-2">
                            {highestUtxo
                                ? 'Click the "Create Transactions" button to generate the transactions.'
                                : 'Ensure you have Bitcoin UTXOs available in your wallet.'}
                        </p>
                    </div>
                )}

                {isLoading && (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
                        <p className="mt-2 text-dark-300">Proving spell transfer, please wait.</p>
                        <p className="mt-1 text-dark-400 text-sm">This process can take up to 10 minutes or more.</p>
                        <p className="mt-1 text-dark-400 text-sm">You will need to sign the tx after.</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                <h5 className="font-medium text-blue-400 mb-2">Information</h5>
                <p className="text-sm text-blue-300">
                    The transfer process requires two transactions: a commit transaction and a spell transaction.
                    The commit transaction locks the funds, and the spell transaction executes the charm transfer.
                </p>
            </div>
        </div>
    );
}
