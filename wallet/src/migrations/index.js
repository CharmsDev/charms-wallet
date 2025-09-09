/**
 * Migration System for Charms Wallet
 * 
 * This system handles data migrations and cleanup operations for localStorage
 * to ensure compatibility across wallet versions.
 */

const MIGRATION_STORAGE_KEY = 'charms_wallet_migrations_executed';

/**
 * Get list of executed migrations from localStorage
 */
const getExecutedMigrations = () => {
    try {
        const executed = localStorage.getItem(MIGRATION_STORAGE_KEY);
        return executed ? JSON.parse(executed) : [];
    } catch (error) {
        console.error('[MIGRATIONS] Error reading executed migrations:', error);
        return [];
    }
};

/**
 * Mark a migration as executed
 */
const markMigrationExecuted = (migrationId) => {
    try {
        const executed = getExecutedMigrations();
        if (!executed.includes(migrationId)) {
            executed.push(migrationId);
            localStorage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify(executed));
            console.log(`[MIGRATIONS] Marked migration ${migrationId} as executed`);
        }
    } catch (error) {
        console.error(`[MIGRATIONS] Error marking migration ${migrationId} as executed:`, error);
    }
};

/**
 * Check if a migration has been executed
 */
const isMigrationExecuted = (migrationId) => {
    const executed = getExecutedMigrations();
    return executed.includes(migrationId);
};

/**
 * Execute a single migration if it hasn't been run before
 */
const executeMigration = async (migration) => {
    if (isMigrationExecuted(migration.id)) {
        console.log(`[MIGRATIONS] Skipping already executed migration: ${migration.id}`);
        return;
    }

    console.log(`[MIGRATIONS] Executing migration: ${migration.id} - ${migration.description}`);
    
    try {
        await migration.execute();
        markMigrationExecuted(migration.id);
        console.log(`[MIGRATIONS] Successfully executed migration: ${migration.id}`);
    } catch (error) {
        console.error(`[MIGRATIONS] Failed to execute migration ${migration.id}:`, error);
        throw error;
    }
};

/**
 * Run all pending migrations
 */
export const runMigrations = async () => {
    console.log('[MIGRATIONS] Starting migration process...');
    
    // Show current migration status
    const executedMigrations = getExecutedMigrations();
    console.log('[MIGRATIONS] Previously executed migrations:', executedMigrations);
    
    // Import all migration modules
    const migrations = [];
    
    try {
        // Import migration modules dynamically
        const migration001 = await import('./001-clean-cross-network-utxos.js');
        migrations.push(migration001.default);
        
        // Future migrations can be added here:
        // const migration002 = await import('./002-example-migration.js');
        // migrations.push(migration002.default);
        
    } catch (error) {
        console.error('[MIGRATIONS] Error importing migration modules:', error);
    }

    // Sort migrations by ID to ensure proper execution order
    migrations.sort((a, b) => a.id.localeCompare(b.id));

    console.log(`[MIGRATIONS] Found ${migrations.length} migration(s) to process`);

    // Execute each migration
    for (const migration of migrations) {
        try {
            await executeMigration(migration);
        } catch (error) {
            console.error(`[MIGRATIONS] Migration ${migration.id} failed, stopping migration process`);
            break;
        }
    }

    // Show final migration status
    const finalExecutedMigrations = getExecutedMigrations();
    console.log('[MIGRATIONS] Final executed migrations:', finalExecutedMigrations);
    console.log('[MIGRATIONS] Migration process completed');
};

/**
 * Get migration status for debugging
 */
export const getMigrationStatus = () => {
    return {
        executed: getExecutedMigrations(),
        storageKey: MIGRATION_STORAGE_KEY
    };
};

/**
 * Reset all migration flags (for development/testing only)
 */
export const resetMigrations = () => {
    localStorage.removeItem(MIGRATION_STORAGE_KEY);
    console.log('[MIGRATIONS] All migration flags reset');
};
