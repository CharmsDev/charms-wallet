/**
 * Utility functions for amount conversions and formatting
 */

export const SATOSHI_AMOUNTS = [3000, 10000, 25000, 50000, 100000];

export function satoshisToBTC(satoshis) {
    return satoshis / 100000000;
}

export function btcToSatoshis(btc) {
    return Math.round(btc * 100000000);
}

export function formatSatoshis(satoshis) {
    return satoshis.toLocaleString();
}

export function isValidAmount(amount) {
    return amount && !isNaN(parseInt(amount)) && parseInt(amount) > 0;
}

export function parseAmount(amount) {
    return parseInt(amount) || 0;
}
