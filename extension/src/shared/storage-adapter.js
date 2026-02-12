/**
 * Storage Adapter
 * Provides unified storage interface for both web (localStorage) and extension (chrome.storage.local)
 * Automatically detects environment and uses appropriate storage backend
 */

const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const StorageAdapter = {
  /**
   * Get value from storage
   * @param {string} key - Storage key
   * @returns {Promise<any>} - Stored value or null
   */
  async get(key) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] ?? null);
        });
      });
    }
    const value = localStorage.getItem(key);
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return value;
    }
  },

  /**
   * Set value in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {Promise<void>}
   */
  async set(key, value) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    }
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  },

  /**
   * Remove value from storage
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async remove(key) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], resolve);
      });
    }
    localStorage.removeItem(key);
  },

  /**
   * Get all keys from storage
   * @returns {Promise<string[]>}
   */
  async getAllKeys() {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
          resolve(Object.keys(items));
        });
      });
    }
    return Object.keys(localStorage);
  },

  /**
   * Clear all storage
   * @returns {Promise<void>}
   */
  async clear() {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.clear(resolve);
      });
    }
    localStorage.clear();
  },

  /**
   * Check if running in extension context
   * @returns {boolean}
   */
  isExtension() {
    return isExtension;
  }
};

export default StorageAdapter;
