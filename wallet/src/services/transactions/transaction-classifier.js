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
    CHARM_CONSOLIDATION: 'charm_consolidation' // Charm/token consolidation (self-transfer)
};

// Transaction labels for UI
export const TRANSACTION_LABELS = {
    [TRANSACTION_TYPES.RECEIVED]: 'Received Bitcoin',
    [TRANSACTION_TYPES.SENT]: 'Sent Bitcoin',
    [TRANSACTION_TYPES.BRO_MINING]: 'Bro Mining',
    [TRANSACTION_TYPES.BRO_MINT]: 'Bro Mint',
    [TRANSACTION_TYPES.CHARM_TRANSFER]: 'Charm Transfer',
    [TRANSACTION_TYPES.CHARM_CONSOLIDATION]: 'Charm Consolidation'
};

/**
 * Check if transaction has OP_RETURN data at index 0
 */
function hasOpReturnAtIndex0(outputs) {
    if (!outputs || outputs.length === 0) return false;
    const firstOutput = outputs[0];
    // OP_RETURN outputs typically have no address
    return firstOutput.address === null || firstOutput.address === undefined;
}

/**
 * Check if transaction contains specific satoshi amounts
 */
function hasOutputWithAmount(outputs, amount) {
    if (!outputs || outputs.length === 0) return false;
    return outputs.some(output => output.amount === amount);
}

/**
 * Classify transaction type based on outputs and inputs
 * 
 * @param {Object} transaction - Transaction object with inputs and outputs
 * @param {Array} myAddresses - Array of user's addresses to determine if received/sent
 * @returns {string} Transaction type from TRANSACTION_TYPES
 */
export function classifyTransaction(transaction, myAddresses = []) {
    const { outputs, inputs } = transaction;
    
    if (!outputs || outputs.length === 0) {
        return TRANSACTION_TYPES.RECEIVED; // Default fallback
    }

    // Check for Bro Mining: OP_RETURN at index 0 + (333 or 777 sats)
    if (hasOpReturnAtIndex0(outputs)) {
        if (hasOutputWithAmount(outputs, 333) || hasOutputWithAmount(outputs, 777)) {
            return TRANSACTION_TYPES.BRO_MINING;
        }
    }

    // Check for Bro Mint: (1000 or 330 sats) + change
    // Mint transactions typically have 2+ outputs (mint amount + change)
    if (outputs.length >= 2) {
        if (hasOutputWithAmount(outputs, 1000) || hasOutputWithAmount(outputs, 330)) {
            return TRANSACTION_TYPES.BRO_MINT;
        }
    }

    // Determine if sent or received based on addresses
    if (myAddresses && myAddresses.length > 0) {
        const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
        
        // Check if any input is from our addresses (we sent it)
        const hasMyInput = inputs && inputs.some(input => 
            input.address && myAddressSet.has(input.address)
        );
        
        if (hasMyInput) {
            return TRANSACTION_TYPES.SENT;
        }
    }

    // Default: received transaction
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
        default:
            return '↙';
    }
}
