'use client';

import { addTransaction, getTransactions, getAddresses } from '@/services/storage';
import { MempoolService } from '@/services/shared/mempool-service';
import { classifyTransaction, TRANSACTION_TYPES } from './transaction-classifier';
import { extractCharmTokenData } from './charm-transaction-extractor';

export class TransactionRecorder {
    constructor(blockchain, network) {
        this.blockchain = blockchain;
        this.network = network;
        // Cache for block timestamps to avoid excessive API calls
        this.timestampCache = new Map();
    }

    // Generate unique transaction ID
    generateTransactionId(type, timestamp) {
        const counter = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `tx_${timestamp}_${type}_${counter}`;
    }

    // Check if transaction type is a charm transaction
    isCharmTransaction(type) {
        return [
            TRANSACTION_TYPES.CHARM_RECEIVED,
            TRANSACTION_TYPES.CHARM_SENT,
            TRANSACTION_TYPES.CHARM_CONSOLIDATION,
            TRANSACTION_TYPES.CHARM_SELF_TRANSFER,
            TRANSACTION_TYPES.BRO_MINT,
            TRANSACTION_TYPES.BRO_MINING,
            TRANSACTION_TYPES.BEAM_IN,
            TRANSACTION_TYPES.BEAM_OUT,
            TRANSACTION_TYPES.EBTC_LOCK,
            TRANSACTION_TYPES.EBTC_REDEEM,
        ].includes(type);
    }

