import { ProcessedCharm, UTXO, UTXOMap } from '@/types';

class CharmsService {
    private readonly CHARMS_API_BASE = process.env.NEXT_PUBLIC_CHARMS_API_URL || 'https://api-wallet-test.charms.dev';

    async getCharmsByUTXOs(utxos: UTXOMap): Promise<ProcessedCharm[]> {
        try {
            // Get all unique transaction IDs
            const txIds = Array.from(new Set(Object.values(utxos).flat().map(utxo => utxo.txid)));

            // Make all requests in parallel
            const responses = await Promise.all(
                txIds.map(async txId => {
                    const response = await fetch(`${this.CHARMS_API_BASE}/spells/${txId}`);
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

                        // Parse charm data based on the format
                        // The amount can be either a number or an object with metadata
                        let charmAmount;

                        if (typeof amount === 'object' && amount !== null) {
                            // New format with metadata
                            charmAmount = {
                                ticker: 'ticker' in amount && typeof amount.ticker === 'string'
                                    ? amount.ticker
                                    : `CHARM-${appId}`,
                                remaining: 'remaining' in amount && typeof amount.remaining === 'number'
                                    ? amount.remaining
                                    : 0,
                                name: 'name' in amount && typeof amount.name === 'string'
                                    ? amount.name
                                    : undefined,
                                description: 'description' in amount && typeof amount.description === 'string'
                                    ? amount.description
                                    : undefined,
                                image: 'image' in amount && typeof amount.image === 'string'
                                    ? amount.image
                                    : undefined,
                                image_hash: 'image_hash' in amount && typeof amount.image_hash === 'string'
                                    ? amount.image_hash
                                    : undefined,
                                url: 'url' in amount && typeof amount.url === 'string'
                                    ? amount.url
                                    : undefined
                            };
                        } else {
                            // Old format (just a number)
                            charmAmount = {
                                ticker: `CHARM-${appId}`,
                                remaining: typeof amount === 'number' ? amount : 0
                            };
                        }

                        // Log the parsed charm data for debugging
                        console.log(`Parsed charm ${appId}:`, charmAmount);

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

    // Helper method to determine if a charm is an NFT
    isNFT(charm: ProcessedCharm): boolean {
        return charm.app.startsWith("n/");
    }

    // Helper method to get a display name for a charm
    getCharmDisplayName(charm: ProcessedCharm): string {
        if (this.isNFT(charm)) {
            return `NFT: ${charm.id}`;
        } else {
            return `${charm.amount.ticker || `CHARM-${charm.id}`}`;
        }
    }
}

export const charmsService = new CharmsService();
