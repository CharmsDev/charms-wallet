'use client';

import { priceCache } from './cache-service';

class CoinGeckoService {
    constructor() {
        this.baseUrl = 'https://api.coingecko.com/api/v3';
        this.lastFetchTime = 0;
        this.rateLimitDelay = 10000; // 10 seconds between requests
        this.retryAttempts = 3;
        this.retryDelay = 5000; // 5 seconds between retries
        this.cacheKey = 'bitcoin-price';
    }

    // Check if we can make a request (rate limiting)
    canMakeRequest() {
        const now = Date.now();
        return now - this.lastFetchTime >= this.rateLimitDelay;
    }

    // Fallback price data (static fallback when API fails)
    getFallbackPrice() {
        return {
            usd: 45000, // Approximate BTC price
            eur: 42000,
            lastUpdated: Date.now(),
            isFallback: true
        };
    }

    // Main method to get Bitcoin price
    async getBitcoinPrice() {
        try {
            // Return cached price if valid
            const cachedPrice = priceCache.get(this.cacheKey);
            if (cachedPrice) {
                return cachedPrice;
            }

            // Check rate limiting
            if (!this.canMakeRequest()) {
                const waitTime = this.rateLimitDelay - (Date.now() - this.lastFetchTime);

                const staleCachedPrice = priceCache.get(this.cacheKey, 300000); // 5 min stale cache
                if (staleCachedPrice) {
                    return { ...staleCachedPrice, isStale: true };
                }

                // If no cache, wait and try
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            // Attempt to fetch with retries
            for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
                try {

                    const response = await fetch(
                        `${this.baseUrl}/simple/price?ids=bitcoin&vs_currencies=usd,eur`,
                        {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json',
                            },
                            // Add timeout
                            signal: AbortSignal.timeout(10000) // 10 second timeout
                        }
                    );

                    if (!response.ok) {
                        if (response.status === 429) {
                            this.rateLimitDelay = Math.min(this.rateLimitDelay * 2, 60000); // Max 1 minute
                            throw new Error(`Rate limited: ${response.status}`);
                        }
                        throw new Error(`HTTP error: ${response.status}`);
                    }

                    const data = await response.json();

                    if (!data.bitcoin) {
                        throw new Error('Invalid response format');
                    }

                    // Success - reset rate limit delay and cache result
                    this.rateLimitDelay = 10000; // Reset to default
                    this.lastFetchTime = Date.now();
                    const priceData = {
                        usd: data.bitcoin.usd,
                        eur: data.bitcoin.eur,
                        lastUpdated: this.lastFetchTime,
                        isFallback: false
                    };

                    priceCache.set(this.cacheKey, priceData);
                    return priceData;

                } catch (error) {

                    if (attempt < this.retryAttempts) {
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    }
                }
            }

            // All attempts failed
            throw new Error('All fetch attempts failed');

        } catch (error) {

            // Return cached price if available
            const staleCachedPrice = priceCache.get(this.cacheKey, 300000); // 5 min stale cache
            if (staleCachedPrice) {
                return {
                    ...staleCachedPrice,
                    isStale: true
                };
            }

            // Return fallback price
            return this.getFallbackPrice();
        }
    }

    // Get price with loading state management
    async getBitcoinPriceWithState() {
        const startTime = Date.now();

        try {
            const price = await this.getBitcoinPrice();
            const loadTime = Date.now() - startTime;

            return {
                success: true,
                data: price,
                loadTime,
                error: null
            };
        } catch (error) {
            return {
                success: false,
                data: this.getFallbackPrice(),
                loadTime: Date.now() - startTime,
                error: error.message
            };
        }
    }

    // Clear cache (useful for manual refresh)
    clearCache() {
        priceCache.clear(this.cacheKey);
        this.lastFetchTime = 0;
    }

    // Get cache status
    getCacheStatus() {
        const cachedPrice = priceCache.get(this.cacheKey);
        return {
            hasCache: !!cachedPrice,
            isValid: !!cachedPrice,
            canRequest: this.canMakeRequest(),
            lastFetch: this.lastFetchTime,
            nextRequestIn: Math.max(0, this.rateLimitDelay - (Date.now() - this.lastFetchTime))
        };
    }
}

// Export singleton instance
export const coinGeckoService = new CoinGeckoService();
export default coinGeckoService;
