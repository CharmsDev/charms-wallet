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
    CHARM_RECEIVED: 'charm_received', // Charm/token received from external address
    CHARM_SENT: 'charm_sent',       // Charm/token sent to external address
    CHARM_CONSOLIDATION: 'charm_consolidation', // Charm/token consolidation (2+ inputs)
    CHARM_SELF_TRANSFER: 'charm_self_transfer' // Charm/token self-transfer (internal)
};

// Transaction labels for UI
export const TRANSACTION_LABELS = {
    [TRANSACTION_TYPES.RECEIVED]: 'Received Bitcoin',
    [TRANSACTION_TYPES.SENT]: 'Sent Bitcoin',
    [TRANSACTION_TYPES.BRO_MINING]: 'Bro Mining',
    [TRANSACTION_TYPES.BRO_MINT]: 'Bro Mint',
    [TRANSACTION_TYPES.CHARM_RECEIVED]: 'Received Charm Token',
    [TRANSACTION_TYPES.CHARM_SENT]: 'Sent Charm Token',
    [TRANSACTION_TYPES.CHARM_CONSOLIDATION]: 'Charm Consolidation',
    [TRANSACTION_TYPES.CHARM_SELF_TRANSFER]: 'Charm Self-Transfer'
};

function hasOpReturnAtIndex0(outputs) {
    if (!outputs || outputs.length === 0) return false;
    const firstOutput = outputs[0];
    return firstOutput.address === null || firstOutput.address === undefined;
}

function isCharmAmount(amount) {
    return amount === 330 || amount === 1000;
}

function getCharmInputs(inputs, myAddresses) {
    if (!inputs || inputs.length === 0) return { internal: [], external: [] };
    
    const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
    const internal = [];
    const external = [];
    
    inputs.forEach(input => {
        if (isCharmAmount(input.value)) {
            if (input.address && myAddressSet.has(input.address)) {
                internal.push(input);
            } else if (input.address) {
                external.push(input);
            }
        }
    });
    
    return { internal, external };
}

function getCharmOutputs(outputs, myAddresses) {
    if (!outputs || outputs.length === 0) return { internal: [], external: [] };
    
    const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
    const internal = [];
    const external = [];
    
    outputs.forEach(output => {
        if (isCharmAmount(output.amount)) {
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
    
    console.log(`[Classifier] Classifying tx ${transaction.txid?.slice(0,8)}:`, {
        inputsCount: inputs?.length || 0,
        outputsCount: outputs?.length || 0,
        outputs: outputs?.map(o => ({ address: o.address?.slice(0,8), amount: o.amount }))
    });
    
    if (!outputs || outputs.length === 0) {
        return TRANSACTION_TYPES.RECEIVED;
    }

    // 1. BRO MINING: OP_RETURN at index 0 + 333 or 777 sats
    if (hasOpReturnAtIndex0(outputs)) {
        const has333or777 = outputs.some(o => o.amount === 333 || o.amount === 777);
        if (has333or777) {
            console.log(`[Classifier] → BRO_MINING`);
            return TRANSACTION_TYPES.BRO_MINING;
        }
    }

    // Get charm inputs/outputs classification
    const charmInputs = getCharmInputs(inputs, myAddresses);
    const charmOutputs = getCharmOutputs(outputs, myAddresses);
    
    console.log(`[Classifier] Charm analysis:`, {
        charmInputs: { internal: charmInputs.internal.length, external: charmInputs.external.length },
        charmOutputs: { internal: charmOutputs.internal.length, external: charmOutputs.external.length }
    });
    
    const totalCharmInputs = charmInputs.internal.length + charmInputs.external.length;
    const totalCharmOutputs = charmOutputs.internal.length + charmOutputs.external.length;
    
    // 2. CHARM RECEIVED: External charm inputs → Internal charm outputs
    // Someone sent us charm tokens (inputs NOT ours, outputs ARE ours)
    if (charmInputs.external.length > 0 && charmInputs.internal.length === 0 && charmOutputs.internal.length > 0) {
        console.log(`[Classifier] → CHARM_RECEIVED`);
        return TRANSACTION_TYPES.CHARM_RECEIVED;
    }
    
    // 3. CHARM SENT: Internal charm inputs → External charm outputs
    // We sent charm tokens to someone (inputs ARE ours, outputs NOT ours)
    if (charmInputs.internal.length > 0 && charmOutputs.external.length > 0) {
        console.log(`[Classifier] → CHARM_SENT`);
        return TRANSACTION_TYPES.CHARM_SENT;
    }
    
    // 4. CHARM CONSOLIDATION: Multiple internal charm inputs → Internal outputs
    // We're consolidating our own charm tokens (2+ inputs, all ours)
    if (charmInputs.internal.length > 1 && charmInputs.external.length === 0) {
        console.log(`[Classifier] → CHARM_CONSOLIDATION`);
        return TRANSACTION_TYPES.CHARM_CONSOLIDATION;
    }
    
    // 5. CHARM SELF-TRANSFER: Single internal charm input → Internal charm output
    // We're moving charm tokens between our own addresses
    if (charmInputs.internal.length === 1 && charmInputs.external.length === 0 && 
        charmOutputs.internal.length > 0 && charmOutputs.external.length === 0) {
        console.log(`[Classifier] → CHARM_SELF_TRANSFER`);
        return TRANSACTION_TYPES.CHARM_SELF_TRANSFER;
    }

    // 6. BRO MINT: No charm inputs but has charm output to our address
    // We're minting new charm tokens
    if (totalCharmInputs === 0 && charmOutputs.internal.length > 0) {
        console.log(`[Classifier] → BRO_MINT`);
        return TRANSACTION_TYPES.BRO_MINT;
    }

    // 7. STANDARD BITCOIN: Sent or Received
    if (myAddresses && myAddresses.length > 0) {
        const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
        const hasMyInput = inputs && inputs.some(input => 
            input.address && myAddressSet.has(input.address)
        );
        
        if (hasMyInput) {
            console.log(`[Classifier] → SENT`);
            return TRANSACTION_TYPES.SENT;
        }
    }

    console.log(`[Classifier] → RECEIVED (default)`);
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
        case TRANSACTION_TYPES.CHARM_RECEIVED:
            return '↙';  // Same as Bitcoin received
        case TRANSACTION_TYPES.CHARM_SENT:
            return '↗';  // Same as Bitcoin sent
        case TRANSACTION_TYPES.CHARM_CONSOLIDATION:
            return '↻';  // Same as self-transfer
        case TRANSACTION_TYPES.CHARM_SELF_TRANSFER:
            return '↻';
        default:
            return '↙';
    }
}
