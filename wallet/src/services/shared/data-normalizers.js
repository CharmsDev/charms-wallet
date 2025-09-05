'use client';

/**
 * Data Normalizers - Convert mempool.space format to QuickNode format
 * Ensures consistent data structure regardless of API provider
 */

/**
 * Normalize UTXO data from mempool.space to QuickNode format
 */
export function normalizeMempoolUTXOs(mempoolUtxos, currentBlockHeight, address) {
    if (!mempoolUtxos || mempoolUtxos.length === 0) {
        return [];
    }

    return mempoolUtxos.map(utxo => {
        let confirmations = 0;
        if (utxo.status?.confirmed && utxo.status?.block_height) {
            if (currentBlockHeight !== null) {
                confirmations = Math.max(0, currentBlockHeight - utxo.status.block_height + 1);
            } else {
                confirmations = 1; // Fallback: at least 1 if confirmed
            }
        }

        return {
            txid: utxo.txid,
            vout: utxo.vout,
            value: parseInt(utxo.value, 10), // Ensure number format like QuickNode
            address: address,
            confirmations: confirmations,
            blockHeight: utxo.status?.block_height || null,
            coinbase: false, // mempool.space doesn't provide this info
            status: {
                confirmed: utxo.status?.confirmed || false,
                block_height: utxo.status?.block_height || null,
                block_hash: utxo.status?.block_hash || null,
                block_time: utxo.status?.block_time || null
            }
        };
    });
}

// Helper: convert satoshis (number) to BTC string with 8 decimals
function satsToBtcString(sats) {
    const n = typeof sats === 'number' ? sats : parseInt(sats || 0, 10);
    return (n / 1e8).toFixed(8);
}

/**
 * Normalize transaction data from mempool.space to QuickNode format
 */
export function normalizeMempoolTransaction(mempoolTx, currentBlockHeight) {
    let confirmations = 0;
    if (mempoolTx.status?.confirmed && mempoolTx.status?.block_height) {
        if (currentBlockHeight !== null) {
            confirmations = Math.max(0, currentBlockHeight - mempoolTx.status.block_height + 1);
        } else {
            confirmations = 1; // Fallback: at least 1 if confirmed
        }
    }
    
    // Build QuickNode/Bitcoin Core-like verbose transaction structure
    const vin = Array.isArray(mempoolTx.vin) ? mempoolTx.vin.map((input) => {
        const addr = input.prevout?.scriptpubkey_address || null;
        const valueSats = input.prevout?.value ?? null;
        return {
            ...input,
            // Add addresses array expected by our analyzers
            addresses: addr ? [addr] : undefined,
            // Value in BTC string (from prevout)
            value: valueSats != null ? satsToBtcString(valueSats) : undefined,
            // Maintain original fields
        };
    }) : [];

    const vout = Array.isArray(mempoolTx.vout) ? mempoolTx.vout.map((output, idx) => {
        const addr = output.scriptpubkey_address || null;
        const valueSats = output.value ?? 0;
        return {
            // Provide QuickNode/Core-like fields
            value: satsToBtcString(valueSats), // BTC string
            n: typeof output.n === 'number' ? output.n : idx,
            scriptPubKey: {
                // Provide addresses array per our consumers
                addresses: addr ? [addr] : undefined,
                // Preserve raw script type info for potential future use
                type: output.scriptpubkey_type,
                asm: output.scriptpubkey_asm,
                hex: output.scriptpubkey,
            },
            // Preserve mempool-specific fields for debugging/reference
            ...output,
        };
    }) : [];

    // Convert mempool.space format to QuickNode-compatible format
    return {
        txid: mempoolTx.txid,
        hash: mempoolTx.txid,
        version: mempoolTx.version,
        size: mempoolTx.size,
        vsize: mempoolTx.vsize,
        weight: mempoolTx.weight,
        locktime: mempoolTx.locktime,
        vin,
        vout,
        hex: null, // Will be fetched separately if needed
        blockhash: mempoolTx.status?.block_hash || null,
        confirmations: confirmations,
        time: mempoolTx.status?.block_time || null,
        blocktime: mempoolTx.status?.block_time || null,
        fee: mempoolTx.fee || 0
    };
}

/**
 * Normalize address transaction history from mempool.space to QuickNode format
 */
export function normalizeMempoolAddressData(mempoolTxs, address) {
    return {
        address: address,
        txs: mempoolTxs.map(tx => tx.txid), // Return array of txids
        transactions: mempoolTxs.map(tx => tx.txid), // Alternative format
        txids: mempoolTxs.map(tx => tx.txid) // Another alternative format
    };
}

/**
 * Normalize UTXO verification results
 */
export function normalizeUtxoVerification(results) {
    const validUtxos = [];
    const spentUtxos = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            if (result.value.isSpent) {
                spentUtxos.push(result.value.utxo);
            } else {
                validUtxos.push(result.value.utxo);
            }
        } else {
            // If check failed, keep UTXO to avoid blocking transactions
            validUtxos.push(result.value?.utxo || results[index]);
        }
    });
    
    return {
        validUtxos,
        spentUtxos,
        removedCount: spentUtxos.length
    };
}
