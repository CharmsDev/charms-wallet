'use client';

/**
 * Unified cache service for all application caching needs
 */
export class CacheService {
    constructor(defaultTimeout = 30000) {
        this.cache = new Map();
        this.defaultTimeout = defaultTimeout;
    }

    // Check if cached item is still valid
    isValid(key, customTimeout = null) {
        const item = this.cache.get(key);
        if (!item) return false;
        
        const timeout = customTimeout || this.defaultTimeout;
        return Date.now() - item.timestamp < timeout;
    }

    // Get cached item if valid
    get(key, customTimeout = null) {
        if (this.isValid(key, customTimeout)) {
            return this.cache.get(key).data;
        }
        return null;
    }

    // Set cached item
    set(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // Get or fetch with cache
    async getOrFetch(key, fetchFn, customTimeout = null) {
        const cached = this.get(key, customTimeout);
        if (cached !== null) {
            return cached;
        }

        const data = await fetchFn();
        this.set(key, data);
        return data;
    }

    // Clear specific key
    clear(key) {
        this.cache.delete(key);
    }

    // Clear all cache
    clearAll() {
        this.cache.clear();
    }

    // Get cache stats
    getStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.entries()).map(([key, value]) => ({
                key,
                age: Date.now() - value.timestamp,
                isValid: this.isValid(key)
            }))
        };
    }
}

// Export singleton instances for different use cases
export const priceCache = new CacheService(60000); // 1 minute for price data
export const utxoCache = new CacheService(30000);  // 30 seconds for UTXO verification
export const generalCache = new CacheService(30000); // 30 seconds general purpose

export default CacheService;
