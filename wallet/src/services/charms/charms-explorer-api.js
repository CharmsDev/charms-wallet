/**
 * Charms Explorer API Service
 * Manages API calls to the Charms Explorer for NFT reference data
 */

// BRO Token hardcoded data for mocking
const BRO_TOKEN_DATA = {
    name: "Bro",
    decimals: 8,
    image: "https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg",
    description: ""
};

// BRO Token App ID (real BRO charms token App ID)
let BRO_TOKEN_APP_ID = "t/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f";

export const getBroTokenAppId = () => BRO_TOKEN_APP_ID;

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
        // Strict exact match only
        return appId === BRO_TOKEN_APP_ID;
    }

    /**
     * Get BRO token reference data
     * @param {Object} charmData - Original charm data
     * @returns {Object} Enhanced charm data with BRO token information
     */
    getBroTokenData(charmData) {
        // Normalize amount from cache/service. Cached charms may already store a converted decimal string
        // in amount.remaining (e.g., "0.00000056") instead of the raw integer. Detect and handle both.
        const sourceRemaining = (charmData.amount && charmData.amount.remaining != null)
            ? charmData.amount.remaining
            : (charmData.amount ?? 0);

        let rawAmount = 0; // integer representation we will store alongside
        let displayAmount = 0; // human-readable number we want to show

        const isStringInput = typeof sourceRemaining === 'string';
        const parsed = isStringInput ? parseFloat(sourceRemaining) : sourceRemaining;

        try {
        } catch (e) { /* noop for SSR */ }

        if (!sourceRemaining || isNaN(parsed)) {
            rawAmount = 0;
            displayAmount = 0;
        } else if (isStringInput) {
            // Any string numeric from cache is considered a display unit already (e.g., '56.25' or '0.00000056')
            // Reconstruct raw from display
            displayAmount = parsed;
            rawAmount = Math.round(parsed * Math.pow(10, BRO_TOKEN_DATA.decimals));
        } else {
            // Assume raw integer value (e.g., 5625000000) and convert to decimal display
            rawAmount = parsed;
            displayAmount = rawAmount / Math.pow(10, BRO_TOKEN_DATA.decimals);
        }

        // Format: avoid forcing 8 decimals; let UI format. Keep up to 8, trim trailing zeros.
        const displayAmountStr = (() => {
            const num = Number(displayAmount);
            if (Number.isInteger(num)) return String(num);
            return num.toFixed(8).replace(/\.0+$/,'').replace(/(\.[0-9]*?)0+$/,'$1');
        })();
        try {
        } catch (e) { /* noop for SSR */ }
        
        return {
            ...charmData,
            name: BRO_TOKEN_DATA.name,
            decimals: BRO_TOKEN_DATA.decimals,
            image: BRO_TOKEN_DATA.image,
            description: BRO_TOKEN_DATA.description,
            displayAmount: displayAmountStr,
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
                remaining: displayAmountStr,
                ticker: "$BRO",
                originalRemaining: rawAmount // Keep original raw amount for calculations
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
                // Prefer explicit identifiers over display tickers/names
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
