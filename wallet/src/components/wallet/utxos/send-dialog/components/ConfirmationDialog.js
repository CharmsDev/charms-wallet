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
