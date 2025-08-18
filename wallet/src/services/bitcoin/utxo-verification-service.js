'use client';

import config from '@/config';

/**
 * UTXO Verification Service
 * Verifies UTXOs using multiple APIs (mempool.space + blockstream.info as backup)
 */
export class UTXOVerificationService {
    constructor() {
        this.maxRetries = 2;
        this.timeout = 5000; // 5 seconds
    }

    /**
     * Get API URLs for current network
     */
    getApiUrls() {
        const network = config.network;
        
        if (network === 'testnet' || network === 'testnet4') {
            return {
                mempool: 'https://mempool.space/testnet4/api',
                blockstream: 'https://blockstream.info/testnet/api'
            };
        } else {
            return {
                mempool: 'https://mempool.space/api',
                blockstream: 'https://blockstream.info/api'
            };
        }
    }

    /**
     * Verify single UTXO using mempool.space API
     */
    async verifyUtxoMempool(txid, vout) {
        try {
            const { mempool } = this.getApiUrls();
            const response = await fetch(`${mempool}/tx/${txid}/outspend/${vout}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return !data.spent; // true if unspent, false if spent

        } catch (error) {
            console.warn(`[UTXOVerificationService] Mempool API failed for ${txid}:${vout}:`, error.message);
            throw error;
        }
    }

    /**
     * Verify single UTXO using blockstream.info API (backup)
     */
    async verifyUtxoBlockstream(txid, vout) {
        try {
            const { blockstream } = this.getApiUrls();
            const response = await fetch(`${blockstream}/tx/${txid}/outspend/${vout}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return !data.spent; // true if unspent, false if spent

        } catch (error) {
            console.warn(`[UTXOVerificationService] Blockstream API failed for ${txid}:${vout}:`, error.message);
            throw error;
        }
    }

    /**
     * Verify single UTXO with fallback APIs
     */
    async verifyUtxo(txid, vout) {
        // Try mempool.space first
        try {
            const isUnspent = await this.verifyUtxoMempool(txid, vout);
            console.log(`[UTXOVerificationService] ${txid}:${vout} - ${isUnspent ? 'UNSPENT' : 'SPENT'} (mempool)`);
            return isUnspent;
        } catch (error) {
            console.log(`[UTXOVerificationService] Mempool failed, trying Blockstream...`);
        }

        // Fallback to blockstream.info
        try {
            const isUnspent = await this.verifyUtxoBlockstream(txid, vout);
            console.log(`[UTXOVerificationService] ${txid}:${vout} - ${isUnspent ? 'UNSPENT' : 'SPENT'} (blockstream)`);
            return isUnspent;
        } catch (error) {
            console.error(`[UTXOVerificationService] Both APIs failed for ${txid}:${vout}`);
            // If both APIs fail, assume UTXO is valid to avoid blocking transactions
            return true;
        }
    }

    /**
     * Verify multiple UTXOs and return spent/unspent lists
     */
    async verifyUtxos(utxos) {
        console.log(`[UTXOVerificationService] Verifying ${utxos.length} UTXOs...`);
        
        const results = await Promise.allSettled(
            utxos.map(async (utxo) => {
                const isUnspent = await this.verifyUtxo(utxo.txid, utxo.vout);
                return { utxo, isUnspent };
            })
        );

        const unspentUtxos = [];
        const spentUtxos = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                if (result.value.isUnspent) {
                    unspentUtxos.push(result.value.utxo);
                } else {
                    spentUtxos.push(result.value.utxo);
                }
            } else {
                // If verification failed, assume unspent to avoid blocking
                console.warn(`[UTXOVerificationService] Verification failed for UTXO ${index}, assuming unspent`);
                unspentUtxos.push(utxos[index]);
            }
        });

        console.log(`[UTXOVerificationService] Results: ${unspentUtxos.length} unspent, ${spentUtxos.length} spent`);

        return {
            unspentUtxos,
            spentUtxos,
            allValid: spentUtxos.length === 0
        };
    }

    /**
     * Remove spent UTXOs from localStorage
     */
    async removeSpentUtxos(spentUtxos) {
        if (spentUtxos.length === 0) return;

        console.log(`[UTXOVerificationService] Removing ${spentUtxos.length} spent UTXOs from storage`);
        
        try {
            const { utxoService } = await import('@/services/utxo');
            
            for (const utxo of spentUtxos) {
                await utxoService.removeUtxo(utxo.txid, utxo.vout);
                console.log(`[UTXOVerificationService] Removed spent UTXO: ${utxo.txid}:${utxo.vout}`);
            }
        } catch (error) {
            console.error('[UTXOVerificationService] Failed to remove spent UTXOs:', error);
        }
    }
}

export default UTXOVerificationService;
