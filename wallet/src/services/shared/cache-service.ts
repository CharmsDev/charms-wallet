'use client';

/**
 * Unified cache service for all application caching needs
 * Supports both memory and localStorage persistence
 */
export class CacheService {
    private cache: Map<string, any>;
    private defaultTimeout: number;
    private persistKey: string | null;

    constructor(defaultTimeout = 30000, persistKey: string | null = null) {
        this.cache = new Map();
        this.defaultTimeout = defaultTimeout;
        this.persistKey = persistKey;
        
        // Load from localStorage if persist key provided
        if (this.persistKey) {
            this.loadFromStorage();
        }
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
        const item = {
            data,
            timestamp: Date.now()
        };
        
        this.cache.set(key, item);
        
        // Persist to localStorage if enabled
        if (this.persistKey) {
            this.saveToStorage();
        }
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
        
        // Update localStorage if enabled
        if (this.persistKey) {
            this.saveToStorage();
        }
    }

    // Clear all cache
    clearAll() {
        this.cache.clear();
        
        // Clear localStorage if enabled
        if (this.persistKey) {
            localStorage.removeItem(this.persistKey);
        }
    }

    // Load cache from localStorage
    loadFromStorage() {
        try {
            // Check if we're in a browser environment
            if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
                return; // Skip loading in SSR environment
            }
            const stored = localStorage.getItem(this.persistKey);
            if (stored) {
                const data = JSON.parse(stored);
                this.cache = new Map(data.entries || []);
            }
        } catch (error) {
            console.warn('[CACHE] Failed to load from storage:', error);
        }
    }
    
    // Save cache to localStorage
    saveToStorage() {
        try {
            // Check if we're in a browser environment
            if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
                return; // Skip saving in SSR environment
            }
            const data = {
                entries: Array.from(this.cache.entries()),
                lastSaved: Date.now()
            };
            localStorage.setItem(this.persistKey, JSON.stringify(data));
        } catch (error) {
            console.warn('[CACHE] Failed to save to storage:', error);
        }
    }

    // Get cache stats
    getStats() {
        return {
            size: this.cache.size,
            persistKey: this.persistKey,
            entries: Array.from(this.cache.entries()).map(([key, value]) => ({
                key,
                age: Date.now() - value.timestamp,
                isValid: this.isValid(key)
            }))
        };
    }
}

// Export singleton instances for different use cases
export const priceCache = new CacheService(30000, 'btc_price_cache'); // 30 seconds for price data with persistence
export const utxoCache = new CacheService(30000);  // 30 seconds for UTXO verification
export const generalCache = new CacheService(30000); // 30 seconds general purpose

export default CacheService;
