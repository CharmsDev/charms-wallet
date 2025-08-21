export function PreparingDialog({ status }) {
    return (
        <>
            <h2 className="text-xl font-bold gradient-text mb-4">Preparing Transaction</h2>
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bitcoin-400 mr-3"></div>
                <span className="text-dark-200">{status}</span>
            </div>
        </>
    );
}
