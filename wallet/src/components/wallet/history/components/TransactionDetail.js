'use client';

import TransactionDetailView from '../../shared/TransactionDetailView';

export default function TransactionDetail({ transaction, network }) {
    if (!transaction) {
        return (
            <div className="card p-8 text-center flex items-center justify-center" style={{ height: 'calc(100vh - 200px)' }}>
                <div>
                    <div className="text-6xl mb-4">📄</div>
                    <p className="text-dark-400 font-medium">Select a transaction</p>
                    <p className="text-sm text-dark-500 mt-2">
                        Click on any transaction from the list to view details
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="card p-6 overflow-y-auto custom-scrollbar" style={{ height: 'calc(100vh - 200px)' }}>
            <TransactionDetailView transaction={transaction} network={network} />
        </div>
    );
}
