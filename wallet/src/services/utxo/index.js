// UTXO Service main entry point for centralized UTXO management

import { UTXOService } from './utxo-service';

// Singleton instance export
export const utxoService = new UTXOService();

// Named exports for specific functionality
export * from './utxo-service';

// Default export
export default utxoService;
