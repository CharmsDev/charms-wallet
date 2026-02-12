/**
 * API Client for Chrome Extension
 * Routes API requests through background service worker to avoid CORS issues
 * Falls back to direct fetch in web context
 */

const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

/**
 * Make an API request
 * In extension context, routes through background service worker
 * In web context, makes direct fetch call
 */
export async function apiRequest({ url, method = 'GET', headers = {}, body }) {
  if (isExtension) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'API_REQUEST',
          payload: { url, method, headers, body }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        }
      );
    });
  }

  // Direct fetch for web context
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (body && method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

/**
 * Mempool.space API endpoints
 */
export const MempoolAPI = {
  getBaseUrl(network) {
    return network === 'mainnet' 
      ? 'https://mempool.space/api'
      : 'https://mempool.space/testnet4/api';
  },

  async getAddressUTXOs(address, network = 'testnet4') {
    const url = `${this.getBaseUrl(network)}/address/${address}/utxo`;
    return apiRequest({ url });
  },

  async getTransaction(txid, network = 'testnet4') {
    const url = `${this.getBaseUrl(network)}/tx/${txid}`;
    return apiRequest({ url });
  },

  async getTransactionHex(txid, network = 'testnet4') {
    const url = `${this.getBaseUrl(network)}/tx/${txid}/hex`;
    const response = await fetch(url);
    return response.text();
  },

  async broadcastTransaction(txHex, network = 'testnet4') {
    const url = `${this.getBaseUrl(network)}/tx`;
    return apiRequest({ url, method: 'POST', body: txHex });
  },

  async isUtxoSpent(txid, vout, network = 'testnet4') {
    const url = `${this.getBaseUrl(network)}/tx/${txid}/outspend/${vout}`;
    const result = await apiRequest({ url });
    return result.spent === true;
  }
};

export default apiRequest;
