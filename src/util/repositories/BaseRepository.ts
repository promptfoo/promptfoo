import { getDb } from '../../database';
import logger from '../../logger';
import NodeCache from 'node-cache';

/**
 * Base Repository class providing common functionality for database operations
 * All specific repositories should extend this class
 * 
 * @template TEntity The entity type this repository manages
 * @template TKey The type of the primary key
 */
export class BaseRepository<TEntity, TKey> {
  protected tableName: string;
  protected keyField: string;
  protected cache?: NodeCache;

  /**
   * Create a new repository
   * @param tableName The database table name
   * @param keyField The primary key field name
   * @param useCache Whether to enable caching
   */
  constructor(tableName: string, keyField: string, useCache: boolean = false) {
    this.tableName = tableName;
    this.keyField = keyField;
    
    if (useCache) {
      this.cache = new NodeCache({ stdTTL: 60 * 60 * 2 }); // Cache for 2 hours by default
    }
  }

  /**
   * Standard error handler for database operations
   * @param operation The operation description
   * @param err The error object
   * @param id Optional ID related to the operation
   */
  protected handleError(operation: string, err: any, id?: TKey): void {
    const idMsg = id ? ` with ID ${String(id)}` : '';
    logger.error(`Failed to ${operation}${idMsg} from database:\n${err}`);
  }

  /**
   * Get the database instance
   */
  protected getDb() {
    return getDb();
  }

  /**
   * Log a debug message
   */
  protected logDebug(message: string) {
    logger.debug(message);
  }
} 