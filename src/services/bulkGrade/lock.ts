import logger from '../../logger';

/**
 * Default lock TTL in milliseconds (5 minutes).
 * After this time, locks are automatically considered expired.
 */
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory lock for eval-level bulk operations.
 * Prevents concurrent bulk operations on the same eval.
 *
 * **IMPORTANT: Single-Instance Limitation**
 * This lock manager uses in-memory storage and will NOT work correctly in
 * multi-instance deployments. If running multiple server instances behind
 * a load balancer, two instances could acquire locks on the same eval
 * simultaneously. For production multi-instance deployments, consider:
 * - Using a database-level advisory lock
 * - Using Redis-based distributed locking
 * - Implementing a "SELECT FOR UPDATE" pattern
 *
 * The lock is sufficient for single-instance deployments and development.
 */
class EvalLockManager {
  private locks: Map<string, { acquiredAt: number; operation: string }> = new Map();
  private readonly lockTtlMs: number;

  constructor(lockTtlMs: number = DEFAULT_LOCK_TTL_MS) {
    this.lockTtlMs = lockTtlMs;
  }

  /**
   * Attempts to acquire a lock for the given eval.
   * If an existing lock has expired (exceeded TTL), it will be automatically released.
   *
   * @param evalId - The eval ID to lock
   * @param operation - Description of the operation (for logging)
   * @returns true if lock was acquired, false if already locked
   */
  acquire(evalId: string, operation: string): boolean {
    const existing = this.locks.get(evalId);

    // Check if there's an existing lock
    if (existing) {
      const lockAge = Date.now() - existing.acquiredAt;

      // Check if the lock has expired (TTL exceeded)
      if (lockAge > this.lockTtlMs) {
        logger.warn(`Lock expired for eval ${evalId}, forcing release`, {
          operation: existing.operation,
          lockAgeMs: lockAge,
          ttlMs: this.lockTtlMs,
        });
        this.locks.delete(evalId);
      } else {
        logger.debug(`Lock acquisition failed for eval ${evalId}: already locked`, {
          existingOperation: existing.operation,
          acquiredAt: existing.acquiredAt,
          lockAgeMs: lockAge,
        });
        return false;
      }
    }

    this.locks.set(evalId, {
      acquiredAt: Date.now(),
      operation,
    });

    logger.debug(`Lock acquired for eval ${evalId}`, { operation });
    return true;
  }

  /**
   * Releases the lock for the given eval.
   *
   * @param evalId - The eval ID to unlock
   */
  release(evalId: string): void {
    const lock = this.locks.get(evalId);
    if (lock) {
      const heldMs = Date.now() - lock.acquiredAt;
      logger.debug(`Lock released for eval ${evalId}`, {
        operation: lock.operation,
        heldMs,
      });
      this.locks.delete(evalId);
    }
  }

  /**
   * Checks if an eval is currently locked (and lock has not expired).
   *
   * @param evalId - The eval ID to check
   * @returns true if locked and not expired, false otherwise
   */
  isLocked(evalId: string): boolean {
    const lock = this.locks.get(evalId);
    if (!lock) {
      return false;
    }

    // Check if lock has expired
    const lockAge = Date.now() - lock.acquiredAt;
    if (lockAge > this.lockTtlMs) {
      // Auto-cleanup expired lock
      this.locks.delete(evalId);
      return false;
    }

    return true;
  }

  /**
   * Gets information about a lock if it exists and is not expired.
   *
   * @param evalId - The eval ID to check
   * @returns Lock info or null if not locked
   */
  getLockInfo(evalId: string): { acquiredAt: number; operation: string; ageMs: number } | null {
    const lock = this.locks.get(evalId);
    if (!lock) {
      return null;
    }

    const ageMs = Date.now() - lock.acquiredAt;
    if (ageMs > this.lockTtlMs) {
      this.locks.delete(evalId);
      return null;
    }

    return {
      acquiredAt: lock.acquiredAt,
      operation: lock.operation,
      ageMs,
    };
  }

  /**
   * Gets the current lock count (for debugging/monitoring).
   * Note: This includes potentially expired locks that haven't been cleaned up yet.
   */
  getLockCount(): number {
    return this.locks.size;
  }

  /**
   * Gets the configured TTL in milliseconds.
   */
  getTtlMs(): number {
    return this.lockTtlMs;
  }

  /**
   * Cleans up all expired locks.
   * Called automatically during acquire/isLocked, but can be invoked manually.
   *
   * @returns Number of locks that were cleaned up
   */
  cleanupExpiredLocks(): number {
    const now = Date.now();
    let cleanedUp = 0;

    for (const [evalId, lock] of this.locks) {
      if (now - lock.acquiredAt > this.lockTtlMs) {
        logger.debug(`Cleaning up expired lock for eval ${evalId}`, {
          operation: lock.operation,
          ageMs: now - lock.acquiredAt,
        });
        this.locks.delete(evalId);
        cleanedUp++;
      }
    }

    return cleanedUp;
  }
}

/**
 * Singleton instance of the eval lock manager.
 *
 * **Note:** This lock only works within a single server instance.
 * See EvalLockManager class documentation for multi-instance considerations.
 */
export const evalLockManager = new EvalLockManager();
