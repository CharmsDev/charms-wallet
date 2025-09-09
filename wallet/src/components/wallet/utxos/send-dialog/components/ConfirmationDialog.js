import { useState } from 'react';

/**
 * Renders a confirmation dialog for a Bitcoin transaction.
 * Displays the decoded transaction in a collapsible section and provides options to confirm or cancel.
 *
 * @param {object} props - The component props.
 * @param {object} props.transactionData - The transaction data object.
 * @param {object} props.transactionData.decodedTx - The decoded transaction to display.
 * @param {string|null} props.error - An error message to display, if any.
 * @param {Function} props.onConfirm - Callback function to execute when the user confirms the transaction.
 * @param {Function} props.onCancel - Callback function to execute when the user cancels the action.
 * @returns {JSX.Element}
 */
export function ConfirmationDialog({
    transactionData,
    error,
    onConfirm,
    onCancel
}) {
    const [showDetails, setShowDetails] = useState(false);
    const [showUtxos, setShowUtxos] = useState(false);

    const formatSats = (n) => {
        try {
            return Number(n).toLocaleString('en-US');
        } catch (_) {
            return n;
        }
    };

    return (
        <>
            <h2 className="text-xl font-bold gradient-text mb-4">Confirm Transaction</h2>

            {/* Transaction Summary */}
            {transactionData && (
                <div className="mb-6 bg-dark-800 border border-dark-600 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-dark-100 mb-3">Transaction Summary</h3>
                    
                    <div className="grid grid-cols-3 gap-3">
                        {/* Amount Sent */}
                        <div className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                            <div className="text-xs text-dark-400 uppercase tracking-wide mb-1">Amount Sent</div>
                            <div className="text-lg font-bold text-blue-400">
                                {formatSats((transactionData.totalSelected || 0) - (transactionData.estimatedFee || 0) - (transactionData.change || 0))} sats
                            </div>
                        </div>

                        {/* Network Fee */}
                        <div className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                            <div className="text-xs text-dark-400 uppercase tracking-wide mb-1">Network Fee</div>
                            <div className="text-lg font-bold text-orange-400">
                                {formatSats(transactionData.estimatedFee || 0)} sats
                            </div>
                        </div>

                        {/* Change */}
                        <div className="bg-dark-900 rounded-lg p-3 border border-dark-700">
                            <div className="text-xs text-dark-400 uppercase tracking-wide mb-1">Change</div>
                            <div className="text-lg font-bold text-green-400">
                                {formatSats(transactionData.change || 0)} sats
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {transactionData?.decodedTx && (
                <div className="mb-4">
                    <button
                        className="w-full text-left text-sm text-blue-400 hover:underline flex items-center justify-between"
                        onClick={() => setShowDetails(!showDetails)}
                    >
                        <span>{showDetails ? 'Hide Decoded Transaction' : 'Show Decoded Transaction'}</span>
                        <span className="text-dark-400 text-xs">JSON</span>
                    </button>
                    {showDetails && (
                        <div className="mt-2 border border-dark-700 rounded-lg">
                            <pre className="bg-dark-900 text-dark-200 p-4 rounded-lg overflow-auto text-xs font-mono max-h-64">
                                {JSON.stringify(transactionData.decodedTx, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {Array.isArray(transactionData?.selectedUtxos) && transactionData.selectedUtxos.length > 0 && (
                <div className="mb-4">
                    <button
                        className="w-full text-left text-sm text-blue-400 hover:underline flex items-center justify-between"
                        onClick={() => setShowUtxos(!showUtxos)}
                    >
                        <span>{showUtxos ? 'Hide UTXOs' : 'Show UTXOs in this transaction'}</span>
                        <span className="text-dark-400 text-xs">{transactionData.selectedUtxos.length} item(s)</span>
                    </button>
                    {showUtxos && (
                        <div className="mt-2 border border-dark-700 rounded-lg max-h-64 overflow-auto">
                            <ul className="divide-y divide-dark-700">
                                {transactionData.selectedUtxos.map((u, idx) => (
                                    <li key={`${u.txid}:${u.vout}-${idx}`} className="px-3 py-2 text-xs flex items-center justify-between">
                                        <div className="font-mono text-dark-200 truncate mr-3" title={`${u.txid}:${u.vout}`}>
                                            {u.txid}:{u.vout}
                                        </div>
                                        <div className="text-dark-100 whitespace-nowrap">{formatSats(u.value)} sats</div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="flex justify-end space-x-2">
                <button
                    className="btn btn-secondary"
                    onClick={onCancel}
                >
                    No, Cancel
                </button>
                <button
                    className="btn bg-green-600 hover:bg-green-700 text-white"
                    onClick={onConfirm}
                >
                    Yes, Send Now
                </button>
            </div>
        </>
    );
}

