import { SATOSHI_AMOUNTS } from '../utils/amountUtils';

export function SendForm({ formState, transactionFlow, onClose }) {
    const {
        destinationAddress,
        setDestinationAddress,
        amount,
        setAmount,
        error,
    } = formState;

    return (
        <>
            <h2 className="text-xl font-bold gradient-text mb-4">Send Bitcoin</h2>

            <div className="mb-4">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                    Destination Address
                </label>
                <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-bitcoin-400 focus:border-transparent transition-all duration-200"
                    placeholder="Enter Bitcoin address"
                />
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                    Amount (Satoshis)
                </label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-bitcoin-400 focus:border-transparent transition-all duration-200"
                    placeholder="Enter amount in satoshis"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                    {SATOSHI_AMOUNTS.map((satAmount) => (
                        <button
                            key={satAmount}
                            type="button"
                            onClick={() => setAmount(satAmount.toString())}
                            className="px-3 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-dark-200 text-sm transition-colors"
                        >
                            {satAmount.toLocaleString()}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="flex justify-end space-x-2">
                <button className="btn btn-secondary" onClick={onClose}>
                    Cancel
                </button>
                <button 
                    className="btn btn-bitcoin" 
                    onClick={transactionFlow.handleSendClick}
                    disabled={!destinationAddress || !amount}
                >
                    Send Now
                </button>
            </div>
        </>
    );
}
