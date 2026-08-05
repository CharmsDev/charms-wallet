/**
 * Tier-2 adapted from wallet/src/services/storage-adapter.js
 * Differences: adds an `onChange(callback)` listener that subscribes to
 * cross-context storage mutations (chrome.storage.onChanged in extension
 * contexts, the `storage` window event in localStorage mode). The wallet
 * version doesn't need this because it only ever runs in a single tab.
 * The extension needs it so the popup re-renders when background mutates
 * UTXO / charm / tx state during a beam (used by E011's stores and
 * E017's BeamOperationsContext).
 *
 * Storage Adapter
 *
 * Unified async interface over chrome.storage.local (extension) or
 * localStorage (web). This is a dumb pass-through — callers are
 * responsible for JSON.stringify / JSON.parse.
 */

const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const StorageAdapter = {
  async get(key) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => resolve(result[key] ?? null));
      });
    }
    return localStorage.getItem(key);
  },

  async set(key, value) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    }
    localStorage.setItem(key, value);
  },

  async remove(key) {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], resolve);
      });
    }
    localStorage.removeItem(key);
  },

  async getAllKeys() {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => resolve(Object.keys(items)));
      });
    }
    return Object.keys(localStorage);
  },

  async clear() {
    if (isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.clear(resolve);
      });
    }
    localStorage.clear();
  },

  /**
   * Subscribe to storage mutations. Returns an unsubscribe function.
   *
   * Callback receives a map { key: { newValue, oldValue } } shaped like
   * chrome.storage.onChanged's payload, regardless of underlying impl.
   */
  onChange(callback) {
    if (isExtension) {
      const listener = (changes, areaName) => {
        if (areaName === 'local') callback(changes);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
    const listener = (e) => {
      if (e.storageArea === localStorage) {
        callback({ [e.key]: { newValue: e.newValue, oldValue: e.oldValue } });
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },

  isExtension() {
    return isExtension;
  }
};

export default StorageAdapter;
