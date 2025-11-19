/**
 * Wallet Sync Service - Compatibility Layer
 * 
 * Re-exports from the new modular sync architecture.
 * This file maintains backward compatibility with existing imports.
 */

export { 
    syncWallet, 
    syncAfterTransfer, 
    syncUTXOsOnly 
} from './sync';