    /**
     * Full history sync — fetches ALL txs for each address (sent + received,
     * regardless of UTXO state) from the /v1/wallet/transactions endpoint,
     * then fetches full details + classifies each. Replaces the UTXO-only
     * scan which misses any tx whose outputs have since been spent.
     */
    async syncFullTransactionHistory(addresses) {
        try {
            const mempoolService = new MempoolService();
            const addrList = (addresses || []).map(a => a.address || a).filter(Boolean);
            if (!addrList.length) return { updated: 0, total: 0 };

            console.log('[DIAG:history] Full sync for', addrList.length, 'addresses');

            // 1. Collect txid set across all addresses (dedupe)
            const txMeta = new Map(); // txid -> { block_height, block_time, addresses: [] }
            for (const addr of addrList) {
                try {
                    const list = await mempoolService.getAddressTransactions(addr, this.network);
                    const count = Array.isArray(list) ? list.length : 0;
                    console.log(`[DIAG:history]   ${addr} → ${count} txs`);
                    for (const entry of (Array.isArray(list) ? list : [])) {
                        const txid = entry.txid || entry.hash;
                        if (!txid) continue;
                        const existing = txMeta.get(txid) || { addresses: [] };
                        existing.block_height = existing.block_height ?? (entry.block_height ?? entry.status?.block_height ?? null);
                        existing.block_time = existing.block_time ?? (entry.block_time ?? entry.status?.block_time ?? null);
                        existing.addresses.push(addr);
                        txMeta.set(txid, existing);
                    }
                } catch (e) {
                    console.log(`[DIAG:history]   ${addr} → ERROR:`, e.message);
                }
            }

            console.log('[DIAG:history] Total unique txids found:', txMeta.size);

            const existingTxs = await getTransactions(this.blockchain, this.network);
            const existingTxids = new Set(existingTxs.map(t => t.txid));
            const newOnes = [...txMeta.keys()].filter(t => !existingTxids.has(t));
            const alreadyStored = [...txMeta.keys()].filter(t => existingTxids.has(t));
            console.log('[DIAG:history] Already stored:', alreadyStored.length, 'New to process:', newOnes.length);
            if (newOnes.length) console.log('[DIAG:history] New txids:', newOnes);

            const ownSet = new Set(addrList);
            const toProcess = newOnes.map(txid => [txid, txMeta.get(txid)]);

            // Collect placeholder txids from the already-stored history so
            // beam-in (claim) detection can distinguish from beam-out. Used
            // as classification context — a spell tx consuming a known
            // placeholder is an inbound claim, not an outbound beam.
            const knownPlaceholderTxids = new Set(
                existingTxs
                    .filter(t => t.type === TRANSACTION_TYPES.BTC_PLACEHOLDER)
                    .map(t => t.txid)
            );

            // Process in parallel batches to keep the sync fast without
            // hammering the API (and not blocking on any single slow tx).
            const BATCH = 8;
            let updated = 0;
            for (let i = 0; i < toProcess.length; i += BATCH) {
                const batch = toProcess.slice(i, i + BATCH);
                const results = await Promise.allSettled(batch.map(async ([txid, meta]) => {
                    let inputs = [], outputs = [], fee = null, amount = 0, txDetails = null;
                    try {
                        const response = await mempoolService.getTransaction(txid, this.network);
                        txDetails = response?.tx || response;
                        if (txDetails) {
                            inputs = (txDetails.vin || []).map(i => ({
                                txid: i.txid, vout: i.vout,
                                address: i.prevout?.scriptpubkey_address || null,
                                value: i.prevout?.value || null,
                            }));
                            outputs = (txDetails.vout || []).map(o => ({
                                address: o.scriptpubkey_address || null,
                                amount: o.value || 0,
                                vout: o.n,
                            }));
                            fee = txDetails.fee || null;
                        }
                    } catch { return null; }

                    const outToUs = outputs.filter(o => o.address && ownSet.has(o.address))
                        .reduce((s, o) => s + (o.amount || 0), 0);
                    const inFromUs = inputs.filter(inp => inp.address && ownSet.has(inp.address))
                        .reduce((s, inp) => s + (inp.value || 0), 0);
                    amount = Math.abs(outToUs - inFromUs);

                    let blockTime = txDetails?.status?.block_time
                        || txDetails?.blocktime
                        || txDetails?.time
                        || meta?.block_time
                        || null;
                    const blockHeight = txDetails?.status?.block_height
                        || txDetails?.block_height
                        || meta?.block_height
                        || null;
                    if (!blockTime && blockHeight) {
                        if (this.timestampCache.has(blockHeight)) {
                            blockTime = this.timestampCache.get(blockHeight);
                        } else {
                            blockTime = await mempoolService.getBlockTimestamp(blockHeight, this.network);
                            if (blockTime) this.timestampCache.set(blockHeight, blockTime);
                        }
                    }
                    const timestamp = blockTime ? blockTime * 1000 : Date.now();

                    const transaction = {
                        id: this.generateTransactionId('scan', timestamp),
                        txid,
                        type: 'received',
                        amount, fee, timestamp,
                        status: 'confirmed',
                        inputs, outputs,
                        blockHeight,
                    };
                    transaction.type = classifyTransaction(transaction, addresses, { placeholderTxids: knownPlaceholderTxids });
                    // Self-update the set so later txs in this batch can
                    // reference placeholders discovered in this run.
                    if (transaction.type === TRANSACTION_TYPES.BTC_PLACEHOLDER) {
                        knownPlaceholderTxids.add(transaction.txid);
                    }

                    // Charm extraction is best-effort. 404s are expected for
                    // txs that classify as charm-ish by structure but aren't
                    // actually indexed as charms (e.g., legacy mining outputs).
                    if (this.isCharmTransaction(transaction.type)) {
                        try {
                            const charmData = await extractCharmTokenData(txid, this.network, addresses);
                            if (charmData) transaction.charmTokenData = charmData;
                        } catch { /* optional */ }
                    }

                    await addTransaction(transaction, this.blockchain, this.network);
                    return txid;
                }));
                updated += results.filter(r => r.status === 'fulfilled' && r.value).length;
            }

            console.log(`[DIAG:history] Sync complete: ${updated} new txs added`);

            // ── Diagnostic export for indexer reports ──
            // Load the full merged history (existing + newly added) and print
            // a table sortable by block. Includes txid + block + classified
            // type — enough to share with the explorer indexer team to verify
            // coverage of v14 spell txs.
            try {
                const allTxs = await getTransactions(this.blockchain, this.network);
                const rows = allTxs
                    .map(t => ({
                        block: t.blockHeight ?? '-',
                        date: t.timestamp ? new Date(t.timestamp).toISOString().slice(0, 19).replace('T', ' ') : '-',
                        type: t.type || '-',
                        amount_sats: t.amount ?? '-',
                        txid: t.txid,
                    }))
                    .sort((a, b) => (b.block === '-' ? 0 : b.block) - (a.block === '-' ? 0 : a.block));
                console.log(`[DIAG:history] ── Full tx list (${rows.length} total) ──`);
                console.table(rows);
                // Also a compact csv/json block for easy copy-paste
                console.log('[DIAG:history] Txids for indexer report (newest first):');
                console.log(rows.map(r => `${r.block}  ${r.txid}  ${r.type}`).join('\n'));
            } catch (e) {
                console.warn('[DIAG:history] Could not emit full list:', e.message);
            }

            return { updated, total: txMeta.size };
        } catch (err) {
            console.error('[TransactionRecorder] Full history sync failed:', err);
            return { updated: 0, total: 0, error: err.message };
        }
    }

