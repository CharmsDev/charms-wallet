import { ProcessedCharm, UTXO, UTXOMap } from '@/types';

class CharmsService {
    private readonly API_BASE = 'https://mempool.space/testnet4/api';
    private readonly CHARMS_API_BASE = process.env.NEXT_PUBLIC_CHARMS_API_URL || 'http://localhost:3333';

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
