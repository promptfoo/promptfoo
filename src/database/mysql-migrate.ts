import * as path from 'path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { getDb } from './mysql-index';
import logger from '../logger';

/**
 * Check if the migration tracking table exists and create it if needed
 */
async function ensureMigrationTable(db: any): Promise<void> {
  try {
    // Check if the __drizzle_migrations table exists
    const [rows] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = '__drizzle_migrations'
    `);
    
    if (rows[0].count === 0) {
      logger.debug('Creating Drizzle migration tracking table...');
      await db.execute(`
        CREATE TABLE \`__drizzle_migrations\` (
          \`id\` SERIAL PRIMARY KEY,
          \`hash\` text NOT NULL,
          \`created_at\` bigint
        )
      `);
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
    const [rows] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name IN ('configs', 'evals', 'eval_results', 'prompts')
    `);
    
    const existingTables = rows[0].count;
    
    if (existingTables > 0) {
      logger.debug(`Found ${existingTables} existing tables. Checking migration status...`);
      
      // Check if migration is already recorded by looking for the initial migration tag
      try {
        const [migrationRows] = await db.execute(`
          SELECT COUNT(*) as count 
          FROM \`__drizzle_migrations\`
        `);
        
        if (migrationRows[0].count === 0) {
          logger.info('Tables exist but no migrations recorded. Marking initial migration as applied...');
          // Calculate hash for the initial migration file
          const fs = require('fs');
          const crypto = require('crypto');
          const migrationPath = path.join(__dirname, '..', '..', 'drizzle-mysql', '0000_sparkling_hulk.sql');
          
          let hash = '0000_sparkling_hulk'; // Default fallback
          try {
            const migrationContent = fs.readFileSync(migrationPath, 'utf8');
            hash = crypto.createHash('sha256').update(migrationContent).digest('hex');
          } catch (error) {
            logger.debug(`Could not read migration file: ${error}`);
          }
          
          await db.execute(`
            INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) 
            VALUES (?, ?)
          `, [hash, Date.now()]);
          return true;
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
    const [rows] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name IN ('configs', 'evals', 'eval_results', 'prompts')
    `);
    
    return rows[0].count >= 4; // All core tables exist
  } catch (error) {
    logger.debug(`Schema check failed: ${error}`);
    return false;
  }
}

/**
 * Run migrations on the MySQL database, skipping the ones already applied.
 */
export async function runMysqlDbMigrations(): Promise<void> {
  try {
    const db = await getDb();
    const migrationsFolder = path.join(__dirname, '..', '..', 'drizzle-mysql');
    logger.debug(`Running MySQL database migrations from: ${migrationsFolder}`);
    
    // First check if schema is already fully set up
    const schemaExists = await isSchemaSetup(db);
    if (schemaExists) {      
      // Ensure migration tracking table exists
      await ensureMigrationTable(db);
      
      // Mark migration as applied if not already done
      try {
        const [migrationRows] = await db.execute(`
          SELECT COUNT(*) as count FROM \`__drizzle_migrations\`
        `);
        
        if (migrationRows[0].count === 0) {
          const migrationHash = '0000_sparkling_hulk_' + Date.now();
          await db.execute(`
            INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) 
            VALUES (?, ?)
          `, [migrationHash, Date.now()]);
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
      if (error instanceof Error && error.message && error.message.includes('already exists')) {
        logger.warn('Tables already exist during migration, attempting to mark migration as applied...');
        await handleExistingTables(db);
        logger.info('Migration state corrected. Database should now be ready.');
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