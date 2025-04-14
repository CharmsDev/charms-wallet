import config from '@/config';

// Service for broadcasting Bitcoin transactions
class BroadcastService {
    // Broadcasts a signed Bitcoin transaction to the network
    async broadcastTransaction(txHex) {
        try {
            if (!txHex) {
                throw new Error('Transaction hex is required');
            }

            let apiUrl;
            let requestBody;

            // Always use testnet network
            // For testnet, use mempool.space API
            const mempoolApiUrl = config.bitcoin.getMempoolApiUrl();
            apiUrl = `${mempoolApiUrl}/tx`;
            requestBody = txHex; // Just the raw hex for mempool.space

            console.log(`Broadcasting transaction to: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody),
            });

            if (!response.ok) {
                // Try to get detailed error message
                let errorText = 'Unknown error';
                try {
                    errorText = await response.text();
                } catch (e) {
                    // Ignore error reading response text
                }
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            // Different APIs return different formats
            const result = await response.json().catch(() => response.text());

            // Format the result consistently
            const txid = typeof result === 'string' ? result : result.txid;

            console.log('Transaction broadcast successfully:', txid);

            return {
                txid,
                success: true
            };
        } catch (error) {
            console.error('Error broadcasting transaction:', error);
            throw error;
        }
    }

    // Gets the status of a Bitcoin transaction
    async getTransactionStatus(txid) {
        try {
            if (!txid) {
                throw new Error('Transaction ID is required');
            }

            let apiUrl;

            // Always use testnet network
            // For testnet, use mempool.space API
            const mempoolApiUrl = config.bitcoin.getMempoolApiUrl();
            apiUrl = `${mempoolApiUrl}/tx/${txid}`;

            console.log(`Getting transaction status from: ${apiUrl}`);

            const response = await fetch(apiUrl);

            if (!response.ok) {
                // 404 might mean the transaction hasn't been confirmed yet
                if (response.status === 404) {
                    return {
                        confirmed: false,
                        status: 'pending',
                        message: 'Transaction not found. It may be pending or not broadcast.'
                    };
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Format the result consistently
            return {
                confirmed: result.confirmed || result.status === 'confirmed' || false,
                confirmations: result.confirmations || 0,
                blockHeight: result.block_height || result.blockHeight,
                blockHash: result.block_hash || result.blockHash,
                timestamp: result.timestamp,
                status: result.confirmed ? 'confirmed' : 'pending',
                fee: result.fee || result.fees,
                raw: result // Include the raw result for advanced use cases
            };
        } catch (error) {
            console.error('Error getting transaction status:', error);
            throw error;
        }
    }
}

// Export a singleton instance
export const broadcastService = new BroadcastService();

export default broadcastService;
