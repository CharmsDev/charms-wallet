/**
 * Formatting utilities for Bitcoin and transaction data
 */

/**
 * Converts satoshis to BTC with 8 decimal places
 * @param {number} satoshis - Amount in satoshis
 * @returns {string} Formatted BTC amount
 */
export const formatBTC = (satoshis) => {
    const btc = satoshis / 100000000;
    return btc.toFixed(8);
};

/**
 * Formats a timestamp for transaction display (short format)
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string
 */
export const formatTransactionDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Formats a timestamp for detailed transaction view (long format)
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date string with full details
 */
export const formatDetailedDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

/**
 * Formats a number with locale-specific thousands separators
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, decimals = 0) => {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};
