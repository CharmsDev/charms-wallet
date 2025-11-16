'use client';

import { getTransactionLabel, getTransactionIcon } from '@/services/transactions/transaction-classifier';
import { formatBTC, formatDetailedDate } from '@/utils/formatters';
import BitcoinTransaction from '../history/components/transaction-types/BitcoinTransaction';
import CharmTransaction from '../history/components/transaction-types/CharmTransaction';
import BroTransaction from '../history/components/transaction-types/BroTransaction';

/**
 * Reusable transaction detail component for displaying comprehensive transaction information
 * Supports all transaction types with specialized rendering for Bitcoin, Charm, and BRO tokens
 * Used across History page and Dashboard modal for consistent presentation
 */
export default function TransactionDetailView({ transaction, network, compact = false }) {
    if (!transaction) {
        return (
            <div className="text-center py-8">
                <div className="text-6xl mb-4">📄</div>
                <p className="text-dark-400 font-medium">No transaction selected</p>
            </div>
        );
    }

    const getExplorerUrl = (txid) => {
        if (network === 'mainnet') {
            return `https://mempool.space/tx/${txid}`;
        } else if (network === 'testnet4') {
            return `https://mempool.space/testnet4/tx/${txid}`;
        }
        return `https://mempool.space/testnet/tx/${txid}`;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'confirmed': return 'text-green-400 bg-green-500/20';
            case 'pending': return 'text-yellow-400 bg-yellow-500/20';
            case 'failed': return 'text-red-400 bg-red-500/20';
            default: return 'text-dark-400 bg-dark-500/20';
        }
    };

    const getIconStyle = (type) => {
        switch (type) {
            case 'sent':
                return 'bg-red-500/20 text-red-400';
            case 'received':
                return 'bg-green-500/20 text-green-400';
            case 'bro_mining':
                return 'bg-orange-500/20 text-orange-400';
            case 'bro_mint':
                return 'bg-purple-500/20 text-purple-400';
            case 'charm_received':
                return 'bg-green-500/20 text-green-400';
            case 'charm_sent':
                return 'bg-red-500/20 text-red-400';
            case 'charm_consolidation':
                return 'bg-cyan-500/20 text-cyan-400';
            case 'charm_self_transfer':
                return 'bg-blue-500/20 text-blue-400';
            default:
                return 'bg-dark-500/20 text-dark-400';
        }
    };

    const isCharmTransaction = (tx) => {
        return ['charm_received', 'charm_sent', 'charm_transfer', 'charm_consolidation', 'charm_self_transfer', 'bro_mint', 'bro_mining'].includes(tx.type);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="space-y-6">
            {/* Header with Title and Amount */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${getIconStyle(transaction.type)}`}>
                        <span className="text-3xl">{getTransactionIcon(transaction.type)}</span>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {getTransactionLabel(transaction.type)}
                        </h2>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(transaction.status)}`}>
                                {transaction.status}
                            </span>
                            {transaction.charmTokenData?.tokenTicker && (
                                <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400">
                                    {transaction.charmTokenData.tokenTicker}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Amount - Top Right */}
                <div className="text-right">
                    {isCharmTransaction(transaction) && transaction.charmTokenData ? (
                        <>
                            <p className={`text-2xl font-bold ${
                                transaction.type === 'charm_received' ? 'text-green-400' : 
                                transaction.type === 'charm_sent' ? 'text-red-400' : 
                                'text-purple-400'
                            }`}>
                                {transaction.type === 'charm_received' ? '+' : transaction.type === 'charm_sent' ? '-' : ''}
                                {transaction.charmTokenData.tokenAmount.toLocaleString(undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 8
                                })}
                            </p>
                            <p className="text-sm text-dark-400 mt-1">
                                {transaction.charmTokenData.tokenTicker}
                            </p>
                        </>
                    ) : !isCharmTransaction(transaction) ? (
                        <>
                            <p className={`text-2xl font-bold ${
                                transaction.type === 'received' ? 'text-green-400' : 'text-red-400'
                            }`}>
                                {transaction.type === 'received' ? '+' : '-'}{formatBTC(transaction.amount)}
                            </p>
                            <p className="text-sm text-dark-400 mt-1">BTC</p>
                        </>
                    ) : (
                        <p className="text-xl font-bold text-dark-400">-</p>
                    )}
                </div>
            </div>

            {/* Transaction Details Box */}
            <div className="glass-effect p-4 rounded-lg space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-dark-700 pb-2">Transaction Details</h3>

                {/* TXID */}
                <DetailRow label="Transaction ID">
                    <div className="flex items-center gap-2">
                        <code className="text-sm text-primary-400 break-all font-mono">
                            {transaction.txid}
                        </code>
                        <button
                            onClick={() => copyToClipboard(transaction.txid)}
                            className="flex-shrink-0 p-1 hover:bg-dark-700 rounded transition-colors"
                            title="Copy TXID"
                        >
                            <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
                    </div>
                </DetailRow>

                {/* Date */}
                <DetailRow label="Date & Time">
                    <span className="text-white">{formatDetailedDate(transaction.timestamp)}</span>
                </DetailRow>

                {/* Block Height */}
                {transaction.blockHeight && (
                    <DetailRow label="Block Height">
                        <span className="text-white">{transaction.blockHeight.toLocaleString()}</span>
                    </DetailRow>
                )}

                {/* Type-specific transaction details - only for Bitcoin */}
                {(transaction.type === 'sent' || transaction.type === 'received') && (
                    <BitcoinTransaction 
                        transaction={transaction}
                        formatBTC={formatBTC}
                        DetailRow={DetailRow}
                        copyToClipboard={copyToClipboard}
                    />
                )}

            </div>

            {/* Token Information Box - Separate for Charm transactions */}
            {(transaction.type === 'charm_received' || 
              transaction.type === 'charm_sent' || 
              transaction.type === 'charm_consolidation' || 
              transaction.type === 'charm_self_transfer') && (
                <CharmTransaction 
                    transaction={transaction}
                    copyToClipboard={copyToClipboard}
                />
            )}

            {/* Token Information Box - Separate for BRO transactions */}
            {(transaction.type === 'bro_mining' || transaction.type === 'bro_mint') && (
                <BroTransaction 
                    transaction={transaction}
                    copyToClipboard={copyToClipboard}
                />
            )}

            {/* Inputs */}
            {transaction.inputs && transaction.inputs.length > 0 && !compact && (
                <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                        Inputs ({transaction.inputs.length})
                    </h3>
                    <div className="glass-effect p-3 rounded-lg space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {transaction.inputs.map((input, index) => (
                            <div key={index} className="text-sm">
                                <div className="flex items-center justify-between">
                                    <code className="text-primary-400 text-xs break-all font-mono">
                                        {input.address || 'Unknown'}
                                    </code>
                                    {input.value && (
                                        <span className="text-dark-400 ml-2 flex-shrink-0">
                                            {formatBTC(input.value)} BTC
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Outputs */}
            {transaction.outputs && transaction.outputs.length > 0 && !compact && (
                <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                        Outputs ({transaction.outputs.length})
                    </h3>
                    <div className="glass-effect p-3 rounded-lg space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {transaction.outputs.map((output, index) => (
                            <div key={index} className="text-sm">
                                <div className="flex items-center justify-between">
                                    <code className="text-primary-400 text-xs break-all font-mono">
                                        {output.address || 'OP_RETURN'}
                                    </code>
                                    <span className="text-dark-400 ml-2 flex-shrink-0">
                                        {formatBTC(output.amount)} BTC
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-dark-700">
                <a
                    href={getExplorerUrl(transaction.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary w-full flex items-center justify-center gap-2"
                >
                    View on Block Explorer
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </a>
            </div>
        </div>
    );
}

function DetailRow({ label, children }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            <span className="text-sm font-medium text-dark-400 sm:w-32 flex-shrink-0">
                {label}
            </span>
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}
