#!/usr/bin/env node

/**
 * Data migration script from SQLite to MySQL
 * This script will:
 * 1. Connect to both SQLite and MySQL databases
 * 2. Export data from SQLite
 * 3. Import data into MySQL
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { getDbPath } from './src/database/index';
import { getMysqlConnectionConfig, testMysqlConnection } from './src/database/mysql-index';
import logger from './src/logger';

interface MigrationStats {
  tables: string[];
  totalRecords: number;
  migratedRecords: number;
  errors: string[];
}

async function migrateSqliteToMysql(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    tables: [],
    totalRecords: 0,
    migratedRecords: 0,
    errors: [],
  };

  // Check if SQLite database exists
  const sqliteDbPath = getDbPath();
  if (!fs.existsSync(sqliteDbPath)) {
    logger.info(`No SQLite database found at: ${sqliteDbPath}`);
    return stats;
  }

  // Test MySQL connection
  const mysqlConnected = await testMysqlConnection();
  if (!mysqlConnected) {
    throw new Error('Cannot connect to MySQL database. Please check your configuration.');
  }

  logger.info('Starting data migration from SQLite to MySQL...');
  
  // Connect to SQLite
  const sqliteDb = new Database(sqliteDbPath, { readonly: true });
  
  // Connect to MySQL
  const mysqlConfig = getMysqlConnectionConfig();
  const mysqlConnection = await mysql.createConnection(mysqlConfig);

  try {
    // Get list of tables from SQLite
    const tables = sqliteDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    stats.tables = tables.map(t => t.name);
    logger.info(`Found ${tables.length} tables to migrate: ${stats.tables.join(', ')}`);

    for (const table of tables) {
      const tableName = table.name;
      logger.info(`Migrating table: ${tableName}`);

      try {
        // Get all data from SQLite table
        const sqliteRows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all() as any[];
        stats.totalRecords += sqliteRows.length;

        if (sqliteRows.length === 0) {
          logger.info(`Table ${tableName} is empty, skipping...`);
          continue;
        }

        // Get column names
        const columns = Object.keys(sqliteRows[0] as Record<string, any>);
        const placeholders = columns.map(() => '?').join(', ');
        const columnNames = columns.join(', ');

        // Prepare MySQL insert statement
        const insertSql = `INSERT IGNORE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;

        // Insert data in batches
        const batchSize = 1000;
        for (let i = 0; i < sqliteRows.length; i += batchSize) {
          const batch = sqliteRows.slice(i, i + batchSize);
          
          for (const row of batch) {
            try {
              const rowData = row as Record<string, any>;
              const values = columns.map(col => {
                const value = rowData[col];
                // Handle JSON columns - parse if string, stringify if object
                if (value && typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                  try {
                    JSON.parse(value);
                    return value;
                  } catch {
                    return value;
                  }
                }
                return value;
              });
              
              await mysqlConnection.execute(insertSql, values);
              stats.migratedRecords++;
            } catch (error) {
              const errorMsg = `Error inserting row in ${tableName}: ${error}`;
              logger.error(errorMsg);
              stats.errors.push(errorMsg);
            }
          }
          
          logger.info(`Migrated ${Math.min(i + batchSize, sqliteRows.length)}/${sqliteRows.length} rows from ${tableName}`);
        }

        logger.info(`✓ Completed migration of table ${tableName}: ${sqliteRows.length} rows`);
      } catch (error) {
        const errorMsg = `Error migrating table ${tableName}: ${error}`;
        logger.error(errorMsg);
        stats.errors.push(errorMsg);
      }
    }
  } finally {
    sqliteDb.close();
    await mysqlConnection.end();
  }

  return stats;
}

async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('Promptfoo SQLite to MySQL Migration Tool');
    logger.info('='.repeat(60));

    const stats = await migrateSqliteToMysql();

    logger.info('\n' + '='.repeat(60));
    logger.info('Migration Summary:');
    logger.info('='.repeat(60));
    logger.info(`Tables migrated: ${stats.tables.length}`);
    logger.info(`Total records found: ${stats.totalRecords}`);
    logger.info(`Records migrated: ${stats.migratedRecords}`);
    logger.info(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      logger.info('\nErrors encountered:');
      stats.errors.forEach(error => logger.error(`  - ${error}`));
    }

    if (stats.migratedRecords > 0) {
      logger.info('\nMigration completed successfully!');
    } else {
      logger.info('\nNo data was migrated. This might be normal if your database is empty.');
    }

  } catch (error) {
    logger.error(`Migration failed: ${error}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { migrateSqliteToMysql };