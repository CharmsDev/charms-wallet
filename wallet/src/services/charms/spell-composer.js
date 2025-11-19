import { SPELL_VERSION, MIN_SATS, CHARM_TYPES } from './constants';
import { getCharmUtxoAmount } from './utils/charm-utils';

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
            return this.composeNFTTransfer(charm, destinationAddress);
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
     * NFT Transfer
     * 1 input → 1 output (destination)
     * NFTs are always transferred in full
     */
    composeNFTTransfer(charm, destinationAddress) {
        if (!destinationAddress || !destinationAddress.trim()) {
            throw new Error('Destination address is required');
        }
        if (!charm.address) {
            throw new Error('Charm address is missing');
        }

        const appKey = '$01';
        const apps = { [appKey]: charm.appId };
        const amount = charm.amount || 1;

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
     * CASE 3: Token Multi-Input Transfer
     * Multiple inputs → 1 or 2 outputs (destination + optional change)
     * Combines multiple UTXOs to reach transfer amount
     * 
     * @param {Array} charmUtxos - Array of charm UTXOs to use as inputs
     * @param {number} transferAmount - Amount to transfer
     * @param {string} destinationAddress - Destination address
     * @param {string} changeAddress - Change address (usually address index 0)
     * @returns {string} Serialized spell JSON
     */
    composeTokenMultiInputTransfer(charmUtxos, transferAmount, destinationAddress, changeAddress) {
        if (!charmUtxos || charmUtxos.length === 0) {
            throw new Error('At least one charm UTXO is required');
        }
        if (!destinationAddress || !destinationAddress.trim()) {
            throw new Error('Destination address is required');
        }
        if (!changeAddress || !changeAddress.trim()) {
            throw new Error('Change address is required');
        }

        // All UTXOs must have the same appId
        const appId = charmUtxos[0].appId;
        const allSameAppId = charmUtxos.every(utxo => utxo.appId === appId);
        if (!allSameAppId) {
            throw new Error('All charm UTXOs must have the same appId');
        }

        const appKey = '$01';
        const apps = { [appKey]: appId };

        // Build inputs from all UTXOs
        const ins = charmUtxos.map(utxo => {
            const amount = getCharmUtxoAmount(utxo);
            return {
                utxo_id: `${utxo.txid}:${utxo.outputIndex}`,
                charms: { [appKey]: amount }
            };
        });

        // Calculate total amount
        const totalAmount = charmUtxos.reduce(
            (sum, utxo) => sum + getCharmUtxoAmount(utxo),
            0
        );

        if (totalAmount < transferAmount) {
            throw new Error(`Insufficient total amount. Have ${totalAmount}, need ${transferAmount}`);
        }

        const changeAmount = totalAmount - transferAmount;

        // Build outputs
        const outs = [
            {
                address: destinationAddress,
                charms: { [appKey]: transferAmount },
                sats: MIN_SATS
            }
        ];

        // Add change output if needed
        if (changeAmount > 0) {
            outs.push({
                address: changeAddress,
                charms: { [appKey]: changeAmount },
                sats: MIN_SATS
            });
        }

        const spell = {
            version: SPELL_VERSION,
            apps,
            ins,
            outs
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
