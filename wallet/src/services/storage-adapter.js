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
    return value;
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
    localStorage.setItem(key, value);
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
  },

  /**
   * Listen for storage changes
   * @param {Function} callback - Called when storage changes
   * @returns {Function} - Cleanup function
   */
  onChange(callback) {
    if (isExtension) {
      const listener = (changes, areaName) => {
        if (areaName === 'local') {
          callback(changes);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } else {
      const listener = (e) => {
        if (e.storageArea === localStorage) {
          callback({ [e.key]: { newValue: e.newValue, oldValue: e.oldValue } });
        }
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    }
  }
};

export default StorageAdapter;
