// Charms Detection Utility - Handles Bitcoin charms detection
/**
 * Check if a UTXO is a charm
 * @param {Object} utxo - The UTXO to check
 * @param {Array} charms - Array of charm objects
 * @returns {boolean} - True if UTXO is a charm
 */
export function isCharmUtxo(utxo, charms = []) {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    
    // Create set of charm UTXO identifiers
    const charmUtxoIds = new Set();
    charms.forEach(charm => {
        if (charm.txid && charm.outputIndex !== undefined) {
            charmUtxoIds.add(`${charm.txid}:${charm.outputIndex}`);
        }
        // Handle utxo property format
        if (charm.utxo) {
            const { txid, vout } = charm.utxo;
            const voutStr = vout?.toString() || '0';
            if (txid) {
                charmUtxoIds.add(`${txid}:${voutStr}`);
            }
        }
        // Handle uniqueId format variations
        if (charm.uniqueId) {
            const uid = charm.uniqueId;
            if (/^[0-9a-fA-F]+:\d+$/.test(uid)) {
                charmUtxoIds.add(uid);
            } else if (uid.includes('-')) {
                const parts = uid.split('-');
                if (parts.length >= 3) {
                    const txid = parts[0];
                    const vout = parts[parts.length - 1];
                    if (/^\d+$/.test(vout)) {
                        charmUtxoIds.add(`${txid}:${vout}`);
                    }
                }
            }
        }
    });
    
    return charmUtxoIds.has(utxoId);
}

/**
 * Check if a UTXO is a potential charm (temporary security filter)
 * @param {Object} utxo - The UTXO to check
 * @returns {boolean} - True if UTXO matches potential charm patterns
 */
export function isPotentialCharm(utxo) {
    return utxo.value === 1000 || utxo.value === 330 || utxo.value === 333 || utxo.value === 777;
}

/**
 * Get charm information for a specific UTXO
 * @param {Object} utxo - The UTXO to check
 * @param {Array} charms - Array of charm objects
 * @returns {Object|null} - Charm object if found, null otherwise
 */
export function getCharmInfo(utxo, charms = []) {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    
    return charms.find(charm => {
        // Check direct txid:outputIndex format
        if (charm.txid && charm.outputIndex !== undefined) {
            const charmId = `${charm.txid}:${charm.outputIndex}`;
            if (charmId === utxoId) return true;
        }
        
        // Check utxo property format
        if (charm.utxo) {
            const { txid, vout } = charm.utxo;
            const voutStr = vout?.toString() || '0';
            if (txid && `${txid}:${voutStr}` === utxoId) return true;
        }
        
        // Check uniqueId format variations
        if (charm.uniqueId) {
            const uid = charm.uniqueId;
            if (/^[0-9a-fA-F]+:\d+$/.test(uid) && uid === utxoId) {
                return true;
            } else if (uid.includes('-')) {
                const parts = uid.split('-');
                if (parts.length >= 3) {
                    const txid = parts[0];
                    const vout = parts[parts.length - 1];
                    if (/^\d+$/.test(vout) && `${txid}:${vout}` === utxoId) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }) || null;
}

/**
 * Filter UTXOs to exclude charms
 * @param {Array} utxos - Array of UTXOs to filter
 * @param {Array} charms - Array of charm objects
 * @returns {Array} - Filtered UTXOs without charms
 */
export function filterOutCharms(utxos, charms = []) {
    return utxos.filter(utxo => !isCharmUtxo(utxo, charms));
}

/**
 * Filter UTXOs to exclude potential charms (temporary security filter)
 * @param {Array} utxos - Array of UTXOs to filter
 * @returns {Array} - Filtered UTXOs without potential charm patterns
 */
export function filterOutPotentialCharms(utxos) {
    return utxos.filter(utxo => !isPotentialCharm(utxo));
}
