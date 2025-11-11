/**
 * Transaction Classifier
 * Classifies Bitcoin transactions into different types based on their characteristics
 */

// Transaction types
export const TRANSACTION_TYPES = {
    RECEIVED: 'received',           // Standard Bitcoin received
    SENT: 'sent',                   // Standard Bitcoin sent
    BRO_MINING: 'bro_mining',       // Bro token mining (333 or 777 sats + OP_RETURN at index 0)
    BRO_MINT: 'bro_mint',           // Bro token minting (1000 or 330 sats + change)
    CHARM_TRANSFER: 'charm_transfer', // Charm/token transfer to external address
    CHARM_CONSOLIDATION: 'charm_consolidation', // Charm/token consolidation (2+ inputs)
    CHARM_SELF_TRANSFER: 'charm_self_transfer' // Charm/token self-transfer (1 input)
};

// Transaction labels for UI
export const TRANSACTION_LABELS = {
    [TRANSACTION_TYPES.RECEIVED]: 'Received Bitcoin',
    [TRANSACTION_TYPES.SENT]: 'Sent Bitcoin',
    [TRANSACTION_TYPES.BRO_MINING]: 'Bro Mining',
    [TRANSACTION_TYPES.BRO_MINT]: 'Bro Mint',
    [TRANSACTION_TYPES.CHARM_TRANSFER]: 'Charm Transfer',
    [TRANSACTION_TYPES.CHARM_CONSOLIDATION]: 'Charm Consolidation',
    [TRANSACTION_TYPES.CHARM_SELF_TRANSFER]: 'Charm Self-Transfer'
};

function hasOpReturnAtIndex0(outputs) {
    if (!outputs || outputs.length === 0) return false;
    const firstOutput = outputs[0];
    return firstOutput.address === null || firstOutput.address === undefined;
}

function countCharmInputs(inputs) {
    if (!inputs || inputs.length === 0) return 0;
    return inputs.filter(input => input.value === 330 || input.value === 1000).length;
}

function getCharmOutputs(outputs, myAddresses) {
    if (!outputs || outputs.length === 0) return { internal: [], external: [] };
    
    const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
    const internal = [];
    const external = [];
    
    outputs.forEach(output => {
        if (output.amount === 330 || output.amount === 1000) {
            if (output.address && myAddressSet.has(output.address)) {
                internal.push(output);
            } else if (output.address) {
                external.push(output);
            }
        }
    });
    
    return { internal, external };
}

export function classifyTransaction(transaction, myAddresses = []) {
    const { outputs, inputs } = transaction;
    
    if (!outputs || outputs.length === 0) {
        return TRANSACTION_TYPES.RECEIVED;
    }

    // 1. BRO MINING: OP_RETURN at index 0 + 333 or 777 sats
    if (hasOpReturnAtIndex0(outputs)) {
        const has333or777 = outputs.some(o => o.amount === 333 || o.amount === 777);
        if (has333or777) {
            return TRANSACTION_TYPES.BRO_MINING;
        }
    }

    const charmInputCount = countCharmInputs(inputs);
    
    // 2. CHARM TRANSACTIONS: Multiple charm inputs (330 or 1000 sats)
    if (charmInputCount > 1) {
        const charmOutputs = getCharmOutputs(outputs, myAddresses);
        
        // 2a. CHARM TRANSFER: Has external charm output
        if (charmOutputs.external.length > 0) {
            return TRANSACTION_TYPES.CHARM_TRANSFER;
        }
        
        // 2b. CONSOLIDATION PARTIAL: Multiple internal charm outputs
        if (charmOutputs.internal.length > 1) {
            return TRANSACTION_TYPES.CHARM_CONSOLIDATION;
        }
        
        // 2c. CONSOLIDATION TOTAL: Single internal charm output
        if (charmOutputs.internal.length === 1) {
            return TRANSACTION_TYPES.CHARM_CONSOLIDATION;
        }
    }
    
    // 3. CHARM SELF-TRANSFER: Single charm input
    if (charmInputCount === 1) {
        const hasCharmOutput = outputs.some(o => o.amount === 330 || o.amount === 1000);
        if (hasCharmOutput) {
            return TRANSACTION_TYPES.CHARM_SELF_TRANSFER;
        }
    }

    // 4. BRO MINT: No charm inputs but has 330 or 1000 sat output
    if (charmInputCount === 0) {
        const hasCharmOutput = outputs.some(o => o.amount === 330 || o.amount === 1000);
        if (hasCharmOutput) {
            return TRANSACTION_TYPES.BRO_MINT;
        }
    }

    // 5. STANDARD BITCOIN: Sent or Received
    if (myAddresses && myAddresses.length > 0) {
        const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
        const hasMyInput = inputs && inputs.some(input => 
            input.address && myAddressSet.has(input.address)
        );
        
        if (hasMyInput) {
            return TRANSACTION_TYPES.SENT;
        }
    }

    return TRANSACTION_TYPES.RECEIVED;
}

/**
 * Get transaction label for UI display
 */
export function getTransactionLabel(transactionType) {
    return TRANSACTION_LABELS[transactionType] || TRANSACTION_LABELS[TRANSACTION_TYPES.RECEIVED];
}

/**
 * Get transaction icon/emoji for UI display
 */
export function getTransactionIcon(transactionType) {
    switch (transactionType) {
        case TRANSACTION_TYPES.RECEIVED:
            return '↙';
        case TRANSACTION_TYPES.SENT:
            return '↗';
        case TRANSACTION_TYPES.BRO_MINING:
            return '⛏️';
        case TRANSACTION_TYPES.BRO_MINT:
            return '🪙';
        case TRANSACTION_TYPES.CHARM_TRANSFER:
            return '🎁';
        case TRANSACTION_TYPES.CHARM_CONSOLIDATION:
            return '🔄';
        case TRANSACTION_TYPES.CHARM_SELF_TRANSFER:
            return '↻';
        default:
            return '↙';
    }
}
