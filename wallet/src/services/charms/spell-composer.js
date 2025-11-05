import { SPELL_VERSION, MIN_SATS, ADDRESS_REGEX, CHARM_TYPES } from './constants';

/**
 * Compose charm spells
 */
class CharmsSpellService {
    /**
     * Compose transfer spell - Router
     * 
     * Handles token transfers
     * - charm.appId: Token app identifier
     * - charm.amount: Amount in smallest units
     * - charm.metadata.ticker: Token ticker
     * - charm.decimals: Token decimals
     */
    composeTransferSpell(charm, transferAmount, destinationAddress) {
        // Extract type from appId string "t/..." or "n/..."
        const type = charm.appId?.split('/')[0];
        const isNFT = type === CHARM_TYPES.NFT;
        
        if (isNFT) {
            // TODO: NFT Transfer - Not implemented yet
            throw new Error('NFT transfers not implemented yet.');
        }
        
        // Token transfer - check if full or partial
        const totalAmount = charm.amount || 0;
        const isFullTransfer = (transferAmount === totalAmount);
        
        if (isFullTransfer) {
            // CASE 1: Transfer ALL tokens → 1 output
            return this.composeTokenFullTransfer(charm, destinationAddress);
        } else {
            // CASE 2: Transfer PARTIAL tokens → 2 outputs (destination + change)
            return this.composeTokenPartialTransfer(charm, transferAmount, destinationAddress);
        }
    }

    /**
     * NFT Transfer - NOT IMPLEMENTED
     * TODO: Implement when needed
     */
    composeNFTTransfer(charm, destinationAddress) {
        throw new Error('NFT transfers not implemented yet');
    }

    /**
     * CASE 1: Token Full Transfer
     * 1 input → 1 output (destination)
     * Transfer ALL tokens to destination
     * 
     * Example:
     * - amount: Token amount in smallest units
     * - decimals: Token decimals
     * - displayAmount: Human-readable amount
     */
    composeTokenFullTransfer(charm, destinationAddress) {
        // Validaciones
        if (!destinationAddress || !destinationAddress.trim()) {
            throw new Error('Destination address is required');
        }
        if (!charm.address) {
            throw new Error('Charm address is missing');
        }

        // Use simple app key: $01
        const appKey = '$01';

        // Apps: use appId directly
        const apps = { [appKey]: charm.appId };

        // Amount as direct number (no ticker/remaining object)
        const amount = charm.amount || 0;

        // Spell: 1 input → 1 output (destino con todo)
        const spell = {
            version: SPELL_VERSION,
            apps,
            ins: [{
                utxo_id: `${charm.txid}:${charm.outputIndex}`,
                charms: { [appKey]: amount }
            }],
            outs: [{
                address: destinationAddress,
                charms: { [appKey]: amount },
                sats: MIN_SATS
            }]
        };

        return this.serializeSpell(spell);
    }

    /**
     * CASE 2: Token Partial Transfer
     * 1 input → 2 outputs (destination + change)
     * Transfer PART of tokens, rest returns as change
     * 
     * Example:
     * - Total: Total token amount
     * - Transfer: Amount to send
     * - Change: Remaining amount back to sender
     */
    composeTokenPartialTransfer(charm, transferAmount, destinationAddress) {
        // Validaciones
        if (!destinationAddress || !destinationAddress.trim()) {
            throw new Error('Destination address is required');
        }
        if (!charm.address) {
            throw new Error('Charm address is missing');
        }

        // amount is a number
        const totalAmount = charm.amount || 0;
        const changeAmount = totalAmount - transferAmount;

        if (transferAmount <= 0) {
            throw new Error('Transfer amount must be greater than 0');
        }
        if (changeAmount <= 0) {
            throw new Error('Change amount must be greater than 0 for partial transfer');
        }

        // Use simple app key: $01
        const appKey = '$01';

        // Apps: use appId directly
        const apps = { [appKey]: charm.appId };

        // Spell: 1 input → 2 outputs (destino + cambio)
        // Amounts as direct numbers (no ticker/remaining object)
        const spell = {
            version: SPELL_VERSION,
            apps,
            ins: [{
                utxo_id: `${charm.txid}:${charm.outputIndex}`,
                charms: { [appKey]: totalAmount }
            }],
            outs: [
                {
                    address: destinationAddress,
                    charms: { [appKey]: transferAmount },
                    sats: MIN_SATS
                },
                {
                    address: charm.address, // Change back to source
                    charms: { [appKey]: changeAmount },
                    sats: MIN_SATS
                }
            ]
        };

        return this.serializeSpell(spell);
    }

    /**
     * Serialize spell object to JSON string with correct key ordering
     * @param {Object} spell The spell object to serialize
     * @returns {string} JSON string with proper formatting
     */
    serializeSpell(spell) {
        // Format inputs - keep charm values as direct numbers
        const formattedIns = spell.ins.map(input => {
            return {
                "utxo_id": input.utxo_id,
                "charms": input.charms // Keep as-is (direct numbers)
            };
        });

        // Format outputs - keep charm values as direct numbers
        const formattedOuts = spell.outs.map(output => {
            return {
                "address": output.address,
                "charms": output.charms, // Keep as-is (direct numbers)
                "sats": output.sats
            };
        });

        // Assemble final spell object with proper ordering
        const formattedSpell = {
            "version": spell.version,
            "apps": spell.apps,
            "ins": formattedIns,
            "outs": formattedOuts
        };

        return JSON.stringify(formattedSpell, null, 2);
    }
}

export const charmsSpellService = new CharmsSpellService();
