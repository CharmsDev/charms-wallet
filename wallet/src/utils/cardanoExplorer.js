/**
 * Cardano explorer URL helpers.
 *
 * AdaStat is preferred for mainnet (cleaner UI, fewer ads). AdaStat has no
 * preprod deployment, so we fall back to preprod.cardanoscan.io there.
 */

const isMainnet = (network) => !network || network === 'mainnet';

export function cardanoTxUrl(hash, network = 'mainnet') {
  if (!hash) return '';
  return isMainnet(network)
    ? `https://adastat.net/transactions/${hash}`
    : `https://preprod.cardanoscan.io/transaction/${hash}`;
}

export function cardanoAddressUrl(address, network = 'mainnet') {
  if (!address) return '';
  return isMainnet(network)
    ? `https://adastat.net/addresses/${address}`
    : `https://preprod.cardanoscan.io/address/${address}`;
}

/** Use CIP-14 fingerprint when available — AdaStat keys assets by fingerprint. */
export function cardanoAssetUrl(fingerprintOrUnit, network = 'mainnet') {
  if (!fingerprintOrUnit) return '';
  return isMainnet(network)
    ? `https://adastat.net/assets/${fingerprintOrUnit}`
    : `https://preprod.cardanoscan.io/token/${fingerprintOrUnit}`;
}
