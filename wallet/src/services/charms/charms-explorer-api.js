/**
 * Charms Explorer API Service
 * Manages API calls to the Charms Explorer for NFT reference data
 */

// BRO Token hardcoded data for mocking
const BRO_TOKEN_DATA = {
    name: "BRO Token",
    decimals: 8,
    image: "https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg",
    description: ""
};

// BRO Token App ID (you'll need to replace this with the actual App ID)
let BRO_TOKEN_APP_ID = "BRO_TOKEN_APP_ID"; // TODO: Replace with actual BRO token App ID

class CharmsExplorerAPI {
    constructor() {
        this.baseUrl = "https://api.charms-explorer.com"; // TODO: Replace with actual API URL when available
        this.isApiReady = false; // Set to true when real API is available
    }

    /**
     * Get reference NFT data for a charm
     * @param {string} appId - The App ID of the charm/token
     * @param {Object} charmData - Original charm data from localStorage
     * @returns {Promise<Object>} Enhanced charm data with reference NFT information
     */
    async getReferenceNFT(appId, charmData = {}) {
        try {
            // Check if this is a BRO token
            if (this.isBroToken(appId)) {
                return this.getBroTokenData(charmData);
            }

            // If API is not ready, return original data
            if (!this.isApiReady) {
                return charmData;
            }

            // TODO: Implement real API call when Charms Explorer API is ready
            const response = await fetch(`${this.baseUrl}/reference-nft/${appId}`);
            
            if (!response.ok) {
                console.warn(`Failed to fetch reference NFT for App ID: ${appId}`);
                return charmData;
            }

            const referenceData = await response.json();
            
            // Merge reference data with original charm data
            return {
                ...charmData,
                ...referenceData,
                // Preserve original charm-specific data
                amount: charmData.amount,
                utxo: charmData.utxo,
                txid: charmData.txid,
                vout: charmData.vout
            };

        } catch (error) {
            console.error('Error fetching reference NFT data:', error);
            return charmData; // Return original data on error
        }
    }

    /**
     * Check if the given App ID corresponds to BRO token
     * @param {string} appId - The App ID to check
     * @returns {boolean} True if this is a BRO token
     */
    isBroToken(appId) {
        // Match the exact logic used in dashboard BalanceDisplay.js
        return appId === BRO_TOKEN_APP_ID || 
               appId === 'CHARMS-TOKEN' ||
               appId?.toLowerCase().includes('bro') || 
               appId?.toLowerCase().includes('brotoken') ||
               appId?.toLowerCase().includes('charms-token');
    }

    /**
     * Get BRO token reference data
     * @param {Object} charmData - Original charm data
     * @returns {Object} Enhanced charm data with BRO token information
     */
    getBroTokenData(charmData) {
        // Calculate display amount using decimals
        const rawAmount = charmData.amount?.remaining || charmData.amount || 0;
        const displayAmount = rawAmount ? 
            (rawAmount / Math.pow(10, BRO_TOKEN_DATA.decimals)).toFixed(BRO_TOKEN_DATA.decimals) : 
            rawAmount;
        
        return {
            ...charmData,
            name: BRO_TOKEN_DATA.name,
            decimals: BRO_TOKEN_DATA.decimals,
            image: BRO_TOKEN_DATA.image,
            description: BRO_TOKEN_DATA.description,
            displayAmount: displayAmount,
            // Keep original amount for calculations
            rawAmount: rawAmount,
            // Mark as BRO token for special handling
            isBroToken: true,
            // Update amount object if it exists
            amount: charmData.amount ? {
                ...charmData.amount,
                name: BRO_TOKEN_DATA.name,
                image: BRO_TOKEN_DATA.image,
                description: BRO_TOKEN_DATA.description,
                remaining: displayAmount
            } : undefined
        };
    }

    /**
     * Batch process multiple charms to get their reference NFT data
     * @param {Array} charms - Array of charm objects
     * @returns {Promise<Array>} Array of enhanced charm objects
     */
    async processCharmsWithReferenceData(charms) {
        if (!Array.isArray(charms)) {
            return charms;
        }

        const processedCharms = await Promise.all(
            charms.map(async (charm) => {
                // Try different ways to get the App ID - prioritize ticker which is what dashboard uses
                const appId = charm.amount?.ticker || charm.appId || charm.id || charm.amount?.name || 'unknown';
                
                if (appId && appId !== 'unknown') {
                    return await this.getReferenceNFT(appId, charm);
                }
                return charm;
            })
        );

        return processedCharms;
    }

    /**
     * Update BRO token App ID when it becomes available
     * @param {string} appId - The actual BRO token App ID
     */
    setBroTokenAppId(appId) {
        BRO_TOKEN_APP_ID = appId;
    }

    /**
     * Enable real API calls when Charms Explorer API becomes available
     * @param {string} apiUrl - The base URL for the Charms Explorer API
     */
    enableRealAPI(apiUrl) {
        this.baseUrl = apiUrl;
        this.isApiReady = true;
    }
}

// Create and export singleton instance
const charmsExplorerAPI = new CharmsExplorerAPI();

export default charmsExplorerAPI;
