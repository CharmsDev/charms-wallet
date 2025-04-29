'use client';

export default function DeleteConfirmationDialog({
    isOpen,
    addressToDelete,
    addresses,
    onConfirm,
    onCancel
}) {
    if (!isOpen) return null;

    const addressEntry = addresses.find(addr => addr.address === addressToDelete);
    const isPair = addressEntry && addressEntry.index >= 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card p-6 max-w-md w-full">
                <h3 className="text-xl font-bold mb-4 gradient-text">Delete Address</h3>

                {isPair ? (
                    <p className="mb-6 text-dark-200">
                        Are you sure you want to delete this address pair (index: {addressEntry.index})?
                        Both the receiving and change addresses will be deleted.
                    </p>
                ) : (
                    <p className="mb-6 text-dark-200">Are you sure you want to delete this address?</p>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-full"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
