/**
 * Address rehydration helper.
 *
 * Called after a storage wipe (or any time the wallet has a seed phrase
 * but no derived addresses). Derives the canonical first batch for every
 * supported (blockchain, network) pair and persists them. Idempotent:
 * if addresses already exist for a (chain, network), that pair is skipped.
 *
 * The wallet's normal sync flow does not derive addresses — it reads them
 * from storage. So whenever the storage version bumps and we wipe, this
 * helper has to run before any sync, otherwise sync hits zero addresses.
 */

import { getSeedPhrase, getAddresses, saveAddresses } from '@/services/storage';

const BTC_NETWORKS = ['mainnet', 'testnet4'];
const ADA_NETWORKS = ['mainnet', 'preprod'];
const BTC_PAIRS_PER_NETWORK = 6; // 6 receive + 6 change = 12 addresses per network

export async function rehydrateAddressesIfNeeded() {
    const seed = await getSeedPhrase();
    if (!seed) return { skipped: 'no seed' };

    const summary = { bitcoin: {}, cardano: {} };

    // ── Bitcoin ─────────────────────────────────────────────────────────
    try {
        const bitcoin = await import('bitcoinjs-lib');
        const { generateInitialBitcoinAddressesFast, getNetwork } = await import('@/utils/addressUtils');

        for (const net of BTC_NETWORKS) {
            const existing = await getAddresses('bitcoin', net);
            if (existing.length > 0) {
                summary.bitcoin[net] = `kept ${existing.length}`;
                continue;
            }
            const targetNetwork = net === 'mainnet'
                ? bitcoin.networks.bitcoin
                : getNetwork();

            const generated = await new Promise((resolve, reject) => {
                generateInitialBitcoinAddressesFast(
                    seed,
                    () => {},
                    (addrs) => resolve(addrs),
                    targetNetwork,
                    BTC_PAIRS_PER_NETWORK,
                );
                // Defensive timeout — derivation should be fast.
                setTimeout(() => reject(new Error('btc derivation timed out')), 30_000);
            });
            const tagged = generated.map(a => ({ ...a, blockchain: 'bitcoin' }));
            await saveAddresses(tagged, 'bitcoin', net);
            summary.bitcoin[net] = `derived ${tagged.length}`;
        }
    } catch (e) {
        console.warn('[rehydrate] btc derivation failed:', e?.message || e);
    }

    // ── Cardano (1 address per network — extra ones are derived on demand) ──
    try {
        const { generateCardanoAddress } = await import('@/lib/cardano/wallet');

        for (const net of ADA_NETWORKS) {
            const existing = await getAddresses('cardano', net);
            if (existing.length > 0) {
                summary.cardano[net] = `kept ${existing.length}`;
                continue;
            }
            const addr = await generateCardanoAddress(seed, 0, net);
            await saveAddresses([{
                address: addr,
                index: 0,
                isChange: false,
                isStaking: false,
                blockchain: 'cardano',
                created: new Date().toISOString(),
            }], 'cardano', net);
            summary.cardano[net] = 'derived 1';
        }
    } catch (e) {
        console.warn('[rehydrate] cardano derivation failed:', e?.message || e);
    }

    console.log('[rehydrate] addresses ready:',
        Object.entries(summary).map(([bc, nets]) =>
            `${bc} ${Object.entries(nets).map(([n, s]) => `${n}=${s}`).join(',')}`
        ).join(' | ')
    );
    return summary;
}
