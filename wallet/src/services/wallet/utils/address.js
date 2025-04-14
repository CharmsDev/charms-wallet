import { getUTXOs, getAddresses } from '@/services/storage';

// Find the address that owns a specific UTXO
export async function findAddressForUTXO(txid, vout) {
    try {
        // Get all UTXOs from storage
        const utxoMap = await getUTXOs();

        // Search through all addresses and their UTXOs
        for (const [address, utxos] of Object.entries(utxoMap)) {
            // Find the UTXO that matches txid and vout
            const matchingUtxo = utxos.find(utxo =>
                utxo.txid === txid && utxo.vout === vout
            );

            if (matchingUtxo) {
                // Get address details
                const addresses = await getAddresses();
                const addressEntry = addresses.find(entry => entry.address === address);

                if (addressEntry) {
                    return {
                        address,
                        index: addressEntry.index,
                        isChange: addressEntry.isChange || false
                    };
                }

                // If we found the UTXO but not the address details, return basic info
                return {
                    address,
                    index: 0,
                    isChange: false
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error finding address for UTXO:', error);
        return null;
    }
}

// Get derivation path for an address
export function getDerivationPath(addressInfo) {
    // Always use Taproot derivation path (BIP-0086)
    const purpose = "86'";

    // Use testnet coinType (1')
    const coinType = "1'";

    // Account index (usually 0')
    const account = "0'";

    // Change (0 for receiving, 1 for change)
    const change = addressInfo.isChange ? "1" : "0";

    // Address index
    const index = addressInfo.index.toString();

    return `m/${purpose}/${coinType}/${account}/${change}/${index}`;
}

export default {
    findAddressForUTXO,
    getDerivationPath
};
