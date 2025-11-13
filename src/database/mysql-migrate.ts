import * as path from 'path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { getDb } from './mysql-index';
import logger from '../logger';

/**
 * Check if the migration tracking table exists and create it if needed
 */
async function ensureMigrationTable(db: any): Promise<void> {
  try {
    // Check if the __drizzle_migrations table exists
    const result = await db.execute(
      sql`SELECT COUNT(*) AS count
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
          AND table_name = '__drizzle_migrations'`,
    );
    const count = Number(result.rows?.[0]?.count ?? 0);

    if (count === 0) {
      logger.debug('Creating Drizzle migration tracking table...');
      await db.execute(
        sql`CREATE TABLE \`__drizzle_migrations\` (
          \`id\` SERIAL PRIMARY KEY,
          \`hash\` text NOT NULL,
          \`created_at\` bigint
        )`,
      );
    }
  } catch (error) {
    logger.debug(`Migration table check/creation failed: ${error}`);
    // Continue anyway, Drizzle will handle this
  }
}

/**
 * Check if tables already exist and mark migration as applied if they do
 */
async function handleExistingTables(db: any): Promise<boolean> {
  try {
    // Check if key tables exist (indicating the schema is already set up)
    const result = await db.execute(
      sql`SELECT COUNT(*) AS count
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
          AND table_name IN ('configs', 'evals', 'eval_results', 'prompts')`,
    );
    const existingTables = Number(result.rows?.[0]?.count ?? 0);

    if (existingTables > 0) {
      logger.debug(`Found ${existingTables} existing tables. Checking migration status...`);

      // Ensure migration table exists first
      await ensureMigrationTable(db);

      // Check if migration is already recorded
      try {
        const migrationResult = await db.execute(
          sql`SELECT COUNT(*) AS count FROM \`__drizzle_migrations\``,
        );
        const migrationCount = Number(migrationResult.rows?.[0]?.count ?? 0);

        if (migrationCount === 0) {
          logger.info('Tables exist but no migrations recorded. Marking initial migration as applied...');
          
          // Use the Drizzle migration hash format
          const migrationHash = '0000_sparkling_hulk';
          const timestamp = Date.now();
          
          await db.execute(
            sql`INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`)
                VALUES (${migrationHash}, ${timestamp})`,
          );
          logger.info(`Marked migration ${migrationHash} as applied`);
          return true;
        } else {
          logger.info(`Migration tracking table already has ${migrationCount} entries`);
        }
      } catch (error) {
        logger.debug(`Migration table query failed: ${error}`);
      }
    }

    return false;
  } catch (error) {
    logger.debug(`Table existence check failed: ${error}`);
    return false;
  }
}

/**
 * Check if the core schema is already set up
 */
async function isSchemaSetup(db: any): Promise<boolean> {
  try {
    // Check for essential tables
    const result = await db.execute(
      sql`SELECT COUNT(*) AS count
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
          AND table_name IN ('configs', 'evals', 'eval_results', 'prompts')`,
    );
    const count = Number(result.rows?.[0]?.count ?? 0);

    return count >= 4; // All core tables exist
  } catch (error) {
    logger.debug(`Schema check failed: ${error}`);
    return false;
  }
}

/**
 * Runs MySQL database migrations, applying only unapplied migrations.
 * Checks if schema already exists and skips migration if fully set up.
 * Creates migration tracking table (__drizzle_migrations) if needed.
 * 
 * @returns {Promise<void>}
 * @throws {Error} If migration execution fails
 */
export async function runMysqlDbMigrations(): Promise<void> {
  try {
    const db = await getDb();
    const migrationsFolder = path.join(__dirname, '..', '..', 'drizzle-mysql');
    logger.debug(`Running MySQL database migrations from: ${migrationsFolder}`);
    
    // First check if schema is already fully set up
    const schemaExists = await isSchemaSetup(db);
    if (schemaExists) {
      logger.info('MySQL schema already exists, checking migration tracking...');
      
      // Ensure migration tracking table exists
      await ensureMigrationTable(db);
      
      // Mark migration as applied if not already done
      try {
        const migrationResult = await db.execute(
          sql`SELECT COUNT(*) AS count FROM \`__drizzle_migrations\``,
        );
        const migrationCount = Number(migrationResult.rows?.[0]?.count ?? 0);

        if (migrationCount === 0) {
          logger.info('Marking existing schema as migrated...');
          const migrationHash = '0000_sparkling_hulk';
          const timestamp = Date.now();
          
          await db.execute(
            sql`INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`)
                VALUES (${migrationHash}, ${timestamp})`,
          );
          logger.info('MySQL database is ready (existing schema marked as migrated)');
        } else {
          logger.info('MySQL database is ready (migrations already tracked)');
        }
      } catch (error) {
        logger.debug(`Migration tracking setup failed: ${error}`);
      }
      
      return;
    }
    
    // Schema doesn't exist, proceed with normal migration
    logger.debug('Schema not found, proceeding with migration...');
    
    // Ensure migration tracking table exists
    await ensureMigrationTable(db);
    
    // Run normal migration process
    try {
      await migrate(db, { migrationsFolder });
      logger.info('MySQL database migrations completed successfully');
    } catch (error) {
      // If we get a "table exists" error, try to recover
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = (error as any)?.cause;
      const causeMessage = errorCause instanceof Error ? errorCause.message : '';
      
      if (errorMessage.includes('already exists') || 
          errorMessage.includes('ER_TABLE_EXISTS_ERROR') ||
          causeMessage.includes('already exists') ||
          (errorCause as any)?.code === 'ER_TABLE_EXISTS_ERROR') {
        await handleExistingTables(db);
        } else {
        throw error;
      }
    }
    
  } catch (error) {
    logger.error(`MySQL database migration failed: ${error}`);
    throw error;
  }
}

if (require.main === module) {
  // Run migrations and exit with appropriate code
  runMysqlDbMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}