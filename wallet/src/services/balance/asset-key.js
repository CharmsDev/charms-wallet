/**
 * AssetKey — canonical identifier for any balance-bearing asset.
 *
 *   "bitcoin:native:BTC"
 *   "bitcoin:charm:t/abc...def"
 *   "cardano:native:ADA"
 *   "cardano:cnt:<policyId>.<assetName>"
 *
 * Network is NOT part of the key — the BalanceService is scoped per
 * (chain, network) elsewhere. Keeping the key network-free means the
 * same flow code can run on mainnet / testnet4 / preprod without
 * rewriting keys.
 */

export const CHAIN = Object.freeze({
  BITCOIN: 'bitcoin',
  CARDANO: 'cardano',
});

export const KIND = Object.freeze({
  NATIVE: 'native',  // BTC, ADA
  CHARM:  'charm',   // Bitcoin charm tokens (t/… or n/…)
  CNT:    'cnt',     // Cardano Native Token (policy.assetName)
});

const SUPPORTED_CHAINS = new Set(Object.values(CHAIN));
const SUPPORTED_KINDS  = new Set(Object.values(KIND));

const SEP = ':';

export function makeAssetKey(chain, kind, ref) {
  if (!SUPPORTED_CHAINS.has(chain)) throw new Error(`AssetKey: unknown chain "${chain}"`);
  if (!SUPPORTED_KINDS.has(kind))   throw new Error(`AssetKey: unknown kind "${kind}"`);
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error('AssetKey: ref must be a non-empty string');
  }
  if (ref.includes(SEP)) {
    throw new Error(`AssetKey: ref must not contain "${SEP}" — got "${ref}"`);
  }
  validateKindMatch(chain, kind);
  return `${chain}${SEP}${kind}${SEP}${ref}`;
}

export function parseAssetKey(key) {
  if (typeof key !== 'string') throw new Error('AssetKey: key must be a string');
  const parts = key.split(SEP);
  if (parts.length !== 3) {
    throw new Error(`AssetKey: expected "chain:kind:ref" — got "${key}"`);
  }
  const [chain, kind, ref] = parts;
  if (!SUPPORTED_CHAINS.has(chain)) throw new Error(`AssetKey: unknown chain "${chain}"`);
  if (!SUPPORTED_KINDS.has(kind))   throw new Error(`AssetKey: unknown kind "${kind}"`);
  if (!ref) throw new Error(`AssetKey: empty ref in "${key}"`);
  validateKindMatch(chain, kind);
  return { chain, kind, ref };
}

export function isValidAssetKey(key) {
  try { parseAssetKey(key); return true; } catch { return false; }
}

// Convenience helpers for the canonical keys used everywhere.
export const BTC_KEY = makeAssetKey(CHAIN.BITCOIN, KIND.NATIVE, 'BTC');
export const ADA_KEY = makeAssetKey(CHAIN.CARDANO, KIND.NATIVE, 'ADA');

export const charmKey = (appId) => makeAssetKey(CHAIN.BITCOIN, KIND.CHARM, appId);
export const cntKey   = (policyId, assetName) =>
  makeAssetKey(CHAIN.CARDANO, KIND.CNT, `${policyId}.${assetName}`);

// Reject impossible (chain, kind) combos early so a charm CNT or an
// ADA-as-charm never reaches the service.
function validateKindMatch(chain, kind) {
  if (chain === CHAIN.BITCOIN && kind === KIND.CNT) {
    throw new Error('AssetKey: CNT is Cardano-only');
  }
  if (chain === CHAIN.CARDANO && kind === KIND.CHARM) {
    throw new Error('AssetKey: charm is Bitcoin-only');
  }
}
