// UTXO Service main entry point - Modular architecture
import { utxoService } from './utxo-service';
import { utxoSelector } from './core/selector';
import { utxoVerifier } from './core/verifier';

// Main service export
export { utxoService };

// Alternative export names (unused, can be removed in future cleanup)
export const utxoStorageService = utxoService;
export const utxoVerificationService = utxoVerifier;
export const utxoManager = utxoService;

// UtxoSelector wrapper class (used by transaction-orchestrator)
export class UtxoSelector {
    constructor() {
        this.selector = utxoSelector;
        this.verifier = utxoVerifier;
    }

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, updateStateCallback = null, blockchain, network) {
        return await this.selector.selectUtxosForAmountDynamic(
            availableUtxos,
            amountInSats,
            feeRate,
            this.verifier,
            updateStateCallback,
            blockchain,
            network
        );
    }

    selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1) {
        return this.selector.selectUtxosForAmount(availableUtxos, amountInSats, feeRate);
    }

    unlockUtxos(utxos) {
        this.selector.unlockUtxos(utxos);
    }

    clearAllLocks() {
        this.selector.clearAllLocks();
    }

    getLockStats() {
        return this.selector.getLockStats();
    }

    getLockedUtxos() {
        return this.selector.getLockedUtxos();
    }

    isUtxoLocked(txid, vout) {
        return this.selector.isUtxoLocked(txid, vout);
    }
}

// Named exports for specific functionality
export * from './utxo-service';
export * from './core/fetcher';
export * from './core/selector';
export * from './core/verifier';
export * from './utils/calculations';

// Default export
export default utxoService;
