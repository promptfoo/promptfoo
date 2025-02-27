import { getDb } from '../database';
import logger from '../logger';
import NodeCache from 'node-cache';

/**
 * Base class for all domain models
 * Provides common functionality for persistence, caching, and error handling
 */
export class BaseModel {
  /**
   * Get a cache instance for a specific model
   * @param ttlSeconds Time to live in seconds (default: 2 hours)
   */
  protected static getModelCache(ttlSeconds: number = 60 * 60 * 2): NodeCache {
    // Use a class-level private property to store the cache
    const className = this.name;
    if (!BaseModel.caches[className]) {
      BaseModel.caches[className] = new NodeCache({ stdTTL: ttlSeconds });
      this.logDebug(`Created cache for ${className}`);
    }
    return BaseModel.caches[className];
  }

  /**
   * Clear the cache for a specific model
   */
  protected static clearModelCache(): void {
    const className = this.name;
    if (BaseModel.caches[className]) {
      BaseModel.caches[className].flushAll();
      this.logDebug(`Cleared cache for ${className}`);
    }
  }
  
  /**
   * Get the database instance
   */
  protected static getDb() {
    return getDb();
  }

  /**
   * Log a debug message
   */
  protected static logDebug(message: string) {
    logger.debug(`[${this.name}] ${message}`);
  }

  /**
   * Standard error handler for database operations
   * @param operation The operation description
   * @param err The error object
   * @param id Optional ID related to the operation
   */
  protected static handleError(operation: string, err: any, id?: string): void {
    const idMsg = id ? ` with ID ${id}` : '';
    logger.error(`[${this.name}] Failed to ${operation}${idMsg} from database:\n${err}`);
  }

  /**
   * Execute a database transaction
   * @param callback Function to execute within the transaction
   */
  protected static async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const db = this.getDb();
    return db.transaction(callback);
  }

  // Private static property to store caches
  private static caches: Record<string, NodeCache> = {};
} 