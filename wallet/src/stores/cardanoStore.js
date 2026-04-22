'use client';

/**
 * Cardano Store — Zustand store with localStorage persistence.
 *
 * Manages: addresses, UTXOs, ADA balance, native assets (CNTs).
 * Persists to storage using the same key structure as Bitcoin:
 *   wallet:cardano:<network>:addresses
 *   wallet:cardano:<network>:utxos
 *   wallet:cardano:<network>:assets
 *   wallet:cardano:<network>:asset_meta
 *
 * On init: loads from storage (instant UI), then refreshes from Blockfrost.
 */

import { create } from 'zustand';
import { fetchUtxos, fetchAssetMeta } from '@/services/cardano/api';
// Dynamic imports for WASM-dependent Cardano libs (can't be static in Next.js)
async function deriveCardanoAddr(seedPhrase, index, network) {
  const { waitForCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const { generateCardanoAddress } = await import('@/lib/cardano/wallet');
  return generateCardanoAddress(seedPhrase, index, network);
}
import { StorageAdapter } from '@/services/storage-adapter';
import { chainKey, DATA_TYPES } from '@/services/storage-keys';

const BLOCKCHAIN = 'cardano';

// ── Storage helpers ─────────────────────────────────────────────────────────

function storageKey(network, dataType) {
  return chainKey(BLOCKCHAIN, network, dataType);
}

async function loadFromStorage(network, dataType) {
  try {
    const raw = await StorageAdapter.get(storageKey(network, dataType));
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}

async function saveToStorage(network, dataType, data) {
  try {
    await StorageAdapter.set(storageKey(network, dataType), JSON.stringify(data));
  } catch (err) {
    console.warn(`[CardanoStore] Failed to save ${dataType}:`, err.message);
  }
}

// ── Store ───────────────────────────────────────────────────────────────────

const useCardanoStore = create((set, get) => ({
  // State
  addresses: [],         // [{ address, index, isPayment }]
  utxos: [],             // [{ txHash, outputIndex, lovelace, assets, address }]
  assets: [],            // [{ unit, policyId, assetName, name, ticker, quantity, decimals, image, ... }]
  adaBalance: '0',       // Total lovelace string
  assetMetaCache: {},    // { unit: metadata }
  isLoading: false,
  isRefreshing: false,
  error: null,
  initialized: false,
  currentNetwork: null,

  // ── UTXO reservation (delegates to unified utxo-reservations service) ────
  // Backed by services/utxo-reservations (chain-agnostic singleton).
  // Methods kept for backward compat with existing callsites.
  // The "spentUtxoIds" getter returns a snapshot; do not mutate it.
  get spentUtxoIds() {
    // Lazy require to avoid circular deps in SSR
    try {
      const { getSpentSet } = require('@/services/utxo-reservations');
      return getSpentSet('cardano');
    } catch { return new Set(); }
  },

  /** Mark a UTXO as spent + remove from UI optimistically. */
  markUtxoAsSpent: (txHash, outputIndex) => {
    const { markSpent } = require('@/services/utxo-reservations');
    const added = markSpent('cardano', txHash, outputIndex);
    if (!added) return;
    // UI optimism: drop from utxos array + recalc balance
    const state = get();
    const key = `${txHash}:${outputIndex}`;
    const newUtxos = state.utxos.filter(u => `${u.txHash}:${u.outputIndex}` !== key);
    const newBalance = newUtxos.reduce((s, u) => s + BigInt(u.lovelace || '0'), 0n).toString();
    set({ utxos: newUtxos, adaBalance: newBalance });
  },

  /** Release a previously-reserved UTXO (refresh will restore visibility). */
  releaseUtxo: (txHash, outputIndex) => {
    const { release } = require('@/services/utxo-reservations');
    release('cardano', txHash, outputIndex);
  },

  /** Check if a UTXO is locally reserved. */
  isUtxoSpent: (txHash, outputIndex) => {
    const { isSpent } = require('@/services/utxo-reservations');
    return isSpent('cardano', txHash, outputIndex);
  },

  /** Mark all UTXOs from a successful tx as spent in one call.
   *  Accepts items with shape { utxoId } or { txHash, outputIndex }. */
  updateAfterTransaction: (spentUtxos) => {
    const mark = get().markUtxoAsSpent;
    for (const u of spentUtxos) {
      let txHash, outputIndex;
      if (u.utxoId) {
        const [t, i] = u.utxoId.split(':');
        txHash = t; outputIndex = parseInt(i, 10);
      } else {
        txHash = u.txHash; outputIndex = u.outputIndex;
      }
      if (txHash != null && outputIndex != null) mark(txHash, outputIndex);
    }
  },

  // ── Load from storage (fast, no API calls) ────────────────────────────

  loadFromStorage: async (network) => {
    const networkKey = `cardano-${network}`;
    const state = get();

    // Clear on network change
    if (state.currentNetwork && state.currentNetwork !== networkKey) {
      set({ utxos: [], assets: [], adaBalance: '0', addresses: [], initialized: false, error: null });
    }
    set({ currentNetwork: networkKey, isLoading: true });

    const [addresses, utxos, assets, assetMeta] = await Promise.all([
      loadFromStorage(network, DATA_TYPES.ADDRESSES),
      loadFromStorage(network, DATA_TYPES.UTXOS),
      loadFromStorage(network, DATA_TYPES.ASSETS),
      loadFromStorage(network, DATA_TYPES.ASSET_META),
    ]);

    const newState = { isLoading: false };
    if (addresses?.length) newState.addresses = addresses;
    if (utxos?.length) {
      newState.utxos = utxos;
      newState.adaBalance = utxos.reduce((sum, u) => sum + BigInt(u.lovelace || '0'), BigInt(0)).toString();
    }
    if (assets?.length) newState.assets = assets;
    if (assetMeta && Object.keys(assetMeta).length) newState.assetMetaCache = assetMeta;
    if (addresses?.length || utxos?.length) newState.initialized = true;

    set(newState);
  },

  // ── Address derivation ────────────────────────────────────────────────

  deriveAddresses: async (seedPhrase, network, count = 1) => {
    const networkKey = `cardano-${network}`;
    const state = get();

    if (state.currentNetwork && state.currentNetwork !== networkKey) {
      set({ utxos: [], assets: [], adaBalance: '0', addresses: [], initialized: false, error: null });
    }
    set({ currentNetwork: networkKey });

    try {
      const addresses = [];
      for (let i = 0; i < count; i++) {
        const addr = await deriveCardanoAddr(seedPhrase, i, network);
        addresses.push({
          address: addr,
          index: i,
          isChange: false,
          isStaking: false,
          isPayment: true,
          blockchain: 'cardano',
          created: new Date().toISOString(),
        });
      }
      set({ addresses });

      // Persist addresses (use storage.ts for consistency with addressesStore)
      const { saveAddresses } = await import('@/services/storage');
      await saveAddresses(addresses, 'cardano', network);

      return addresses;
    } catch (err) {
      set({ error: err.message });
      return [];
    }
  },

  // ── Refresh from Blockfrost (full API refresh) ────────────────────────

  refresh: async () => {
    const state = get();
    if (state.isRefreshing) return;
    if (!state.addresses.length) return;

    const network = state.currentNetwork?.replace('cardano-', '') || 'mainnet';
    set({ isRefreshing: true, error: null });

    try {
      const allUtxos = [];
      let totalLovelace = BigInt(0);
      const assetTotals = new Map(); // unit → BigInt quantity
      const assetUtxos = new Map(); // unit → [{ txHash, outputIndex, quantity, lovelace }]

      for (const { address } of state.addresses) {
        const utxos = await fetchUtxos(address, network);
        for (const u of utxos) {
          allUtxos.push({ ...u, address });
          totalLovelace += BigInt(u.lovelace);
          for (const asset of u.assets) {
            const prev = assetTotals.get(asset.unit) || BigInt(0);
            assetTotals.set(asset.unit, prev + BigInt(asset.quantity));
            // Track which UTXO holds this asset
            if (!assetUtxos.has(asset.unit)) assetUtxos.set(asset.unit, []);
            assetUtxos.get(asset.unit).push({
              txHash: u.txHash,
              outputIndex: u.outputIndex,
              quantity: asset.quantity,
              lovelace: u.lovelace,
            });
          }
        }
      }

      // Fetch metadata for assets missing name/image (re-fetch if stale)
      const cache = { ...state.assetMetaCache };
      const newUnits = [...assetTotals.keys()].filter(u => !cache[u] || !cache[u].image);
      for (let i = 0; i < newUnits.length; i += 5) {
        const batch = newUnits.slice(i, i + 5);
        const results = await Promise.all(batch.map(u => fetchAssetMeta(u).catch(() => null)));
        for (let j = 0; j < batch.length; j++) {
          if (results[j]) cache[batch[j]] = results[j];
        }
      }

      // Build asset list (with UTXO tracking for beam-back)
      const assets = [...assetTotals.entries()].map(([unit, quantity]) => {
        const meta = cache[unit] || {};
        const utxosForAsset = assetUtxos.get(unit) || [];
        // Pick the largest UTXO for this asset (where most of the tokens are)
        const primaryUtxo = utxosForAsset.sort((a, b) =>
          Number(BigInt(b.quantity) - BigInt(a.quantity))
        )[0];
        return {
          unit,
          policyId: meta.policyId || unit.slice(0, 56),
          assetName: meta.assetName || unit.slice(56),
          name: meta.name || unit.slice(0, 16) + '...',
          ticker: meta.ticker || '',
          quantity: quantity.toString(),
          decimals: meta.decimals || 0,
          image: meta.image || '',
          description: meta.description || '',
          fingerprint: meta.fingerprint || '',
          // UTXO tracking for beam-back
          utxoTxHash: primaryUtxo?.txHash,
          utxoOutputIndex: primaryUtxo?.outputIndex,
          utxos: utxosForAsset,
        };
      });

      const newBalance = totalLovelace.toString();

      // Auto-cleanup: drop reservations no longer on-chain (confirmed/dropped).
      const { syncWithChain, getSpentSet } = require('@/services/utxo-reservations');
      const onChainKeys = new Set(allUtxos.map(u => `${u.txHash}:${u.outputIndex}`));
      syncWithChain('cardano', onChainKeys);
      const liveSpent = getSpentSet('cardano');

      // Apply local reservations: hide already-spent UTXOs from store
      const visibleUtxos = allUtxos.filter(u => !liveSpent.has(`${u.txHash}:${u.outputIndex}`));
      const visibleBalance = visibleUtxos.reduce((s, u) => s + BigInt(u.lovelace || '0'), 0n).toString();

      set({
        utxos: visibleUtxos,
        assets,
        adaBalance: visibleBalance,
        assetMetaCache: cache,
        isRefreshing: false,
        initialized: true,
      });

      // Persist everything to storage
      await Promise.all([
        saveToStorage(network, DATA_TYPES.UTXOS, allUtxos),
        saveToStorage(network, DATA_TYPES.ASSETS, assets),
        saveToStorage(network, DATA_TYPES.ASSET_META, cache),
      ]);
    } catch (err) {
      set({ error: err.message, isRefreshing: false });
    }
  },

  // ── Computed helpers ───────────────────────────────────────────────────

  getAdaDisplay: () => {
    const { adaBalance } = get();
    const ada = Number(BigInt(adaBalance)) / 1_000_000;
    return ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  },

  getAssetDisplay: (unit) => {
    const { assets } = get();
    const asset = assets.find(a => a.unit === unit);
    if (!asset) return '0';
    const divisor = Math.pow(10, asset.decimals || 0);
    const val = Number(BigInt(asset.quantity)) / divisor;
    return val.toLocaleString(undefined, { maximumFractionDigits: asset.decimals || 0 });
  },

  // ── Reset ─────────────────────────────────────────────────────────────

  reset: () => set({
    addresses: [],
    utxos: [],
    assets: [],
    adaBalance: '0',
    isLoading: false,
    isRefreshing: false,
    error: null,
    initialized: false,
    currentNetwork: null,
  }),
}));

export const useCardano = useCardanoStore;
export default useCardanoStore;
