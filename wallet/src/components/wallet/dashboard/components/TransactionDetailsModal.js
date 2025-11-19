'use client';

import TransactionDetailView from '../../shared/TransactionDetailView';

/**
 * Modal overlay for displaying transaction details in the dashboard
 * Uses the shared TransactionDetailView component for consistent presentation
 */
export default function TransactionDetailsModal({ transaction, network, onClose }) {
    if (!transaction) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-dark-900 border border-dark-700 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-dark-900 border-b border-dark-700 p-6 flex justify-between items-center z-10">
                    <h2 className="text-xl font-bold gradient-text">Transaction Details</h2>
                    <button
                        onClick={onClose}
                        className="text-dark-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    <TransactionDetailView transaction={transaction} network={network} />
                </div>
            </div>
        </div>
    );
}
