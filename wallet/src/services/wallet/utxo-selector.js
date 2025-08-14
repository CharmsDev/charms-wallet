import { utxoService } from '@/services/utxo';

/**
 * UTXO Selector - Handles UTXO selection with blacklist and locking
 */
export class UtxoSelector {
    constructor() {
        this.spentUtxosBlacklist = new Set([
            '0847f5b6957b3e0e96002323f47324fc9cc25aedceb79f4520369cd1abdc2957:1'
        ]);
        this.lockedUtxos = new Set();
    }


    selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1) {
        const validUtxos = availableUtxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            return !this.lockedUtxos.has(utxoKey) && !this.spentUtxosBlacklist.has(utxoKey);
        });

        const sortedUtxos = [...validUtxos].sort((a, b) => b.value - a.value);
        const selectedUtxos = [];
        let totalSelected = 0;

        let estimatedFee = utxoService.calculateMixedFee([], 2, feeRate);
        const minimumFee = 200;
        if (estimatedFee < minimumFee) {
            estimatedFee = minimumFee;
        }

        const totalNeeded = amountInSats + estimatedFee;

        for (const utxo of sortedUtxos) {
            if (totalSelected >= totalNeeded) break;

            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.add(utxoKey);
            selectedUtxos.push(utxo);
            totalSelected += utxo.value;
        }

        const sufficientFunds = totalSelected >= totalNeeded;

        return {
            selectedUtxos,
            totalSelected,
            sufficientFunds,
            estimatedFee
        };
    }


    unlockUtxos(utxos) {
        utxos.forEach(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.delete(utxoKey);
        });
    }


    clearAllLocks() {
        this.lockedUtxos.clear();
    }
}
