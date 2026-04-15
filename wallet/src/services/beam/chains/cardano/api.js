/**
 * Cardano API — re-exports from the central router.
 * All Cardano queries go through services/cardano/api.js (Blockfrost → Koios fallback).
 */

export {
  fetchUtxos as fetchCardanoUtxos,
  submitCardanoTx,
  getCardanoTx,
  getProtocolParams,
} from '@/services/cardano/api';
