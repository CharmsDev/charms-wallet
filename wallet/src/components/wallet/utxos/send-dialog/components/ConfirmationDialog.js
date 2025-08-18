export function ConfirmationDialog({
    transactionData,
    error,
    onConfirm,
    onCancel
}) {
    return (
        <>
            <h2 className="text-xl font-bold gradient-text mb-4">Confirm Transaction</h2>

            {transactionData?.decodedTx && (
                <div className="mb-4">
                    <pre className="bg-dark-900 text-dark-200 p-4 rounded-lg overflow-auto text-xs font-mono border border-dark-700">
                        {JSON.stringify(transactionData.decodedTx, null, 2)}
                    </pre>
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
