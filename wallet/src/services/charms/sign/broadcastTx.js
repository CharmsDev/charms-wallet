import config from '@/config';
import { BitcoinApiRouter } from '@/services/shared/bitcoin-api-router';

/**
 * Broadcasts a single Bitcoin transaction to the network
 * @param {string} txHex - The signed transaction in hex format
 * @param {string} network - Network (mainnet, testnet)
 * @returns {Promise<{txid: string, success: boolean}>}
 */
export async function broadcastTx(txHex, network) {
    try {
        if (!txHex) {
            throw new Error('Transaction hex is required');
        }

        const client = new BitcoinApiRouter();
        const currentNetwork = network || config.bitcoin.network || 'mainnet';
        const txid = await client.sendRawTransaction(txHex, currentNetwork);

        // Optional verification (best effort)
        const waitTime = currentNetwork === 'mainnet' ? 2000 : 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        try {
            await client.getMempoolEntry(txid, currentNetwork);
        } catch (verifyError) {
            // Verification failed but broadcast succeeded - continue
        }

        return {
            txid: txid,
            success: true,
            explorerUrl: getExplorerUrl(txid, currentNetwork)
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Broadcasts a package of Bitcoin transactions to the network
 * @param {Object} signedCommitTx - The signed commit transaction
 * @param {Object} signedSpellTx - The signed spell transaction
 * @param {string} network - Network (mainnet, testnet)
 * @param {Function} logCallback - Optional logging callback function
 * @returns {Promise<Object>} Broadcast results for both transactions
 */
export async function broadcastTransactions(signedCommitTx, signedSpellTx, network, logCallback = () => {}) {
    
    try {
        if (!signedCommitTx || !signedSpellTx) {
            const error = 'Please sign the transactions first';
            throw new Error(error);
        }

        const currentNetwork = network || config.bitcoin.network || 'mainnet';
        const client = new BitcoinApiRouter();
        
        logCallback('Starting transaction broadcast process...');
        logCallback('Broadcasting both transactions together...');
        
        const results = await client.submitPackage(
            [signedCommitTx.signedTxHex || signedCommitTx.hex, signedSpellTx.hex],
            currentNetwork
        );

        // Handle different possible response structures
        let commitTxid, spellTxid;
        let commitAccepted = false;
        let spellAccepted = false;

        if (results && Array.isArray(results)) {
            commitTxid = results[0];
            spellTxid = results[1];
            commitAccepted = !!commitTxid;
            spellAccepted = !!spellTxid;
        } else if (results && results['tx-results']) {
            const txResults = results['tx-results'];
            const resultsArray = Object.values(txResults);
            
            commitTxid = resultsArray[0]?.txid;
            spellTxid = resultsArray[1]?.txid;
            
            // Accept if txid exists, even if "allowed: false" with "txn-already-in-mempool"
            const commitAlreadyInMempool = resultsArray[0]?.['reject-reason'] === 'txn-already-in-mempool';
            const spellAlreadyInMempool = resultsArray[1]?.['reject-reason'] === 'txn-already-in-mempool';
            
            commitAccepted = !!commitTxid && (resultsArray[0]?.allowed !== false || commitAlreadyInMempool);
            spellAccepted = !!spellTxid && (resultsArray[1]?.allowed !== false || spellAlreadyInMempool);
        } else if (results && results.tx_results && Array.isArray(results.tx_results)) {
            const commitResult = results.tx_results[0];
            const spellResult = results.tx_results[1];
            
            commitTxid = commitResult?.txid;
            spellTxid = spellResult?.txid;
            commitAccepted = commitResult?.allowed === true || !!commitTxid;
            spellAccepted = spellResult?.allowed === true || !!spellTxid;
        } else {
            throw new Error('Invalid package submission response format');
        }

        // Verify BOTH transactions were accepted (atomic package)
        if (!commitAccepted || !commitTxid) {
            throw new Error('Package broadcast failed: Commit transaction was not accepted by the network');
        }
        if (!spellAccepted || !spellTxid) {
            throw new Error('Package broadcast failed: Spell transaction was not accepted by the network');
        }
        
        if (!commitTxid || !spellTxid) {
            throw new Error('Package broadcast incomplete: Missing transaction ID(s)');
        }

        logCallback(`Transactions broadcast successful!`);
        logCallback(`Commit TXID: ${commitTxid}`);
        logCallback(`Spell TXID: ${spellTxid}`);

        return {
            success: true,
            commitData: {
                txid: commitTxid,
                status: 'broadcast'
            },
            spellData: {
                txid: spellTxid,
                status: 'broadcast'
            }
        };

    } catch (err) {
        logCallback(`Broadcast error: ${err.message}`);
        
        return {
            success: false,
            error: err.message,
            commitData: null,
            spellData: null
        };
    }
}

/**
 * Gets the status of a Bitcoin transaction
 * @param {string} txid - The transaction ID
 * @param {string} network - Network (mainnet, testnet)
 * @returns {Promise<Object>} Transaction status information
 */
export async function getTxStatus(txid, network) {
    try {
        if (!txid) {
            throw new Error('Transaction ID is required');
        }

        const client = new BitcoinApiRouter();
        const currentNetwork = network || config.bitcoin.network || 'mainnet';
        // getrawtransaction with verbose true returns confirmations/blockhash when known
        const txData = await client.getRawTransaction(txid, true, currentNetwork);

        const confirmed = !!(txData.confirmations && txData.confirmations >= 1);
        return {
            confirmed,
            confirmations: txData.confirmations || 0,
            blockHeight: txData.height || null,
            blockHash: txData.blockhash || null,
            status: confirmed ? 'confirmed' : 'pending',
            fee: txData.fee,
            raw: txData
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Get a mempool.space explorer URL for the transaction
 * @param {string} txid - The transaction ID
 * @param {string} network - Network (mainnet, testnet)
 * @returns {string} Explorer URL
 */
export function getExplorerUrl(txid, network) {
    const currentNetwork = network || config.bitcoin.network || 'mainnet';
    const baseUrl = currentNetwork === 'mainnet' 
        ? 'https://mempool.space'
        : 'https://mempool.space/testnet4';
    return `${baseUrl}/tx/${txid}`;
}
