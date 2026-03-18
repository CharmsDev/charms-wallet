/**
 * Wallet Sync Service
 *
 * Primary orchestrator. Uses the Explorer indexed API for instant balance + charm data.
 * Falls back to UTXO-only scan if Explorer is unavailable.
 */

import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { syncWalletExplorer } from './explorer-wallet-sync';

/**
 * Sync wallet data (UTXOs and Charms)
 */
export async function syncWallet(options = {}) {
    const {
        addresses = null,
        blockchain = BLOCKCHAINS.BITCOIN,
        network = NETWORKS.BITCOIN.MAINNET,
        fullScan = false,
        skipCharms = false,
        onUTXOProgress = null,
        onCharmFound = null,
        updateUTXOStore = null,
        addressLimit = null,
        onPhase1Complete = null,
    } = options;

    return syncWalletExplorer({
        addresses,
        blockchain,
        network,
        fullScan,
        skipCharms,
        onUTXOProgress,
        onCharmFound,
        updateUTXOStore,
        addressLimit,
        onPhase1Complete,
    });
}

/**
 * Sync after charm transfer
 */
export async function syncAfterTransfer(transferData, blockchain, network, onCharmFound) {
    const { inputAddresses = [], changeAddress, fundingAddress } = transferData;

    const addressesToSync = new Set();
    inputAddresses.forEach(addr => { if (addr) addressesToSync.add(addr); });
    if (changeAddress) addressesToSync.add(changeAddress);
    if (fundingAddress) addressesToSync.add(fundingAddress);

    return await syncWallet({
        addresses: Array.from(addressesToSync),
        blockchain,
        network,
        fullScan: false,
        skipCharms: false,
        onCharmFound
    });
}

/**
 * UTXO-only sync (for UTXO tab)
 */
export async function syncUTXOsOnly(blockchain, network, updateUTXOStore, addressLimit = null) {
    return await syncWallet({
        blockchain,
        network,
        fullScan: true,
        skipCharms: true,
        updateUTXOStore,
        addressLimit
    });
}
