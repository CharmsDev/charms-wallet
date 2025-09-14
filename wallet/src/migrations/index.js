/**
 * Migration system
 *
 * Provides a simple mechanism to register, order, and execute data migrations
 * backed by localStorage. Each migration declares an id, description and an
 * execute() function. Executed migrations are tracked to avoid re-running.
 */

const MIGRATION_STORAGE_KEY = 'charms_wallet_migrations_executed';

/**
 * Returns the list of executed migration ids from localStorage.
 */
const getExecutedMigrations = () => {
    try {
        const executed = localStorage.getItem(MIGRATION_STORAGE_KEY);
        return executed ? JSON.parse(executed) : [];
    } catch (error) {
        return [];
    }
};

/**
 * Marks a migration as executed by persisting its id.
 */
const markMigrationExecuted = (migrationId) => {
    try {
        const executed = getExecutedMigrations();
        if (!executed.includes(migrationId)) {
            executed.push(migrationId);
            localStorage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify(executed));
        }
    } catch (error) {
    }
};

/**
 * Returns true if a migration id is already recorded as executed.
 */
const isMigrationExecuted = (migrationId) => {
    const executed = getExecutedMigrations();
    return executed.includes(migrationId);
};

/**
 * Executes a single migration once, skipping if it was already executed.
 */
const executeMigration = async (migration) => {
    if (isMigrationExecuted(migration.id)) {
        return;
    }

    
    try {
        await migration.execute();
        markMigrationExecuted(migration.id);
    } catch (error) {
        throw error;
    }
};

/**
 * Runs all pending migrations in ascending id order.
 */
export const runMigrations = async () => {
    // Show current migration status
    const executedMigrations = getExecutedMigrations();
    
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
    }

    // Sort migrations by ID to ensure proper execution order
    migrations.sort((a, b) => a.id.localeCompare(b.id));


    // Execute each migration
    for (const migration of migrations) {
        try {
            await executeMigration(migration);
        } catch (error) {
            break;
        }
    }

    // Show final migration status
    const finalExecutedMigrations = getExecutedMigrations();
};

/**
 * Returns a snapshot of migration status.
 */
export const getMigrationStatus = () => {
    return {
        executed: getExecutedMigrations(),
        storageKey: MIGRATION_STORAGE_KEY
    };
};

/**
 * Clears all migration flags. Intended for development/testing.
 */
export const resetMigrations = () => {
    localStorage.removeItem(MIGRATION_STORAGE_KEY);
};
