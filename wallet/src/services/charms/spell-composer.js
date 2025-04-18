/**
 * Compose charm spells
 */
class CharmsSpellService {
    /**
     * Compose transfer spell (NFT or token)
     * @param {Object} charm The charm to transfer
     * @param {number} transferAmount The amount to transfer
     * @param {string} destinationAddress The destination address
     * @returns {string} The composed spell as a JSON string
     */
    composeTransferSpell(charm, transferAmount, destinationAddress) {
        // Check if the charm is an NFT (starts with "n/")
        if (charm.app.startsWith("n/")) {
            return this.composeNFTTransferSpell(charm, destinationAddress);
        } else {
            return this.composeTokenTransferSpell(charm, transferAmount, destinationAddress);
        }
    }

    /**
     * Compose transfer spell for NFTs
     * For NFTs, we transfer the entire amount and don't create a remaining UTXO
     * @param {Object} charm The NFT charm to transfer
     * @param {string} destinationAddress The destination address
     * @returns {string} The composed spell as a JSON string
     */
    composeNFTTransferSpell(charm, destinationAddress) {
        const [type, appId, appVk] = charm.app.split("/");

        // Create the app key with $ prefix
        const appKey = `$${charm.id}`;

        // Prepare NFT spell composition

        // Validate required data
        if (!type || !appId || !appVk) {
            throw new Error(`Invalid app format: ${charm.app}`);
        }
        if (!charm.txid || charm.outputIndex === undefined || !charm.amount || !charm.address) {
            throw new Error('Invalid charm data');
        }

        // Use safe defaults for template composition
        const targetAddress = destinationAddress || 'DESTINATION_ADDRESS';

        // Validate inputs
        if (!destinationAddress?.trim()) {
            throw new Error('Destination address is required');
        }

        // Validate and prepare values

        // Validate bitcoin addresses
        if (!destinationAddress.match(/^(bc|tb)1[a-zA-HJ-NP-Z0-9]{8,87}$/)) {
            throw new Error('Invalid destination address format');
        }
        if (!charm.address.match(/^(bc|tb)1[a-zA-HJ-NP-Z0-9]{8,87}$/)) {
            throw new Error('Invalid charm address format');
        }

        // Use minimum amount for sats to avoid dust
        const MIN_SATS = 1000; // Bitcoin dust limit is 546

        // Create apps object with dynamic key
        const apps = {};
        apps[appKey] = `${type}/${appId}/${appVk}`;

        // Create charms object with dynamic key
        const charms = {};
        // RJJ-TODO review metadata standard
        // Only include the remaining property if it exists and is not undefined
        const charmData = {
            ticker: charm.amount.ticker
        };

        // Only add the remaining property if it exists
        if (charm.amount.remaining !== undefined) {
            charmData.remaining = charm.amount.remaining;
        }

        charms[appKey] = charmData;

        // Create the spell in the new format - for NFTs we only create one output
        const spell = JSON.stringify({
            version: 2,
            apps,
            ins: [
                {
                    utxo_id: `${charm.txid}:${charm.outputIndex}`,
                    charms
                }
            ],
            outs: [
                {
                    address: targetAddress,
                    charms,
                    sats: MIN_SATS
                }
            ]
        }, null, 2);

        return spell;
    }

    /**
     * Compose transfer spell for tokens
     * For tokens, we can transfer a partial amount and create a remaining UTXO
     * @param {Object} charm The token charm to transfer
     * @param {number} transferAmount The amount to transfer
     * @param {string} destinationAddress The destination address
     * @returns {string} The composed spell as a JSON string
     */
    composeTokenTransferSpell(charm, transferAmount, destinationAddress) {
        const [type, appId, appVk] = charm.app.split("/");

        // Create the app key with $ prefix
        const appKey = `$${charm.id}`;

        // Get the remaining amount from the charm amount
        const totalAmount = charm.amount.remaining;
        const remainingAmount = totalAmount - transferAmount;

        // Prepare token spell composition

        // Validate required data
        if (!type || !appId || !appVk) {
            throw new Error(`Invalid app format: ${charm.app}`);
        }
        if (!charm.txid || charm.outputIndex === undefined || !charm.amount || !charm.address) {
            throw new Error('Invalid charm data');
        }

        // Use safe defaults for template composition
        const targetAddress = destinationAddress || 'DESTINATION_ADDRESS';
        const safeTransferAmount = transferAmount > 0 ? transferAmount : 0;
        const safeRemainingAmount = totalAmount - safeTransferAmount;

        // Only validate amounts if we're actually trying to transfer
        if (transferAmount > 0) {
            if (!destinationAddress?.trim()) {
                throw new Error('Destination address is required');
            }
            if (safeRemainingAmount < 0) {
                throw new Error('Insufficient charm amount');
            }
        }

        // Validate and prepare values

        // Validate bitcoin addresses
        if (transferAmount > 0 && !destinationAddress.match(/^(bc|tb)1[a-zA-HJ-NP-Z0-9]{8,87}$/)) {
            throw new Error('Invalid destination address format');
        }
        if (!charm.address.match(/^(bc|tb)1[a-zA-HJ-NP-Z0-9]{8,87}$/)) {
            throw new Error('Invalid charm address format');
        }

        // Use minimum amount for sats to avoid dust
        const MIN_SATS = 1000; // Bitcoin dust limit is 546

        // Create apps object with dynamic key
        const apps = {};
        apps[appKey] = `${type}/${appId}/${appVk}`;

        // Create input charms object with dynamic key
        const inputCharms = {};
        inputCharms[appKey] = {
            ticker: charm.amount.ticker,
            remaining: totalAmount
        };

        // Create output charms objects with dynamic key
        const outputCharms1 = {};
        outputCharms1[appKey] = {
            ticker: charm.amount.ticker,
            remaining: safeTransferAmount
        };

        const outputCharms2 = {};
        outputCharms2[appKey] = {
            ticker: charm.amount.ticker,
            remaining: safeRemainingAmount
        };

        // Create the spell in the new format
        const spell = JSON.stringify({
            version: 2,
            apps,
            ins: [
                {
                    utxo_id: `${charm.txid}:${charm.outputIndex}`,
                    charms: inputCharms
                }
            ],
            outs: [
                {
                    address: targetAddress,
                    charms: outputCharms1,
                    sats: MIN_SATS
                },
                {
                    address: charm.address,
                    charms: outputCharms2,
                    sats: MIN_SATS
                }
            ]
        }, null, 2);

        return spell;
    }
}

export const charmsSpellService = new CharmsSpellService();
