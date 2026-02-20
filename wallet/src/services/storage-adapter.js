/**
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

  isExtension() {
    return isExtension;
  },

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
  }
};

export default StorageAdapter;