    // Record sent transaction after successful broadcast
    async recordSentTransaction(txData, fee, addresses) {
        const timestamp = Date.now();

        const transaction = {
            id: this.generateTransactionId('sent', timestamp),
            txid: txData.txid,
            type: 'sent',
            amount: txData.amountInSats,
            fee: fee,
            timestamp: timestamp,
            status: 'pending',
            addresses: {
                from: addresses.from || [],
                to: addresses.to || []
            },
            // Add inputs if available
            inputs: txData.inputs || [],
            // Add outputs if available
            outputs: txData.outputs || [],
            metadata: {
                changeAmount: txData.change || 0,
                totalInputs: txData.totalSelected || 0
            }
        };
        
        const updatedTransactions = await addTransaction(transaction, this.blockchain, this.network);
        
        // Verify it was saved by reading it back
        const storedTransactions = await getTransactions(this.blockchain, this.network);
        const savedTx = storedTransactions.find(tx => tx.txid === transaction.txid);
        if (!savedTx) {
            // Intentionally silent in production; rely on return value and state
        }
        
        return transaction;
    }

    // Process UTXOs to detect received transactions (excluding change addresses)
    async processUTXOsForReceivedTransactions(utxos, addresses) {
        try {
            const existingTransactions = await getTransactions(this.blockchain, this.network);
            const existingTxids = new Set(
                existingTransactions
                    .filter(tx => tx.type === 'received')
                    .map(tx => tx.txid)
            );

            // Get address classification from localStorage
            const storedAddresses = await getAddresses(this.blockchain, this.network);
            const receiverAddresses = new Set(
                storedAddresses
                    .filter(addr => !addr.isChange)
                    .map(addr => addr.address)
            );

            // Flatten UTXOs from receiver addresses only
            const receiverUtxos = [];
            Object.entries(utxos).forEach(([address, addressUtxos]) => {
                if (receiverAddresses.has(address) && Array.isArray(addressUtxos)) {
                    addressUtxos.forEach(utxo => {
                        receiverUtxos.push({
                            ...utxo,
                            address: address,
                            key: `${utxo.txid}:${utxo.vout}`
                        });
                    });
                }
            });

            // Group UTXOs by transaction ID
            const txGroups = {};
            receiverUtxos.forEach(utxo => {
                const txid = utxo.txid;
                if (!txGroups[txid]) {
                    txGroups[txid] = [];
                }
                txGroups[txid].push(utxo);
            });

            // Process each transaction group
            const mempoolService = new MempoolService();
            
            for (const [txid, txUtxos] of Object.entries(txGroups)) {
                // Calculate total amount for this transaction
                const totalAmount = txUtxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);

                // Fetch full transaction details — authoritative source of
                // inputs, outputs, fee, block height, and block time.
                let inputs = [];
                let outputs = [];
                let fee = null;
                let txDetails = null;
                try {
                    const response = await mempoolService.getTransaction(txid, this.network);
                    txDetails = response?.tx || response;

                    if (txDetails) {
                        inputs = (txDetails.vin || []).map(input => ({
                            txid: input.txid,
                            vout: input.vout,
                            address: input.prevout?.scriptpubkey_address || null,
                            value: input.prevout?.value || null
                        }));
                        outputs = (txDetails.vout || []).map(output => ({
                            address: output.scriptpubkey_address || null,
                            amount: output.value || 0,
                            vout: output.n
                        }));
                        fee = txDetails.fee || null;
                    }
                } catch (error) {
                    // Silent fail - tx details are optional
                }

                // Resolve block height + time. Different providers use
                // different shapes — we accept all of them:
                //   mempool.space:    tx.status.{ block_time, block_height }
                //   Charms Explorer:  tx.time / tx.blocktime (seconds)
                //   UTXO scan:        utxo.status.{ block_time, block_height }
                let blockTime = txDetails?.status?.block_time
                    || txDetails?.blocktime
                    || txDetails?.time
                    || txUtxos[0].status?.block_time
                    || txUtxos[0].blockTime
                    || null;
                const blockHeight = txDetails?.status?.block_height
                    || txDetails?.block_height
                    || txUtxos[0].status?.block_height
                    || txUtxos[0].blockHeight
                    || null;

                if (!blockTime && blockHeight) {
                    if (this.timestampCache.has(blockHeight)) {
                        blockTime = this.timestampCache.get(blockHeight);
                    } else {
                        blockTime = await mempoolService.getBlockTimestamp(blockHeight, this.network);
                        if (blockTime) this.timestampCache.set(blockHeight, blockTime);
                    }
                }

                // Only fall back to Date.now() for truly unconfirmed txs — in
                // that case we also flag the tx so sorting knows it's pending.
                const timestamp = blockTime ? blockTime * 1000 : Date.now();

                // Create transaction object
                const transaction = {
                    id: this.generateTransactionId('received', timestamp),
                    txid,
                    type: 'received', // Will be updated by classifier
                    amount: totalAmount,
                    timestamp: timestamp,
                    status: 'confirmed',
                    addresses: {
                        received: txUtxos.map(u => u.address)
                    },
                    inputs: inputs,
                    outputs: outputs,
                    fee: fee,
                    blockHeight: blockHeight,
                    confirmations: Math.min(...txUtxos.map(utxo => utxo.confirmations || 1))
                };

                // Classify transaction type
                transaction.type = classifyTransaction(transaction, addresses);

                // Extract charm token data if this is a charm transaction
                if (this.isCharmTransaction(transaction.type)) {
                    console.log(`[TransactionRecorder] Extracting charm data for ${txid}, type: ${transaction.type}`);
                    try {
                        const charmData = await extractCharmTokenData(txid, this.network, addresses);
                        console.log(`[TransactionRecorder] Charm data result:`, charmData);
                        if (charmData) {
                            transaction.charmTokenData = {
                                appId: charmData.appId,
                                tokenName: charmData.tokenName,
                                tokenTicker: charmData.tokenTicker,
                                tokenImage: charmData.tokenImage,
                                tokenAmount: charmData.tokenAmount
                            };
                            console.log(`[TransactionRecorder] Added charmTokenData to transaction:`, transaction.charmTokenData);
                        } else {
                            console.log(`[TransactionRecorder] No charm data returned for ${txid}`);
                        }
                    } catch (error) {
                        console.error(`[TransactionRecorder] Error extracting charm data:`, error);
                        // Silent fail - charm data is optional
                    }
                }

                // Save or update transaction
                if (existingTxids.has(txid)) {
                    await this.updateExistingTransaction(txid, transaction, blockTime !== null);
                } else {
                    await addTransaction(transaction, this.blockchain, this.network);
                }
            }
        } catch (error) {
            throw error;
        }
    }

    // Update transaction status from blockchain
    async updateTransactionStatus(txid, status, confirmations, blockHeight) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            const updatedTransactions = transactions.map(tx => {
                if (tx.txid === txid) {
                    return {
                        ...tx,
                        status,
                        confirmations: confirmations || tx.confirmations,
                        blockHeight: blockHeight || tx.blockHeight
                    };
                }
                return tx;
            });

            // Save updated transactions
            const { saveTransactions } = await import('@/services/storage');
            await saveTransactions(updatedTransactions, this.blockchain, this.network);

        } catch (error) {
            throw error;
        }
    }

    // Check if transaction already exists by txid and type
    async transactionExists(txid, type) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            return transactions.some(tx => tx.txid === txid && tx.type === type);
        } catch (error) {
            return false;
        }
    }

    // Update existing transaction with new data (for refresh functionality)
    async updateExistingTransaction(txid, newTransactionData, updateTimestamp = false) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            const updatedTransactions = transactions.map(tx => {
                if (tx.txid === txid && tx.type === newTransactionData.type) {
                    // COMPLETELY REPLACE transaction data, removing old charm-related fields
                    const updated = {
                        ...newTransactionData,
                        id: tx.id, // Keep original ID
                        // Always update inputs if provided
                        inputs: newTransactionData.inputs || tx.inputs || [],
                        // Always update outputs if provided
                        outputs: newTransactionData.outputs || tx.outputs || [],
                        // Always update fee if provided
                        fee: newTransactionData.fee !== undefined ? newTransactionData.fee : tx.fee,
                    };
                    
                    // Update timestamp only if we have a real block timestamp
                    if (updateTimestamp && newTransactionData.timestamp) {
                        updated.timestamp = newTransactionData.timestamp;
                    } else {
                        updated.timestamp = tx.timestamp; // Keep original
                    }
                    
                    // IMPORTANT: Remove old metadata field if it exists (legacy data)
                    delete updated.metadata;
                    
                    // Ensure charmTokenData is from new data only
                    if (newTransactionData.charmTokenData) {
                        updated.charmTokenData = newTransactionData.charmTokenData;
                    }
                    
                    console.log(`[TransactionRecorder] Updated transaction ${txid}:`, {
                        hasCharmTokenData: !!updated.charmTokenData,
                        charmTokenData: updated.charmTokenData
                    });
                    
                    return updated;
                }
                return tx;
            });

            const { saveTransactions } = await import('@/services/storage');
            await saveTransactions(updatedTransactions, this.blockchain, this.network);
        } catch (error) {
            throw error;
        }
    }
}

export default TransactionRecorder;
