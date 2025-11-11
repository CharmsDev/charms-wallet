'use client';

import { getTransactionLabel } from '@/services/transactions/transaction-classifier';

export default function TransactionDetailsModal({ transaction, network, onClose }) {
    if (!transaction) return null;

    const formatBTC = (satoshis) => {
        const btc = satoshis / 100000000;
        return btc.toFixed(8);
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'confirmed': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            case 'failed': return 'text-red-400';
            default: return 'text-dark-400';
        }
    };

    const openInMempool = () => {
        const baseUrl = network === 'mainnet'
            ? 'https://mempool.space'
            : 'https://mempool.space/testnet4';
        const url = `${baseUrl}/tx/${transaction.txid}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-dark-900 border border-dark-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 bg-dark-900 border-b border-dark-700 p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold gradient-text">Transaction Details</h2>
                    <button
                        onClick={onClose}
                        className="text-dark-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Transaction Type & Status */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div>
                                <p className="text-lg font-semibold text-white">
                                    {getTransactionLabel(transaction.type)}
                                </p>
                                <p className={`text-sm ${getStatusColor(transaction.status)}`}>
                                    {transaction.status}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            {(transaction.metadata?.isCharmTransfer || transaction.metadata?.isCharmConsolidation || transaction.metadata?.isCharmSelfTransfer) ? (
                                <>
                                    <p className="text-2xl font-bold text-blue-400">
                                        {(transaction.metadata.charmAmount / 100000000).toLocaleString()} {transaction.metadata.ticker || 'tokens'}
                                    </p>
                                    {transaction.fee && (
                                        <p className="text-sm text-dark-400">Fee: {formatBTC(transaction.fee)} BTC</p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className={`text-2xl font-bold ${transaction.type === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                                        {transaction.type === 'received' ? '+' : '-'}{formatBTC(transaction.amount)} BTC
                                    </p>
                                    {transaction.fee && (
                                        <p className="text-sm text-dark-400">Fee: {formatBTC(transaction.fee)} BTC</p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Transaction ID */}
                    <div className="bg-dark-800 rounded-lg p-4">
                        <p className="text-sm text-dark-400 mb-2">Transaction ID</p>
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-mono text-white break-all flex-1">{transaction.txid}</p>
                            <button
                                onClick={() => navigator.clipboard.writeText(transaction.txid)}
                                className="text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0"
                                title="Copy to clipboard"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Charm/Token Details */}
                    {(transaction.metadata?.isCharmTransfer || transaction.metadata?.isCharmConsolidation || transaction.metadata?.isCharmSelfTransfer) && (
                        <div className="bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border border-blue-700/30 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">
                                    {transaction.metadata.isCharmConsolidation ? '🔄' : 
                                     transaction.metadata.isCharmSelfTransfer ? '↻' : '🎁'}
                                </span>
                                <p className="text-lg font-semibold text-blue-400">
                                    {transaction.metadata.isCharmConsolidation ? 'Charm Consolidation Details' : 
                                     transaction.metadata.isCharmSelfTransfer ? 'Charm Self-Transfer Details' : 
                                     'Charm Transfer Details'}
                                </p>
                            </div>
                            
                            {/* Consolidation-specific info */}
                            {transaction.metadata.isCharmConsolidation && (
                                <>
                                    {transaction.metadata.inputUtxoCount && transaction.metadata.outputUtxoCount && (
                                        <div className="bg-dark-900/50 rounded-lg p-4 mb-3 border border-cyan-700/20">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-center flex-1">
                                                    <p className="text-xs text-dark-400 mb-1">Input UTXOs</p>
                                                    <p className="text-2xl font-bold text-orange-400">{transaction.metadata.inputUtxoCount}</p>
                                                </div>
                                                <div className="text-cyan-400 text-2xl px-4">→</div>
                                                <div className="text-center flex-1">
                                                    <p className="text-xs text-dark-400 mb-1">Output UTXOs</p>
                                                    <p className="text-2xl font-bold text-green-400">{transaction.metadata.outputUtxoCount}</p>
                                                </div>
                                            </div>
                                            <p className="text-xs text-center text-cyan-400 mb-3">
                                                Consolidated {transaction.metadata.inputUtxoCount} charm UTXO{transaction.metadata.inputUtxoCount > 1 ? 's' : ''} into {transaction.metadata.outputUtxoCount}
                                            </p>
                                            {/* Bitcoin Recovered */}
                                            {(() => {
                                                const inputBtc = transaction.metadata.inputUtxoCount * 330;
                                                const outputBtc = transaction.metadata.outputUtxoCount * 330;
                                                const recovered = inputBtc - outputBtc;
                                                const netRecovered = recovered - (transaction.fee || 0);
                                                if (recovered > 0) {
                                                    return (
                                                        <div className="bg-green-900/20 rounded p-2 border border-green-700/30">
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-dark-400">Bitcoin Recovered:</span>
                                                                <span className="text-green-400 font-semibold">{formatBTC(recovered)} BTC</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-xs mt-1">
                                                                <span className="text-dark-400">After Fee:</span>
                                                                <span className="text-green-300 font-semibold">{formatBTC(netRecovered)} BTC</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    )}
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs text-dark-400 mb-1">Token</p>
                                            <p className="text-white font-semibold">
                                                ${transaction.metadata.ticker || 'CHARM'}
                                            </p>
                                        </div>
                                        {transaction.metadata.charmName && (
                                            <div>
                                                <p className="text-xs text-dark-400 mb-1">Charm Name</p>
                                                <p className="text-white">{transaction.metadata.charmName}</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                            
                            {/* Transfer-specific info */}
                            {transaction.metadata.isCharmTransfer && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-xs text-dark-400 mb-1">Token</p>
                                        <p className="text-white font-semibold">
                                            ${transaction.metadata.ticker || 'CHARM'}
                                        </p>
                                    </div>
                                    {transaction.metadata.charmName && (
                                        <div>
                                            <p className="text-xs text-dark-400 mb-1">Charm Name</p>
                                            <p className="text-white">{transaction.metadata.charmName}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Self-transfer info */}
                            {transaction.metadata.isCharmSelfTransfer && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-xs text-dark-400 mb-1">Token</p>
                                        <p className="text-white font-semibold">
                                            ${transaction.metadata.ticker || 'CHARM'}
                                        </p>
                                    </div>
                                    {transaction.metadata.charmName && (
                                        <div>
                                            <p className="text-xs text-dark-400 mb-1">Charm Name</p>
                                            <p className="text-white">{transaction.metadata.charmName}</p>
                                        </div>
                                    )}
                                    <div className="col-span-2">
                                        <p className="text-xs text-cyan-400 text-center">
                                            Moved 1 charm UTXO to another wallet address
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Timestamp & Block Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-dark-800 rounded-lg p-4">
                            <p className="text-sm text-dark-400 mb-1">Date & Time</p>
                            <p className="text-white">{formatDate(transaction.timestamp)}</p>
                        </div>
                        {transaction.blockHeight && (
                            <div className="bg-dark-800 rounded-lg p-4">
                                <p className="text-sm text-dark-400 mb-1">Block Height</p>
                                <p className="text-white">{transaction.blockHeight.toLocaleString()}</p>
                            </div>
                        )}
                        {transaction.confirmations && (
                            <div className="bg-dark-800 rounded-lg p-4">
                                <p className="text-sm text-dark-400 mb-1">Confirmations</p>
                                <p className="text-white">{transaction.confirmations}</p>
                            </div>
                        )}
                    </div>

                    {/* Inputs */}
                    {transaction.inputs && transaction.inputs.length > 0 && (
                        <div className="bg-dark-800 rounded-lg p-4">
                            <p className="text-sm text-dark-400 mb-3">Inputs ({transaction.inputs.length})</p>
                            <div className="space-y-3">
                                {transaction.inputs.map((input, index) => (
                                    <div key={index} className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                                        <div className="flex justify-between items-start gap-3 mb-2">
                                            <p className="text-xs text-dark-400">Input #{index}</p>
                                            {input.value && (
                                                <p className="text-sm font-semibold text-orange-400">
                                                    {formatBTC(input.value)} BTC
                                                </p>
                                            )}
                                        </div>
                                        {input.address && (
                                            <p className="text-xs font-mono text-dark-300 break-all mb-1">{input.address}</p>
                                        )}
                                        <p className="text-xs text-dark-500 font-mono break-all">
                                            {input.txid}:{input.vout}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Outputs */}
                    {transaction.outputs && transaction.outputs.length > 0 && (
                        <div className="bg-dark-800 rounded-lg p-4">
                            <p className="text-sm text-dark-400 mb-3">
                                Outputs ({transaction.outputs.length})
                            </p>
                            <div className="space-y-3">
                                {transaction.outputs.map((output, index) => (
                                    <div key={index} className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                                        <div className="flex justify-between items-start gap-3 mb-2">
                                            <p className="text-xs text-dark-400">Output #{output.vout !== undefined ? output.vout : index}</p>
                                            <p className="text-sm font-semibold text-green-400">
                                                {formatBTC(output.amount)} BTC
                                            </p>
                                        </div>
                                        <p className="text-xs font-mono text-dark-300 break-all">{output.address}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* View on Mempool Button */}
                    <button
                        onClick={openInMempool}
                        className="w-full btn bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View on Mempool.space
                    </button>
                </div>
            </div>
        </div>
    );
}
