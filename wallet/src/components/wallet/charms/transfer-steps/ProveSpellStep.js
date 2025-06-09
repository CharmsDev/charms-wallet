'use client';

import { useState, useEffect } from 'react';
import { transferCharmService } from '@/services/charms/transfer';
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [highestUtxo, setHighestUtxo] = useState(null);
    const { utxos } = useUTXOs();

    // Find UTXO with highest value
    useEffect(() => {
        let maxUtxo = null;
        let maxValue = 0;

        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            addressUtxos.forEach(utxo => {
                if (utxo.value > maxValue) {
                    maxValue = utxo.value;
                    maxUtxo = {
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.value,
                        address
                    };
                }
            });
        });

        setHighestUtxo(maxUtxo);
    }, [utxos]);

    // Generate charm transfer transactions
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

            // Select highest value UTXO
            const fundingUtxo = highestUtxo;

            addLogMessage(`Using funding UTXO: ${fundingUtxo.txid}:${fundingUtxo.vout} with amount: ${fundingUtxo.value} sats`);
            addLogMessage(`Change address will be: ${fundingUtxo.address}`);


            // Create transactions using service
            const result = await transferCharmService.createTransferCharmTxs(
                finalSpell,
                fundingUtxo // entire object
            );

            // Store transaction data
            setCommitTxHex(result.transactions.commit_tx);
            setSpellTxHex(result.transactions.spell_tx);
            setTransactionResult(result);

            addLogMessage('Transactions created successfully!');

            // Auto-advance to next step
            if (handleNext) {
                setTimeout(() => {
                    handleNext();
                }, 500); // Small delay to ensure state updates are processed
            }

            return result;
        } catch (error) {
            setError(error.message);
            addLogMessage(`Error creating transactions: ${error.message}`);

            // Check network errors
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the API server is running');
            }

            return null;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h4 className="font-bold gradient-text">Prove Spell</h4>
                </div>
                <button
                    onClick={createTransferTransactions}
                    // Disable button when appropriate
                    disabled={isLoading || !finalSpell || commitTxHex || !highestUtxo}
                    className={`px-4 py-2 rounded-lg ${isLoading || !finalSpell || commitTxHex || !highestUtxo
                        ? 'bg-dark-600 cursor-not-allowed text-dark-400'
                        : 'bg-primary-500 text-white hover:bg-primary-600'
                        }`}
                >
                    {isLoading ? 'Creating...' : commitTxHex ? 'Created' : 'Create Transactions'}
                </button>
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
