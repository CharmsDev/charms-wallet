/**
 * Prover API Client with automatic retry mechanism
 * Adapted for Charms Wallet transfer functionality
 */

import { PayloadValidator } from './payload-validator.js';

export class ProverApiClient {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.enableLogging = true;
    }

    /**
     * Send payload to prover API with automatic retry mechanism
     * @param {Object} payload - Payload to send
     * @param {Function} onStatus - Optional status callback
     * @returns {Promise<Array>} Array of transaction hex strings
     */
    async sendToProver(payload, onStatus) {
        // Retry on HTTP 5xx AND network errors. No retries for 4xx, JSON/validation errors.
        const baseDelayMs = 3000; // Start with 3 seconds
        let attempt = 1;

        for (;;) {
            try {
                // Notify start of attempt
                if (typeof onStatus === 'function') {
                    try { onStatus({ phase: 'start', attempt }); } catch {}
                }

                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const contentType = response.headers.get('content-type') || 'unknown';
                const rawText = await response.text();

                if (!response.ok) {
                    const errorMessage = `Prover API error: ${response.status} ${response.statusText} - ${rawText}`;
                    // Retry on 5xx server errors
                    if (response.status >= 500) {
                        const nextDelay = this._calculateProgressiveDelay(attempt, baseDelayMs);
                        if (typeof onStatus === 'function') {
                            try { onStatus({ phase: 'retrying', attempt, statusCode: response.status, rawText, nextDelayMs: nextDelay }); } catch {}
                        }
                        await this._delay(nextDelay);
                        attempt++;
                        continue;
                    }

                    // For 4xx (including 429) do NOT retry; fail immediately
                    throw new Error(errorMessage);
                }

                let data;
                try {
                    data = JSON.parse(rawText);
                } catch (jsonError) {
                    // Do NOT retry JSON parsing errors
                    throw jsonError;
                }

                // Validate response format
                try {
                    PayloadValidator.validateProverResponse(data);
                } catch (validationError) {
                    // Do NOT retry validation errors; abort
                    throw validationError;
                }

                // Success
                if (typeof onStatus === 'function') {
                    try { onStatus({ phase: 'success', attempt }); } catch {}
                }
                
                return data;

            } catch (error) {
                // Check if this is a retryable network error
                if (this._isRetryableNetworkError(error)) {
                    const nextDelay = this._calculateProgressiveDelay(attempt, baseDelayMs);
                    if (typeof onStatus === 'function') {
                        try { onStatus({ phase: 'retrying', attempt, statusCode: 'NETWORK_ERROR', rawText: error.message, nextDelayMs: nextDelay }); } catch {}
                    }
                    await this._delay(nextDelay);
                    attempt++;
                    continue;
                }
                
                // Non-retryable error (JSON parsing, validation, etc.)
                throw error;
            }
        }
    }

    /**
     * Check if error is retryable network error
     * @private
     */
    _isRetryableNetworkError(error) {
        // Retry on network errors, timeouts, CORS, etc.
        return error.name === 'TypeError' || // Network errors (Failed to fetch)
               error.name === 'AbortError' || // Request timeouts
               error.message.includes('fetch') || // Fetch-related errors
               error.message.includes('network') || // Network-related errors
               error.message.includes('timeout') || // Timeout errors
               error.message.includes('CORS') || // CORS errors
               error.message.includes('ERR_NETWORK') || // Network errors
               error.message.includes('ERR_INTERNET_DISCONNECTED'); // Connection errors
    }

    /**
     * Calculate progressive delay with increasing intervals
     * @private
     */
    _calculateProgressiveDelay(attempt, baseDelay) {
        const delays = [3000, 10000, 15000, 20000, 25000, 30000]; // Progressive delays
        const delayIndex = Math.min(attempt - 1, delays.length - 1);
        const baseDelayMs = delays[delayIndex];
        
        // Add small jitter (±10%) to prevent thundering herd
        const jitter = baseDelayMs * 0.1 * (Math.random() - 0.5);
        return Math.max(1000, baseDelayMs + jitter); // Minimum 1 second
    }

    /**
     * Delay execution for specified milliseconds
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Set custom API URL (useful for testing)
     * @param {string} url - New API URL
     */
    setApiUrl(url) {
        this.apiUrl = url;
    }
}
