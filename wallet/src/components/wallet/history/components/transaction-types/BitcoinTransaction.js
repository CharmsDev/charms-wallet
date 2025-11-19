'use client';

/**
 * Displays Bitcoin-specific transaction details including network fees and amounts
 */
export default function BitcoinTransaction({ transaction, formatBTC, DetailRow, copyToClipboard }) {
    return (
        <>
            {transaction.fee && transaction.type === 'sent' && (
                <DetailRow label="Network Fee">
                    <span className="text-white">{formatBTC(transaction.fee)} BTC</span>
                </DetailRow>
            )}

            {transaction.amount && (
                <DetailRow label={transaction.type === 'sent' ? 'Total Sent' : 'Total Received'}>
                    <span className="text-white font-semibold">{formatBTC(transaction.amount)} BTC</span>
                </DetailRow>
            )}
        </>
    );
}
