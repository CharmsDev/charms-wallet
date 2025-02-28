import { CHARMS_API_URL } from '@services/shared/constants';
import type { ProcessedCharm, SpellTemplate, UTXO } from '@app-types/index';

export { transactionService } from '@services/transaction';
export { transferCharmsService } from './transfer';

class CharmsService {
    private readonly API_BASE: string = CHARMS_API_URL;

    /**
     * Composes a transfer spell based on the charm type (NFT or token)
     * @param charm The charm to transfer
     * @param transferAmount The amount to transfer
     * @param destinationAddress The destination address
     * @returns The composed spell as a JSON string
     */
    composeTransferSpell(charm: ProcessedCharm, transferAmount: number, destinationAddress: string): string {
        // Check if the charm is an NFT (starts with "n/")
        if (charm.app.startsWith("n/")) {
            return this.composeNFTTransferSpell(charm, destinationAddress);
        } else {
            return this.composeTokenTransferSpell(charm, transferAmount, destinationAddress);
        }
    }

    /**
     * Composes a transfer spell for NFTs
     * For NFTs, we transfer the entire amount and don't create a remaining UTXO
     * @param charm The NFT charm to transfer
     * @param destinationAddress The destination address
     * @returns The composed spell as a JSON string
     */
    composeNFTTransferSpell(charm: ProcessedCharm, destinationAddress: string): string {
        const [type, appId, appVk] = charm.app.split("/");

        // Create the app key with $ prefix
        const appKey = `$${charm.id}`;

        // Log composition details for debugging
        console.log('Composing NFT spell with:', {
            charm,
            destinationAddress,
            appParts: { type, appId, appVk },
            appKey
        });

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

        console.log('Composing NFT spell with values:', {
            charm_address: charm.address,
            target_address: targetAddress,
            transfer_amount: charm.amount.remaining,
            appKey
        });

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
        const apps: Record<string, string> = {};
        apps[appKey] = `${type}/${appId}/${appVk}`;

        // Create charms object with dynamic key
        const charms: Record<string, any> = {};
        charms[appKey] = {
            ticker: charm.amount.ticker,
            remaining: charm.amount.remaining
        };

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

        console.log('Generated NFT spell:', spell);
        return spell;
    }

    /**
     * Composes a transfer spell for tokens
     * For tokens, we can transfer a partial amount and create a remaining UTXO
     * @param charm The token charm to transfer
     * @param transferAmount The amount to transfer
     * @param destinationAddress The destination address
     * @returns The composed spell as a JSON string
     */
    composeTokenTransferSpell(charm: ProcessedCharm, transferAmount: number, destinationAddress: string): string {
        const [type, appId, appVk] = charm.app.split("/");

        // Create the app key with $ prefix
        const appKey = `$${charm.id}`;

        // Get the remaining amount from the charm amount
        const totalAmount = charm.amount.remaining;
        const remainingAmount = totalAmount - transferAmount;

        // Log composition details for debugging
        console.log('Composing token spell with:', {
            charm,
            transferAmount,
            destinationAddress,
            totalAmount,
            remainingAmount,
            appParts: { type, appId, appVk },
            appKey
        });

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

        console.log('Composing token spell with values:', {
            charm_address: charm.address,
            target_address: targetAddress,
            transfer_amount: safeTransferAmount,
            remaining_amount: safeRemainingAmount,
            appKey
        });

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
        const apps: Record<string, string> = {};
        apps[appKey] = `${type}/${appId}/${appVk}`;

        // Create input charms object with dynamic key
        const inputCharms: Record<string, any> = {};
        inputCharms[appKey] = {
            ticker: charm.amount.ticker,
            remaining: totalAmount
        };

        // Create output charms objects with dynamic key
        const outputCharms1: Record<string, any> = {};
        outputCharms1[appKey] = {
            ticker: charm.amount.ticker,
            remaining: safeTransferAmount
        };

        const outputCharms2: Record<string, any> = {};
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

        console.log('Generated token spell:', spell);
        return spell;
    }

    async getCharmsByUTXOs(utxos: { [address: string]: UTXO[] }): Promise<ProcessedCharm[]> {
        try {
            // Get all unique transaction IDs
            const txIds = [...new Set(Object.values(utxos).flat().map(utxo => utxo.txid))];

            // Make all requests in parallel
            const responses = await Promise.all(
                txIds.map(async txId => {
                    const response = await fetch(`${this.API_BASE}/spells/${txId}`);
                    if (!response.ok) return null;
                    const text = await response.text(); // Get response as text first
                    if (!text) return null; // If empty response, return null
                    try {
                        return JSON.parse(text); // Then try to parse it
                    } catch (e) {
                        console.error(`Invalid JSON response for txId ${txId}:`, text);
                        return null;
                    }
                })
            );

            // Process all responses
            const charms: ProcessedCharm[] = [];
            responses.forEach((data, index) => {
                if (!data || !data.outs) return;

                const txId = txIds[index];
                data.outs.forEach((out: any, outputIndex: number) => {
                    if (!out.charms) return;

                    Object.entries(out.charms).forEach(([id, amount]) => {
                        const appId = id.replace('$', '');
                        const app = data.apps?.[id];
                        if (!app) {
                            console.error(`App not found for id ${id} in transaction ${txId}`);
                            return;
                        }

                        // Find the address that owns this UTXO
                        const ownerAddress = Object.entries(utxos).find(([addr, utxoList]) =>
                            utxoList.some(utxo => utxo.txid === txId)
                        )?.[0] || '';

                        const isValidAddress = ownerAddress.startsWith('tb1') || ownerAddress.startsWith('bc1');
                        if (!isValidAddress) {
                            console.error(`Invalid address format for UTXO ${txId}`);
                            return;
                        }

                        // Validate app format (should be type/appId/appVk)
                        if (!app.includes('/')) {
                            console.error(`Invalid app format for id ${id}: ${app}`);
                            return;
                        }

                        // Check if amount is an object with a 'remaining' property (new format)
                        // or a number (old format)
                        const charmAmount = typeof amount === 'object' && amount !== null && 'remaining' in amount
                            ? {
                                ticker: 'ticker' in amount && typeof amount.ticker === 'string'
                                    ? amount.ticker
                                    : `CHARM-${appId}`,
                                remaining: 'remaining' in amount && typeof amount.remaining === 'number'
                                    ? amount.remaining
                                    : 0
                            }
                            : {
                                ticker: `CHARM-${appId}`,
                                remaining: typeof amount === 'number' ? amount : 0
                            };

                        charms.push({
                            uniqueId: `${txId}-${appId}-${outputIndex}-${JSON.stringify(charmAmount)}`,
                            id: appId,
                            amount: charmAmount,
                            app,
                            outputIndex,
                            txid: txId,
                            address: ownerAddress,
                            commitTxId: null,
                            spellTxId: null
                        });
                    });
                });
            });

            return charms;
        } catch (error) {
            console.error('Error fetching charms:', error);
            return [];
        }
    }
}

export const charmsService = new CharmsService();
