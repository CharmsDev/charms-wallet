// ============================================================================
// UI PREFERENCES SERVICE
// Centralized management for all user interface preferences
// ============================================================================

const STORAGE_KEY = 'app_ui_preferences';

/**
 * UI Preferences Interface
 * Add new UI preferences here as the application grows
 */
export interface UIPreferences {
    utxoList: {
        showOnlySpendable: boolean;
    };
    // Future preferences can be added here:
    // theme?: 'dark' | 'light';
    // language?: string;
    // currency?: 'USD' | 'EUR' | 'BTC';
    // notifications?: boolean;
    // displayFormat?: 'BTC' | 'sats';
}

/**
 * Default UI preferences
 * These values are used when no preferences are stored
 */
const DEFAULT_UI_PREFERENCES: UIPreferences = {
    utxoList: {
        showOnlySpendable: true // Default: show only spendable UTXOs
    }
};

/**
 * Get all UI preferences from localStorage
 * Automatically merges with defaults to ensure all keys exist
 * @returns {UIPreferences} Complete UI preferences object
 */
export const getUIPreferences = (): UIPreferences => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_UI_PREFERENCES;
        
        const preferences = JSON.parse(stored);
        
        // Deep merge with defaults to ensure all keys exist
        return {
            ...DEFAULT_UI_PREFERENCES,
            ...preferences,
            utxoList: {
                ...DEFAULT_UI_PREFERENCES.utxoList,
                ...preferences.utxoList
            }
        };
    } catch (error) {
        console.error('[UI-PREFERENCES] Failed to get preferences:', error);
        return DEFAULT_UI_PREFERENCES;
    }
};

/**
 * Save all UI preferences to localStorage
 * @param {UIPreferences} preferences - Complete preferences object
 */
export const saveUIPreferences = (preferences: UIPreferences): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
        console.error('[UI-PREFERENCES] Failed to save preferences:', error);
    }
};

/**
 * Update a specific section of UI preferences without overwriting others
 * @param {K} section - The section to update (e.g., 'utxoList')
 * @param {UIPreferences[K]} value - The new value for that section
 * 
 * @example
 * updateUIPreference('utxoList', { showOnlySpendable: false });
 */
export const updateUIPreference = <K extends keyof UIPreferences>(
    section: K,
    value: UIPreferences[K]
): void => {
    try {
        const current = getUIPreferences();
        const updated = {
            ...current,
            [section]: value
        };
        saveUIPreferences(updated);
    } catch (error) {
        console.error('[UI-PREFERENCES] Failed to update preference:', error);
    }
};

/**
 * Reset all UI preferences to defaults
 */
export const resetUIPreferences = (): void => {
    try {
        saveUIPreferences(DEFAULT_UI_PREFERENCES);
    } catch (error) {
        console.error('[UI-PREFERENCES] Failed to reset preferences:', error);
    }
};

/**
 * Get a specific preference section
 * @param {K} section - The section to retrieve
 * @returns {UIPreferences[K]} The requested section
 * 
 * @example
 * const utxoPrefs = getPreferenceSection('utxoList');
 */
export const getPreferenceSection = <K extends keyof UIPreferences>(
    section: K
): UIPreferences[K] => {
    const preferences = getUIPreferences();
    return preferences[section];
};
