/**
 * Inpage Script - Charms Wallet Provider
 * This script is injected into web pages to expose window.charmsWallet
 * Similar to how UniSat exposes window.unisat
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.charmsWallet) {
    return;
  }

  // Request ID counter for matching responses
  let requestId = 0;
  const pendingRequests = new Map();

  // Event listeners for wallet events
  const eventListeners = {
    accountsChanged: [],
    networkChanged: [],
    connect: [],
    disconnect: []
  };

  /**
   * Send a message to the content script and wait for response
   */
  function sendMessage(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      
      pendingRequests.set(id, { resolve, reject });

      window.postMessage({
        type: 'CHARMS_WALLET_REQUEST',
        id,
        method,
        params
      }, '*');

      // Timeout after 60 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000);
    });
  }

  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    // Handle responses to requests
    if (event.data && event.data.type === 'CHARMS_WALLET_RESPONSE') {
      const { id, result, error } = event.data;
      const pending = pendingRequests.get(id);
      
      if (pending) {
        pendingRequests.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
      }
    }

    // Handle events from wallet
    if (event.data && event.data.type === 'CHARMS_WALLET_EVENT') {
      const { event: eventName, data } = event.data;
      const listeners = eventListeners[eventName] || [];
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (e) {
          console.error('Charms Wallet event listener error:', e);
        }
      });
    }
  });

  /**
   * Charms Wallet Provider API
   * Mirrors UniSat API for compatibility
   */
  const charmsWallet = {
    // Indicates this is Charms Wallet
    isCharmsWallet: true,

    /**
     * Request connection to the wallet
     * Opens popup for user to approve connection
     * @returns {Promise<string[]>} Array of connected addresses
     */
    requestAccounts: async function() {
      return sendMessage('requestAccounts');
    },

    /**
     * Get connected accounts (no popup)
     * @returns {Promise<string[]>} Array of connected addresses
     */
    getAccounts: async function() {
      return sendMessage('getAccounts');
    },

    /**
     * Get the public key of the current account
     * @returns {Promise<string>} Public key hex
     */
    getPublicKey: async function() {
      return sendMessage('getPublicKey');
    },

    /**
     * Get balance of the current account
     * @returns {Promise<{confirmed: number, unconfirmed: number, total: number}>}
     */
    getBalance: async function() {
      return sendMessage('getBalance');
    },

    /**
     * Get current network
     * @returns {Promise<string>} 'livenet' | 'testnet'
     */
    getNetwork: async function() {
      return sendMessage('getNetwork');
    },

    /**
     * Switch network
     * @param {string} network - 'livenet' | 'testnet'
     * @returns {Promise<void>}
     */
    switchNetwork: async function(network) {
      return sendMessage('switchNetwork', { network });
    },

    /**
     * Sign a message
     * @param {string} message - Message to sign
     * @returns {Promise<string>} Signature
     */
    signMessage: async function(message) {
      return sendMessage('signMessage', { message });
    },

    /**
     * Sign a PSBT
     * @param {string} psbtHex - PSBT in hex format
     * @param {object} options - Signing options
     * @returns {Promise<string>} Signed PSBT hex
     */
    signPsbt: async function(psbtHex, options = {}) {
      return sendMessage('signPsbt', { psbtHex, options });
    },

    /**
     * Sign multiple PSBTs
     * @param {string[]} psbtHexs - Array of PSBTs in hex format
     * @param {object[]} options - Array of signing options
     * @returns {Promise<string[]>} Array of signed PSBT hexs
     */
    signPsbts: async function(psbtHexs, options = []) {
      return sendMessage('signPsbts', { psbtHexs, options });
    },

    /**
     * Push a transaction to the network
     * @param {string} txHex - Raw transaction hex
     * @returns {Promise<string>} Transaction ID
     */
    pushTx: async function(txHex) {
      return sendMessage('pushTx', { txHex });
    },

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {function} listener - Callback function
     */
    on: function(event, listener) {
      if (eventListeners[event]) {
        eventListeners[event].push(listener);
      }
    },

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {function} listener - Callback function
     */
    off: function(event, listener) {
      if (eventListeners[event]) {
        const index = eventListeners[event].indexOf(listener);
        if (index > -1) {
          eventListeners[event].splice(index, 1);
        }
      }
    },

    /**
     * Remove all event listeners for an event
     * @param {string} event - Event name
     */
    removeAllListeners: function(event) {
      if (event && eventListeners[event]) {
        eventListeners[event] = [];
      }
    }
  };

  // Expose the provider
  window.charmsWallet = charmsWallet;

  // Dispatch event to notify page that wallet is available
  window.dispatchEvent(new CustomEvent('charmsWallet#initialized'));
  
  console.log('Charms Wallet provider injected');
})();
