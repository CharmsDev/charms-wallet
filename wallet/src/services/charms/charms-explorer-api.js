// BRO Token hardcoded data for mocking
const BRO_TOKEN_DATA = {
    name: "Bro",
    decimals: 8,
    image: "https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg",
    description: ""
};

// BRO Token App ID (canonical, no aliases)
let BRO_TOKEN_APP_ID = "t/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f";

export const getBroTokenAppId = () => BRO_TOKEN_APP_ID;

/**
 * Provides an interface for interacting with the Charms Explorer API.
 * This service is responsible for fetching reference data for Charms and handling
 * special cases like the BRO token. It is designed as a singleton.
 */
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
                return charmData;
            }

            const referenceData = await response.json();
            
            // Merge reference data with original charm data, preserving CharmObj structure
            return {
                ...charmData,
                // Update metadata with reference data
                metadata: {
                    ...charmData.metadata,
                    ...referenceData.metadata
                },
                // Add convenience fields at root level if provided by reference data
                name: referenceData.name || charmData.name,
                description: referenceData.description || charmData.description,
                image: referenceData.image || charmData.image
            };

        } catch (error) {
            return charmData; // Return original data on error
        }
    }

    /**
     * Check if the given App ID corresponds to BRO token
     * @param {string} appId - The App ID to check
     * @returns {boolean} True if this is a BRO token
     */
    isBroToken(appId) {
        const normalize = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
        const target = normalize(appId);
        const canonical = normalize(BRO_TOKEN_APP_ID);
        const isMatch = target === canonical;
        return isMatch;
    }

    /**
     * Get BRO token reference data
     * @param {Object} charmData - Original charm data
     * @returns {Object} Enhanced charm data with BRO token information
     */
    getBroTokenData(charmData) {
        // Get the raw amount from the CharmObj structure
        const rawAmount = charmData.amount || 0;
        
        // Convert to display amount using decimals
        const displayAmount = rawAmount / Math.pow(10, BRO_TOKEN_DATA.decimals);
        
        // Format display amount - trim trailing zeros
        const displayAmountStr = (() => {
            const num = Number(displayAmount);
            if (Number.isInteger(num)) return String(num);
            return num.toFixed(8).replace(/\.0+$/,'').replace(/(\.[0-9]*?)0+$/,'$1');
        })();
        
        // Return enhanced CharmObj following the standard structure
        return {
            ...charmData,
            // Override metadata with BRO token data
            metadata: {
                ...charmData.metadata,
                name: BRO_TOKEN_DATA.name,
                description: BRO_TOKEN_DATA.description,
                image: BRO_TOKEN_DATA.image,
                ticker: "$BRO"
            },
            // Add convenience fields at root level for easier access
            name: BRO_TOKEN_DATA.name,
            description: BRO_TOKEN_DATA.description,
            image: BRO_TOKEN_DATA.image,
            ticker: "$BRO",
            displayAmount: displayAmountStr,
            decimals: BRO_TOKEN_DATA.decimals,
            isBroToken: true
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
                const appId = charm.appId || charm.id || charm.amount?.appId || charm.amount?.ticker || charm.amount?.name || 'unknown';

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
