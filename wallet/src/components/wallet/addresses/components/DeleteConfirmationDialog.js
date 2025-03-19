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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h3 className="text-lg font-medium mb-4">Delete Address</h3>

                {isPair ? (
                    <p className="mb-6">
                        Are you sure you want to delete this address pair (index: {addressEntry.index})?
                        Both the receiving and change addresses will be deleted.
                    </p>
                ) : (
                    <p className="mb-6">Are you sure you want to delete this address?</p>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium border border-gray-300 rounded-md"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
