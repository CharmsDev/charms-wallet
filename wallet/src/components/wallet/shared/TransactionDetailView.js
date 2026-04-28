'use client';

import { getTransactionLabel, getTransactionIcon, CHARM_TRANSACTION_TYPES } from '@/services/transactions/transaction-classifier';
import { classifyInput, classifyOutput, KNOWN_ADDRESSES } from '@/services/transactions/known-addresses';
import { useAddresses } from '@/stores/addressesStore';
import { useMemo } from 'react';
import { formatBTC, formatDetailedDate } from '@/utils/formatters';
import BitcoinTransaction from '../history/components/transaction-types/BitcoinTransaction';
import CharmTransaction from '../history/components/transaction-types/CharmTransaction';
import BroTransaction from '../history/components/transaction-types/BroTransaction';

const KIND_BADGE = {
    scrolls_fee: 'bg-purple-900/30 text-purple-300 border-purple-700/40',
    vault_ebtc:  'bg-orange-900/30 text-orange-300 border-orange-700/40',
    self:        'bg-green-900/30 text-green-300 border-green-700/40',
    external:    'bg-blue-900/30 text-blue-300 border-blue-700/40',
    op_return:   'bg-dark-700/50 text-dark-400 border-dark-600',
    unknown:     'bg-dark-700/50 text-dark-400 border-dark-600',
};

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

    // Charm txs go to the charms-explorer (it knows how to render spells).
    // Plain BTC txs go to mempool.space.
    const isCharm = CHARM_TRANSACTION_TYPES.has(transaction.type);
    const getExplorerUrl = (txid) => {
        if (isCharm) {
            const base = process.env.NEXT_PUBLIC_CHARMS_EXPLORER_URL || 'https://charms-explorer.pages.dev';
            return `${base}/tx?txid=${txid}&network=${network || 'mainnet'}&from=wallet`;
        }
        if (network === 'mainnet')   return `https://mempool.space/tx/${txid}`;
        if (network === 'testnet4')  return `https://mempool.space/testnet4/tx/${txid}`;
        return `https://mempool.space/testnet/tx/${txid}`;
    };

    // Resolve "own" addresses once for input/output labelling.
    const { addresses: walletAddresses = [] } = useAddresses() || {};
    const ownSet = useMemo(
        () => new Set((walletAddresses || []).map(a => a.address || a).filter(Boolean)),
        [walletAddresses]
    );

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
        return ['charm_received', 'charm_sent', 'charm_transfer', 'charm_consolidation', 'charm_self_transfer', 'bro_mint', 'bro_mining', 'beam_in', 'beam_out', 'ebtc_lock', 'ebtc_redeem'].includes(tx.type);
    };

    const BEAM_OUTGOING = new Set(['charm_sent', 'beam_out', 'ebtc_lock']);
    const BEAM_INCOMING = new Set(['charm_received', 'beam_in', 'ebtc_redeem']);

    const sumOutputsByKind = (kind) => (transaction.outputs || [])
        .reduce((s, o) => (o.address && KNOWN_ADDRESSES[o.address]?.kind === kind ? s + (o.amount || 0) : s), 0);
    const sumInputsByKind = (kind) => (transaction.inputs || [])
        .reduce((s, i) => (i.address && KNOWN_ADDRESSES[i.address]?.kind === kind ? s + (i.value || 0) : s), 0);

    const scrollsFee  = sumOutputsByKind('scrolls_fee');
    const vaultLocked = sumOutputsByKind('vault_ebtc');
    const vaultIn     = sumInputsByKind('vault_ebtc');
    const networkFee  = transaction.fee || 0;

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
                
                {/* Amount - Top Right.
                    Show the operation's *subject* (token amount, vault BTC) — NOT
                    the wallet's BTC delta, which mixes dust + fees and confuses the
                    user. eBTC ops show the BTC moved into/out of the vault, with
                    eBTC ticker. Plain BTC ops still show the BTC delta. */}
                <div className="text-right">
                    {(() => {
                        const t = transaction.type;
                        const td = transaction.charmTokenData;
                        const incoming = BEAM_INCOMING.has(t);
                        const outgoing = BEAM_OUTGOING.has(t);
                        const sign = incoming ? '+' : outgoing ? '-' : '';
                        const colour = incoming ? 'text-green-400' : outgoing ? 'text-red-400' : 'text-purple-400';

                        if ((t === 'ebtc_lock' || t === 'ebtc_redeem')) {
                            const sats = t === 'ebtc_lock' ? vaultLocked : vaultIn;
                            if (sats > 0) {
                                return (
                                    <>
                                        <p className={`text-2xl font-bold ${colour}`}>{sign}{formatBTC(sats)}</p>
                                        <p className="text-sm text-dark-400 mt-1">{td?.tokenTicker || 'eBTC'}</p>
                                    </>
                                );
                            }
                        }

                        if (isCharmTransaction(transaction) && td) {
                            // tokenAmount may be 0 / undefined for beam-outs
                            // (the BTC side has no token-bearing output). Hide
                            // the number rather than render "-0" — the ticker
                            // chip + label still tells the user it's BRO.
                            const amt = Number(td.tokenAmount);
                            const hasAmt = Number.isFinite(amt) && amt > 0;
                            return (
                                <>
                                    {hasAmt ? (
                                        <p className={`text-2xl font-bold ${colour}`}>
                                            {sign}{amt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })}
                                        </p>
                                    ) : (
                                        <p className="text-2xl font-bold text-dark-400">{sign || ''}—</p>
                                    )}
                                    <p className="text-sm text-dark-400 mt-1">{td.tokenTicker || ''}</p>
                                </>
                            );
                        }

                        if (!isCharmTransaction(transaction)) {
                            return (
                                <>
                                    <p className={`text-2xl font-bold ${t === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                                        {t === 'received' ? '+' : '-'}{formatBTC(transaction.amount)}
                                    </p>
                                    <p className="text-sm text-dark-400 mt-1">BTC</p>
                                </>
                            );
                        }

                        return <p className="text-xl font-bold text-dark-400">-</p>;
                    })()}
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

                {/* Block Height — use `> 0` to avoid React rendering a literal 0 */}
                {transaction.blockHeight > 0 && (
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

                {/* Token amount moved — primary subject of beam/charm ops.
                    Only render when we actually have a positive amount; for
                    BEAM_OUT the indexer's BTC-side `assets[0].amount` is often
                    0 (tokens left for Cardano), so showing "-0 BRO" would be
                    worse than no row at all. */}
                {(() => {
                    const td = transaction.charmTokenData;
                    const amt = Number(td?.tokenAmount);
                    if (!isCharmTransaction(transaction) || !td || !Number.isFinite(amt) || amt <= 0) return null;
                    return (
                        <DetailRow label="Token Amount">
                            <span className="text-white font-semibold">
                                {BEAM_INCOMING.has(transaction.type) ? '+' : BEAM_OUTGOING.has(transaction.type) ? '-' : ''}
                                {amt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 })}
                                {' '}{td.tokenTicker || ''}
                            </span>
                        </DetailRow>
                    );
                })()}

                {/* eBTC vault leg (BTC locked/released — the underlying collateral). */}
                {(transaction.type === 'ebtc_lock' && vaultLocked > 0) && (
                    <DetailRow label="Locked in Vault">
                        <span className="text-orange-300 font-semibold">{formatBTC(vaultLocked)} BTC</span>
                    </DetailRow>
                )}
                {(transaction.type === 'ebtc_redeem' && vaultIn > 0) && (
                    <DetailRow label="Released from Vault">
                        <span className="text-orange-300 font-semibold">{formatBTC(vaultIn)} BTC</span>
                    </DetailRow>
                )}

                {/* Fee breakdown — split miner fee from Scrolls/prover fee. The
                    Scrolls fee output funds the Succinct prover + signers; the
                    miner fee is what Bitcoin nodes claim. Showing both lets the
                    user see exactly what each leg of a beam costs. */}
                {networkFee > 0 && (
                    <DetailRow label="Network Fee">
                        <span className="text-white">{formatBTC(networkFee)} BTC</span>
                    </DetailRow>
                )}
                {scrollsFee > 0 && (
                    <DetailRow label={(transaction.type === 'ebtc_lock' || transaction.type === 'ebtc_redeem') ? 'Scrolls + Prover Fee' : 'Prover Fee'}>
                        <span className="text-purple-300" title="Single output to the Scrolls fee address — pays Succinct prover and Scrolls signers in one payment.">
                            {formatBTC(scrollsFee)} BTC
                        </span>
                    </DetailRow>
                )}
                {(networkFee > 0 && scrollsFee > 0) && (
                    <DetailRow label="Total Cost">
                        <span className="text-white font-semibold">{formatBTC(networkFee + scrollsFee)} BTC</span>
                    </DetailRow>
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
                        {transaction.inputs.map((input, index) => {
                            const tag = classifyInput(input, ownSet);
                            return (
                                <div key={index} className="text-sm">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${KIND_BADGE[tag.kind] || KIND_BADGE.unknown} flex-shrink-0`}>
                                                {tag.label}
                                            </span>
                                            <code className={`${input.address ? 'text-primary-400' : 'text-dark-500'} text-xs break-all font-mono truncate`} title={input.address || ''}>
                                                {input.address || 'Unknown'}
                                            </code>
                                        </div>
                                        {input.value > 0 && (
                                            <span className="text-dark-400 flex-shrink-0">
                                                {formatBTC(input.value)} BTC
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
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
                        {transaction.outputs.map((output, index) => {
                            const tag = classifyOutput(output, ownSet);
                            // What address text to render: real address, OP_RETURN
                            // marker, or "Unknown" when neither resolved.
                            let addressText;
                            let addressClass = 'text-primary-400';
                            if (output.address) {
                                addressText = output.address;
                            } else if (output.isOpReturn) {
                                addressText = 'OP_RETURN';
                                addressClass = 'text-dark-500';
                            } else {
                                addressText = 'Unknown';
                                addressClass = 'text-dark-500';
                            }
                            return (
                                <div key={index} className="text-sm" title={tag.description || ''}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${KIND_BADGE[tag.kind] || KIND_BADGE.unknown} flex-shrink-0`}>
                                                {tag.label}
                                            </span>
                                            <code className={`${addressClass} text-xs break-all font-mono truncate`} title={addressText}>
                                                {addressText}
                                            </code>
                                        </div>
                                        <span className="text-dark-400 flex-shrink-0">
                                            {formatBTC(output.amount)} BTC
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
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
