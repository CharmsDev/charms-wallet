'use client';

import { priceCache } from './cache-service';

class CoinGeckoService {
    constructor() {
        this.baseUrl = 'https://api.coingecko.com/api/v3';
        this.lastFetchTime = 0;
        this.rateLimitDelay = 30000; // 30 seconds between requests
        this.retryAttempts = 1; // Reduce retries to prevent spam
        this.retryDelay = 10000; // 10 seconds between retries
        this.cacheKey = 'bitcoin-price';
        this.isBlocked = false; // Track if API is blocked
        this.blockUntil = 0; // Timestamp when to try again
        this.storageKey = 'coingecko_api_status';
        
        // Load persistent state from localStorage
        this.loadState();
    }

    // Check if we can make a request (rate limiting + blocking)
    canMakeRequest() {
        const now = Date.now();
        
        // If API is blocked, check if block period has expired
        if (this.isBlocked && now < this.blockUntil) {
            return false;
        }
        
        // Reset block if period expired
        if (this.isBlocked && now >= this.blockUntil) {
            this.isBlocked = false;
            this.blockUntil = 0;
        }
        
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

            // Check rate limiting and blocking
            if (!this.canMakeRequest()) {
                // Always return stale cache or fallback instead of waiting
                const staleCachedPrice = priceCache.get(this.cacheKey, 300000); // 5 min stale cache
                if (staleCachedPrice) {
                    return { ...staleCachedPrice, isStale: true };
                }
                
                // Return fallback immediately if blocked
                return this.getFallbackPrice();
            }

            // Single attempt to fetch (no retries to prevent spam)
            try {
                const response = await fetch(
                    `${this.baseUrl}/simple/price?ids=bitcoin&vs_currencies=usd,eur`,
                    {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                        },
                        signal: AbortSignal.timeout(8000) // 8 second timeout
                    }
                );

                if (!response.ok) {
                    if (response.status === 429) {
                        // Block API calls for 10 minutes on rate limit
                        this.isBlocked = true;
                        this.blockUntil = Date.now() + 600000; // 10 minutes
                        this.saveState(); // Persist blocking state
                        throw new Error('Rate limited - API blocked temporarily');
                    }
                    throw new Error(`HTTP error: ${response.status}`);
                }

                const data = await response.json();

                if (!data.bitcoin) {
                    throw new Error('Invalid response format');
                }

                // Success - reset delays and cache result
                this.rateLimitDelay = 30000; // Reset to default
                this.lastFetchTime = Date.now();
                this.isBlocked = false;
                this.blockUntil = 0;
                this.saveState(); // Persist success state
                
                const priceData = {
                    usd: data.bitcoin.usd,
                    eur: data.bitcoin.eur,
                    lastUpdated: this.lastFetchTime,
                    isFallback: false
                };

                priceCache.set(this.cacheKey, priceData);
                return priceData;

            } catch (error) {
                // Handle CORS and network errors by blocking API
                if (error.name === 'TypeError' || error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                    this.isBlocked = true;
                    this.blockUntil = Date.now() + 600000; // 10 minutes for CORS/network issues
                    this.saveState(); // Persist blocking state
                }
                throw error;
            }


        } catch (error) {
            // Silent error handling - no console logs to prevent spam
            
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

    // Load state from localStorage
    loadState() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const state = JSON.parse(stored);
                this.isBlocked = state.isBlocked || false;
                this.blockUntil = state.blockUntil || 0;
                this.lastFetchTime = state.lastFetchTime || 0;
                
                // If block period expired, reset
                if (this.isBlocked && Date.now() >= this.blockUntil) {
                    this.isBlocked = false;
                    this.blockUntil = 0;
                    this.saveState();
                }
            }
        } catch (error) {
            // Silent fail - use defaults
        }
    }
    
    // Save state to localStorage
    saveState() {
        try {
            const state = {
                isBlocked: this.isBlocked,
                blockUntil: this.blockUntil,
                lastFetchTime: this.lastFetchTime,
                savedAt: Date.now()
            };
            localStorage.setItem(this.storageKey, JSON.stringify(state));
        } catch (error) {
            // Silent fail
        }
    }

    // Get cache status
    getCacheStatus() {
        const cachedPrice = priceCache.get(this.cacheKey);
        return {
            hasCache: !!cachedPrice,
            isValid: !!cachedPrice,
            canRequest: this.canMakeRequest(),
            isBlocked: this.isBlocked,
            blockUntil: this.blockUntil,
            lastFetch: this.lastFetchTime,
            nextRequestIn: Math.max(0, this.rateLimitDelay - (Date.now() - this.lastFetchTime))
        };
    }
}

// Export singleton instance
export const coinGeckoService = new CoinGeckoService();
export default coinGeckoService;
