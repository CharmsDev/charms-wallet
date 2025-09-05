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

            {transactionData?.decodedTx && (
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-sm text-dark-300">Transaction created successfully.</p>
                        <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-blue-400 hover:underline">
                            {showDetails ? 'Hide Details' : 'View Details'}
                        </button>
                    </div>
                    {showDetails && (
                        <pre className="bg-dark-900 text-dark-200 p-4 rounded-lg overflow-auto text-xs font-mono border border-dark-700 max-h-64">
                            {JSON.stringify(transactionData.decodedTx, null, 2)}
                        </pre>
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

