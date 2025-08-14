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

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain', // mempool.space expects text/plain for raw hex
                },
                body: requestBody,
            });

            if (!response.ok) {
                let errorText = 'Unknown error';
                try {
                    errorText = await response.text();
                } catch (e) {
                    // Ignore text reading error
                }
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const responseText = await response.text();

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (jsonError) {
                result = responseText;
            }

            // Format the result consistently
            const txid = typeof result === 'string' ? result : result.txid;

            if (!txid) {
                throw new Error('No transaction ID returned from broadcast service');
            }

            return {
                txid,
                success: true
            };
        } catch (error) {
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

            // Getting transaction status

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
            throw error;
        }
    }
}

// Export a singleton instance
export const broadcastService = new BroadcastService();

export default broadcastService;
