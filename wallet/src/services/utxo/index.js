// UTXO Service main entry point - Modular architecture
import { utxoService } from './utxo-service';
import { utxoSelector } from './core/selector';
import { utxoVerifier } from './core/verifier';

// Main service export
export { utxoService };

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
}

// Named exports for specific functionality
export * from './utxo-service';
export * from './core/fetcher';
export * from './core/selector';
export * from './core/verifier';
export * from './utils/calculations';

// Default export
export default utxoService;
