import { drizzle } from 'drizzle-orm/mysql2';
import { DefaultLogger, type LogWriter } from 'drizzle-orm/logger';
import mysql from 'mysql2/promise';
import * as path from 'path';
import * as fs from 'fs';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from '../util/config/manage';

/**
 * Custom log writer for Drizzle ORM that respects PROMPTFOO_ENABLE_DATABASE_LOGS setting.
 */
export class DrizzleLogWriter implements LogWriter {
  write(message: string) {
    if (getEnvBool('PROMPTFOO_ENABLE_DATABASE_LOGS', false)) {
      logger.debug(`Drizzle: ${message}`);
    }
  }
}

let dbInstance: any = null;
let mysqlPool: mysql.Pool | null = null;

/**
 * MySQL connection configuration interface.
 */
interface MysqlConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  waitForConnections: boolean;
  queueLimit: number;
  ssl?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

/**
 * Gets MySQL connection configuration from environment variables.
 * Includes SSL configuration if PROMPTFOO_MYSQL_SSL is enabled.
 * 
 * @returns {MysqlConnectionConfig} MySQL connection configuration object
 */
export function getMysqlConnectionConfig(): MysqlConnectionConfig {
  const config: MysqlConnectionConfig = {
    host: process.env.PROMPTFOO_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.PROMPTFOO_MYSQL_PORT || '3306', 10),
    user: process.env.PROMPTFOO_MYSQL_USER || 'root',
    password: process.env.PROMPTFOO_MYSQL_PASSWORD || 'root',
    database: process.env.PROMPTFOO_MYSQL_DATABASE || 'promptfoo',
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
  };

  if (process.env.PROMPTFOO_MYSQL_SSL === 'true') {
    const rejectUnauthorized = getEnvBool('PROMPTFOO_MYSQL_SSL_REJECT_UNAUTHORIZED', true);
    const caPath = process.env.PROMPTFOO_MYSQL_SSL_CA;
    const certPath = process.env.PROMPTFOO_MYSQL_SSL_CERT;
    const keyPath = process.env.PROMPTFOO_MYSQL_SSL_KEY;
    config.ssl = {
      rejectUnauthorized,
      ...(caPath && fs.existsSync(caPath) && { ca: fs.readFileSync(caPath, 'utf8') }),
      ...(certPath && fs.existsSync(certPath) && { cert: fs.readFileSync(certPath, 'utf8') }),
      ...(keyPath && fs.existsSync(keyPath) && { key: fs.readFileSync(keyPath, 'utf8') }),
    };
  }

  return config;
}

/**
 * Gets the file path for MySQL configuration storage.
 * 
 * @returns {string} Absolute path to mysql-config file in config directory
 */
export function getDbPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'mysql-config');
}

/**
 * Gets the file path for the evaluation signal file.
 * Used to track when evaluations were last written.
 * 
 * @returns {string} Absolute path to evalLastWritten file in config directory
 */
export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

/**
 * Gets or creates the MySQL database connection.
 * Creates a connection pool with SSL support and automatic fallback for self-signed certificates.
 * Falls back to in-memory SQLite during testing (IS_TESTING=true).
 * 
 * @returns {Promise<MySql2Database<Record<string, never>>>} Drizzle database instance
 * @throws {Error} If MySQL connection fails after SSL fallback attempt
 */
export async function getDb() {
  if (!dbInstance) {
    const isMemoryDb = getEnvBool('IS_TESTING');
    
    if (isMemoryDb) {
      // For testing, fall back to SQLite in memory
      const Database = require('better-sqlite3');
      const { drizzle: sqliteDrizzle } = require('drizzle-orm/better-sqlite3');
      const sqliteInstance = new Database(':memory:');
      const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
      dbInstance = sqliteDrizzle(sqliteInstance, { logger: drizzleLogger });
    } else {
      let config = getMysqlConnectionConfig();
      let attemptedFallback = false;

      const tryConnect = async () => {
        mysqlPool = mysql.createPool(config);
        const connection = await mysqlPool.getConnection();
        await connection.ping();
        connection.release();
        logger.debug('MySQL connection pool established successfully');
        const drizzleLogger = new DefaultLogger({ writer: new DrizzleLogWriter() });
        dbInstance = drizzle(mysqlPool, { logger: drizzleLogger });
      };

      try {
        await tryConnect();
      } catch (error: any) {
        logger.error(`Failed to connect to MySQL: ${error}`);
        if (
          String(error).includes('self-signed certificate') &&
          config.ssl &&
          config.ssl.rejectUnauthorized !== false &&
          !attemptedFallback
        ) {
          logger.warn('Retrying MySQL connection with rejectUnauthorized=false due to self-signed certificate');
          config.ssl.rejectUnauthorized = false;
          attemptedFallback = true;
          try {
            await tryConnect();
          } catch (err2) {
            throw new Error(`MySQL connection failed after SSL fallback: ${err2}`);
          }
        } else {
          throw new Error(`MySQL connection failed: ${error}`);
        }
      }
    }
  }
  return dbInstance;
}

/**
 * Closes the MySQL connection pool and resets the database instance.
 * Gracefully handles errors during pool closure.
 * 
 * @returns {Promise<void>}
 */
export async function closeDb() {
  if (mysqlPool) {
    try {
      await mysqlPool.end();
      logger.debug('MySQL connection pool closed successfully');
    } catch (err) {
      logger.debug(`Could not close MySQL connection pool: ${err}`);
    }
    mysqlPool = null;
  }
  dbInstance = null;
}

/**
 * Checks if the MySQL database connection is currently open.
 * 
 * @returns {boolean} True if database instance exists, false otherwise
 */
export function isDbOpen(): boolean {
  return dbInstance !== null;
}

/**
 * Tests MySQL connectivity by creating a temporary connection.
 * Includes SSL fallback for self-signed certificate errors.
 * 
 * @returns {Promise<boolean>} True if connection test succeeds, false otherwise
 */
export async function testMysqlConnection(): Promise<boolean> {
  try {
    const baseConfig = getMysqlConnectionConfig();
    const connectionConfig: any = {
      host: baseConfig.host,
      port: baseConfig.port,
      user: baseConfig.user,
      password: baseConfig.password,
      database: baseConfig.database,
      ...(baseConfig.ssl && { ssl: baseConfig.ssl }),
    };

    const connection = await mysql.createConnection(connectionConfig);
    await connection.ping();
    await connection.end();
    return true;
  } catch (error: any) {
    if (
      String(error).includes('self-signed certificate') &&
      process.env.PROMPTFOO_MYSQL_SSL === 'true'
    ) {
      logger.warn('Self-signed cert detected in test; retrying with rejectUnauthorized=false');
      const cfg = getMysqlConnectionConfig();
      if (cfg.ssl) {
        cfg.ssl.rejectUnauthorized = false;
      }
      try {
        const conn = await mysql.createConnection({
          host: cfg.host,
          port: cfg.port,
          user: cfg.user,
          password: cfg.password,
          database: cfg.database,
          ...(cfg.ssl && { ssl: cfg.ssl }),
        });
        await conn.ping();
        await conn.end();
        return true;
      } catch (err2) {
        logger.error(`MySQL connection test failed after fallback: ${err2}`);
        return false;
      }
    }
    logger.error(`MySQL connection test failed: ${error}`);
    return false;
  }
}