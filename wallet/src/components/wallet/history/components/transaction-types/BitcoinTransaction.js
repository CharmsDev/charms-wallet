'use client';

/**
 * Displays Bitcoin-specific transaction details including network fees and amounts.
 * Conditionals use `> 0` (not just truthiness) so a numeric 0 doesn't leak into
 * the render output — `{0 && ...}` evaluates to `0` and React prints it.
 */
export default function BitcoinTransaction({ transaction, formatBTC, DetailRow, copyToClipboard }) {
    return (
        <>
            {transaction.fee > 0 && transaction.type === 'sent' && (
                <DetailRow label="Network Fee">
                    <span className="text-white">{formatBTC(transaction.fee)} BTC</span>
                </DetailRow>
            )}

            {transaction.amount > 0 && (
                <DetailRow label={transaction.type === 'sent' ? 'Total Sent' : 'Total Received'}>
                    <span className="text-white font-semibold">{formatBTC(transaction.amount)} BTC</span>
                </DetailRow>
            )}
        </>
    );
}
