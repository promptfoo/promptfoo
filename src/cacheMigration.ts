import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

import logger from './logger';

/**
 * Migration sunset date: After this date, skip migration entirely.
 * Users who haven't upgraded by then will start with a fresh cache.
 *
 * Set to 4 months after initial release (December 2025).
 * After this date, this entire migration module can be removed.
 *
 * TODO(2026-04-01): Remove this migration code after sunset date.
 */
const MIGRATION_SUNSET_DATE = new Date('2026-04-01T00:00:00Z');

/**
 * Check if migration has been sunset (date has passed).
 * After sunset, we skip migration entirely - users get a fresh cache.
 */
function isMigrationSunset(): boolean {
  return Date.now() >= MIGRATION_SUNSET_DATE.getTime();
}

/**
 * Cache migration from cache-manager v4 (cache-manager-fs-hash) to v7 (keyv-file)
 *
 * Old format (cache-manager-fs-hash):
 * - Multiple JSON files in diskstore-* directories
 * - Each file: {expireTime: string, key: string, val: string}
 *
 * New format (keyv-file):
 * - Single JSON file
 * - Structure: {cache: [[key, {value, expires}], ...], lastExpire: number}
 * - Note: Keyv uses 'expires' (not 'expire') for TTL timestamp in milliseconds
 */

interface OldCacheEntry {
  expireTime: string;
  key: string;
  val: string;
}

/**
 * Keyv cache entry format.
 * - value: The cached value (stored as-is from the old cache, typically a JSON string)
 * - expires: Optional TTL timestamp in milliseconds (undefined = no expiration)
 */
interface NewCacheEntry {
  value: string;
  expires?: number;
}

interface MigrationStats {
  totalFiles: number;
  successCount: number;
  failureCount: number;
  skippedExpired: number;
  errors: string[];
}

interface MigrationResult {
  success: boolean;
  stats: MigrationStats;
  backupPath?: string;
}

/**
 * Calculate total size of a directory recursively
 */
function getDirSize(dirPath: string): number {
  let totalSize = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const itemPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirSize(itemPath);
      } else {
        // Only stat files to get size (directories don't need size)
        totalSize += fs.statSync(itemPath).size;
      }
    }
  } catch (err) {
    // ENOENT means directory doesn't exist, which is fine
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`[Cache Migration] Error calculating directory size: ${(err as Error).message}`);
    }
  }

  return totalSize;
}

/**
 * Check if sufficient disk space is available for migration
 * Returns true if check passes or cannot be performed
 */
function checkDiskSpace(cachePath: string): boolean {
  try {
    // Get cache directory size
    const cacheSize = getDirSize(cachePath);

    // Try to get available disk space (platform-dependent)
    // Note: statfsSync is not available on all platforms
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(cachePath);
      const availableBytes = stats.bavail * stats.bsize;

      // Need at least: 2x cache size (backup + new cache) + 10MB safety margin
      const safetyMargin = 10 * 1024 * 1024; // 10 MB
      const requiredBytes = cacheSize * 2 + safetyMargin;

      logger.debug(
        `[Cache Migration] Disk space check: need ${(requiredBytes / 1024 / 1024).toFixed(2)}MB, ` +
          `have ${(availableBytes / 1024 / 1024).toFixed(2)}MB available`,
      );

      if (availableBytes < requiredBytes) {
        logger.error(
          `[Cache Migration] Insufficient disk space for migration. ` +
            `Need ${(requiredBytes / 1024 / 1024).toFixed(0)}MB, ` +
            `have ${(availableBytes / 1024 / 1024).toFixed(0)}MB available.`,
        );
        return false;
      }

      return true;
    } else {
      // statfsSync not available on this platform, skip check
      logger.debug('[Cache Migration] Disk space check not available on this platform, proceeding');
      return true;
    }
  } catch (err) {
    // If we can't check, log warning and proceed
    logger.warn(`[Cache Migration] Could not check disk space: ${(err as Error).message}`);
    return true;
  }
}

/** Maximum number of attempts to acquire the migration lock */
const MAX_LOCK_ATTEMPTS = 3;

/**
 * Check if a process with the given PID exists.
 * Uses signal 0 which doesn't actually send a signal but checks process existence.
 * Note: On Windows, this may throw different error types but the catch block handles it.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = No such process (Unix), EPERM = Permission denied but process exists
    return (err as { code: string }).code === 'EPERM';
  }
}

/**
 * Acquire a migration lock to prevent concurrent migrations.
 * Returns file descriptor if lock acquired, null if another process holds the lock.
 * Uses atomic file creation with 'wx' flag and includes stale lock detection.
 */
function acquireMigrationLock(cachePath: string, attempt: number = 1): number | null {
  if (attempt > MAX_LOCK_ATTEMPTS) {
    logger.warn(`[Cache Migration] Failed to acquire lock after ${MAX_LOCK_ATTEMPTS} attempts`);
    return null;
  }

  const lockFile = path.join(cachePath, '.migration.lock');

  try {
    // Ensure cache directory exists before creating lock file
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
    }

    // Try to create lock file exclusively (fails if exists)
    const fd = fs.openSync(lockFile, 'wx');

    // Write PID to lock file for debugging
    fs.writeSync(fd, process.pid.toString());
    fs.fsyncSync(fd); // Ensure write is flushed

    logger.debug(`[Cache Migration] Lock acquired (PID: ${process.pid})`);
    return fd;
  } catch (err) {
    if ((err as { code: string }).code === 'EEXIST') {
      // Lock file exists, check if it's stale
      try {
        const content = fs.readFileSync(lockFile, 'utf-8');
        const pid = parseInt(content, 10);

        if (!isNaN(pid)) {
          if (isProcessRunning(pid)) {
            logger.info(`[Cache Migration] Another migration is in progress (PID: ${pid})`);
            return null; // Process exists, lock is valid
          }

          // Process doesn't exist, lock is stale
          logger.warn(`[Cache Migration] Removing stale lock file (PID: ${pid} not found)`);
          try {
            fs.unlinkSync(lockFile);
            // Retry acquiring lock with incremented attempt counter
            return acquireMigrationLock(cachePath, attempt + 1);
          } catch (unlinkErr) {
            logger.error(
              `[Cache Migration] Failed to remove stale lock: ${(unlinkErr as Error).message}`,
            );
            return null;
          }
        }
      } catch (readErr) {
        logger.warn(`[Cache Migration] Could not read lock file: ${(readErr as Error).message}`);
      }
      return null;
    }
    // Other error, throw it
    throw err;
  }
}

/**
 * Release the migration lock
 */
function releaseMigrationLock(fd: number | null, cachePath: string): void {
  if (fd === null) {
    return;
  }

  const lockFile = path.join(cachePath, '.migration.lock');

  try {
    fs.closeSync(fd);
  } catch (err) {
    logger.warn(`[Cache Migration] Failed to close lock file: ${(err as Error).message}`);
  }

  try {
    fs.unlinkSync(lockFile);
    logger.debug('[Cache Migration] Lock released');
  } catch (err) {
    logger.warn(`[Cache Migration] Failed to remove lock file: ${(err as Error).message}`);
  }
}

/**
 * Parse expireTime field, handling the "[object Object]" suffix bug
 */
function parseExpireTime(expireTimeValue: string | number | unknown): number | undefined {
  try {
    // Handle number type
    if (typeof expireTimeValue === 'number') {
      return expireTimeValue > 0 ? expireTimeValue : undefined;
    }

    // Handle string type
    if (typeof expireTimeValue === 'string') {
      // Remove "[object Object]" suffix if present
      const cleaned = expireTimeValue.replace(/\[object Object\].*$/, '');
      const timestamp = parseInt(cleaned, 10);

      if (isNaN(timestamp) || timestamp <= 0) {
        return undefined;
      }

      return timestamp;
    }

    // Other types (object, etc.) - invalid
    return undefined;
  } catch (_err) {
    return undefined;
  }
}

/**
 * Read all cache entries from cache-manager-fs-hash format
 */
function readOldCacheEntries(cachePath: string): {
  entries: Map<string, NewCacheEntry>;
  stats: MigrationStats;
} {
  const stats: MigrationStats = {
    totalFiles: 0,
    successCount: 0,
    failureCount: 0,
    skippedExpired: 0,
    errors: [],
  };

  const entries = new Map<string, NewCacheEntry>();

  if (!fs.existsSync(cachePath)) {
    logger.info(`[Cache Migration] No old cache directory found at ${cachePath}`);
    return { entries, stats };
  }

  // Find all diskstore-* directories (use withFileTypes to avoid extra stat calls)
  const dirEntries = fs.readdirSync(cachePath, { withFileTypes: true });
  const diskstoreDirs = dirEntries
    .filter((dirEntry) => dirEntry.isDirectory() && dirEntry.name.startsWith('diskstore-'))
    .map((dirEntry) => dirEntry.name);

  logger.info(`[Cache Migration] Found ${diskstoreDirs.length} diskstore directories`);

  // Log progress for large caches
  const shouldLogProgress = diskstoreDirs.length > 100;
  if (shouldLogProgress) {
    logger.info(`[Cache Migration] Processing large cache, this may take a moment...`);
  }

  const now = Date.now();
  let dirCount = 0;

  for (const dir of diskstoreDirs) {
    const dirPath = path.join(cachePath, dir);
    dirCount++;

    // Log progress every 100 directories for large caches
    if (shouldLogProgress && dirCount % 100 === 0) {
      logger.info(`[Cache Migration] Processed ${dirCount}/${diskstoreDirs.length} directories...`);
    }

    try {
      const files = fs.readdirSync(dirPath);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(dirPath, file);
        stats.totalFiles++;

        // Log progress every 1000 files for very large caches
        if (stats.totalFiles % 1000 === 0 && stats.totalFiles > 0) {
          logger.info(`[Cache Migration] Processed ${stats.totalFiles} files...`);
        }

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const oldEntry: OldCacheEntry = JSON.parse(content);

          // Validate required fields
          if (!oldEntry.key || oldEntry.val === undefined) {
            stats.failureCount++;
            stats.errors.push(`Missing required fields in ${filePath}`);
            continue;
          }

          // Parse expire time
          const expireTime = parseExpireTime(oldEntry.expireTime);

          // Skip expired entries
          if (expireTime && expireTime <= now) {
            stats.skippedExpired++;
            continue;
          }

          // Convert to new format
          const newEntry: NewCacheEntry = {
            value: oldEntry.val,
            expires: expireTime, // Keyv expects 'expires' field
          };

          entries.set(oldEntry.key, newEntry);
          stats.successCount++;
        } catch (err) {
          stats.failureCount++;
          stats.errors.push(`Error parsing ${filePath}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      stats.failureCount++;
      stats.errors.push(`Error reading directory ${dirPath}: ${(err as Error).message}`);
    }
  }

  return { entries, stats };
}

/**
 * Validate that a cache file can be read and has the expected structure.
 * Returns the number of entries if valid, throws if invalid.
 */
function validateCacheFile(cachePath: string, expectedEntryCount: number): void {
  if (!fs.existsSync(cachePath)) {
    throw new Error(`Cache file does not exist after write: ${cachePath}`);
  }

  const content = fs.readFileSync(cachePath, 'utf-8');
  let parsed: { cache?: unknown; lastExpire?: number };

  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Cache file is not valid JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed.cache)) {
    throw new Error('Cache file has invalid structure: missing or invalid "cache" array');
  }

  if (typeof parsed.lastExpire !== 'number') {
    throw new Error('Cache file has invalid structure: missing or invalid "lastExpire" field');
  }

  if (parsed.cache.length !== expectedEntryCount) {
    throw new Error(
      `Cache file entry count mismatch: expected ${expectedEntryCount}, got ${parsed.cache.length}`,
    );
  }

  logger.debug(
    `[Cache Migration] Validated cache file: ${cachePath} (${expectedEntryCount} entries)`,
  );
}

/**
 * Write entries in keyv-file format using atomic write operation.
 * Writes to a temp file first, then renames atomically to prevent corruption.
 * Validates the written file before returning.
 */
function writeNewCacheFile(entries: Map<string, NewCacheEntry>, newCachePath: string): void {
  const cache: Array<[string, NewCacheEntry]> = Array.from(entries.entries());

  const data = {
    cache,
    lastExpire: Date.now(),
  };

  // Ensure directory exists
  const dir = path.dirname(newCachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Generate temporary file name with random suffix
  const tempFile = path.join(dir, `.cache.${randomBytes(8).toString('hex')}.tmp`);

  try {
    // Serialize data with error handling
    let serialized: string;
    try {
      serialized = JSON.stringify(data);
    } catch (err) {
      throw new Error(`Failed to serialize cache data: ${(err as Error).message}`);
    }

    // Write to temporary file first
    fs.writeFileSync(tempFile, serialized, 'utf-8');

    // Atomic rename - if this fails, original file is still intact
    fs.renameSync(tempFile, newCachePath);

    logger.debug(`[Cache Migration] Atomically wrote cache file: ${newCachePath}`);

    // Validate the written file to ensure data integrity
    validateCacheFile(newCachePath, entries.size);
  } catch (err) {
    // Clean up temporary file on error
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (_cleanupErr) {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Create a backup of the old cache directory
 */
function createBackup(cachePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${cachePath}.backup.${timestamp}`;

  logger.info(`[Cache Migration] Creating backup at ${backupPath}`);

  // Copy the entire cache directory
  if (fs.existsSync(cachePath)) {
    fs.cpSync(cachePath, backupPath, { recursive: true });
  }

  return backupPath;
}

/**
 * Mark migration as complete by creating a marker file
 */
function markMigrationComplete(cacheBasePath: string, stats: MigrationStats): void {
  const markerPath = path.join(cacheBasePath, '.cache-migrated');
  const metadata = {
    timestamp: new Date().toISOString(),
    stats,
    version: '4-to-7',
  };

  // Ensure directory exists
  if (!fs.existsSync(cacheBasePath)) {
    fs.mkdirSync(cacheBasePath, { recursive: true });
  }

  fs.writeFileSync(markerPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Check if migration has already been completed.
 * Uses fast-path: if marker exists AND new cache file exists, skip directory scan.
 * Only validates old cache format when inconsistency is suspected.
 */
function isMigrationComplete(cacheBasePath: string, newCacheFile?: string): boolean {
  const markerPath = path.join(cacheBasePath, '.cache-migrated');

  if (!fs.existsSync(markerPath)) {
    return false;
  }

  // Fast path: if marker exists AND new cache file exists, migration is complete
  // No need to scan for old cache format (expensive operation)
  if (newCacheFile && fs.existsSync(newCacheFile)) {
    return true;
  }

  // Slow path: marker exists but new cache file doesn't - check if this is a problem
  if (newCacheFile) {
    // Only now check for old cache format (this is the expensive operation)
    const hasOldCache = hasOldCacheFormat(cacheBasePath);

    if (hasOldCache) {
      // Marker exists but migration is incomplete or corrupted
      logger.warn(
        '[Cache Migration] Marker file exists but migration appears incomplete. ' +
          'Old cache format found but new cache missing. Retrying migration...',
      );
      try {
        fs.unlinkSync(markerPath); // Remove stale marker
      } catch (err) {
        logger.warn(`[Cache Migration] Failed to remove stale marker: ${(err as Error).message}`);
      }
      return false;
    }
  }

  // Marker exists, no new cache file specified or no old cache found - consider complete
  return true;
}

/**
 * Check if old cache format exists
 */
function hasOldCacheFormat(cachePath: string): boolean {
  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(cachePath, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }

  return dirEntries.some(
    (dirEntry) => dirEntry.isDirectory() && dirEntry.name.startsWith('diskstore-'),
  );
}

/**
 * Clean up old cache directories after successful migration
 */
function cleanupOldCache(cachePath: string): void {
  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(cachePath, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }

  const diskstoreDirs = dirEntries
    .filter((dirEntry) => dirEntry.isDirectory() && dirEntry.name.startsWith('diskstore-'))
    .map((dirEntry) => dirEntry.name);

  logger.info(`[Cache Migration] Cleaning up ${diskstoreDirs.length} old cache directories`);

  for (const dir of diskstoreDirs) {
    const dirPath = path.join(cachePath, dir);
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (err) {
      logger.warn(`[Cache Migration] Failed to remove ${dirPath}: ${(err as Error).message}`);
    }
  }
}

/**
 * Clean up backup directory after successful migration
 * Only deletes if no valuable data was migrated AND no failures occurred
 */
function cleanupBackup(backupPath: string, stats: MigrationStats): boolean {
  // Only clean up backup if:
  // 1. No entries were successfully migrated (nothing valuable)
  // 2. No failures occurred (no corrupted files to debug)
  // This means all entries were only expired - safe to delete
  if (stats.successCount === 0 && stats.failureCount === 0) {
    logger.info(
      `[Cache Migration] No valid entries found (${stats.skippedExpired} expired only). ` +
        `Removing backup to save space.`,
    );
    try {
      fs.rmSync(backupPath, { recursive: true, force: true });
      logger.info(`[Cache Migration] Backup removed: ${backupPath}`);
      return true; // Backup successfully deleted
    } catch (err) {
      logger.warn(
        `[Cache Migration] Failed to remove backup ${backupPath}: ${(err as Error).message}`,
      );
      return false; // Backup deletion failed, still exists
    }
  } else if (stats.failureCount > 0) {
    logger.info(
      `[Cache Migration] Backup kept at ${backupPath} due to ${stats.failureCount} migration errors. ` +
        `You may want to investigate these failures.`,
    );
    return false; // Backup kept
  } else {
    logger.info(
      `[Cache Migration] Backup kept at ${backupPath} (migrated ${stats.successCount} valid entries). ` +
        `You can manually delete this backup if you no longer need it.`,
    );
    return false; // Backup kept
  }
}

/**
 * Main migration function
 * Migrates cache from cache-manager v4 (cache-manager-fs-hash) to v7 (keyv-file)
 */
export function runMigration(cachePath: string, newCacheFilePath: string): MigrationResult {
  logger.info('[Cache Migration] Starting cache migration from v4 to v7');

  // Step 1: Acquire lock to prevent concurrent migrations
  const lock = acquireMigrationLock(cachePath);
  if (lock === null) {
    logger.info('[Cache Migration] Another migration is in progress, skipping');
    return {
      success: true,
      stats: {
        totalFiles: 0,
        successCount: 0,
        failureCount: 0,
        skippedExpired: 0,
        errors: [],
      },
    };
  }

  try {
    // Step 2: Check if migration is needed
    if (isMigrationComplete(cachePath, newCacheFilePath)) {
      logger.info('[Cache Migration] Migration already completed, skipping');
      return {
        success: true,
        stats: {
          totalFiles: 0,
          successCount: 0,
          failureCount: 0,
          skippedExpired: 0,
          errors: [],
        },
      };
    }

    if (!hasOldCacheFormat(cachePath)) {
      logger.info('[Cache Migration] No old cache format detected, skipping migration');
      // Mark as complete to prevent future checks
      markMigrationComplete(cachePath, {
        totalFiles: 0,
        successCount: 0,
        failureCount: 0,
        skippedExpired: 0,
        errors: [],
      });
      return {
        success: true,
        stats: {
          totalFiles: 0,
          successCount: 0,
          failureCount: 0,
          skippedExpired: 0,
          errors: [],
        },
      };
    }

    // Step 3: Check disk space before proceeding
    if (!checkDiskSpace(cachePath)) {
      logger.error('[Cache Migration] Insufficient disk space, aborting migration');
      return {
        success: false,
        stats: {
          totalFiles: 0,
          successCount: 0,
          failureCount: 1,
          skippedExpired: 0,
          errors: ['Insufficient disk space for migration'],
        },
      };
    }

    // Step 4: Create backup
    const backupPath = createBackup(cachePath);

    // Step 5: Read old cache entries
    logger.info('[Cache Migration] Reading old cache entries');
    const { entries, stats } = readOldCacheEntries(cachePath);

    logger.info(
      `[Cache Migration] Read ${stats.successCount} entries ` +
        `(${stats.failureCount} failures, ${stats.skippedExpired} expired)`,
    );

    // Log errors if any
    if (stats.errors.length > 0) {
      logger.warn(`[Cache Migration] Encountered ${stats.errors.length} errors:`);
      stats.errors.slice(0, 10).forEach((err) => logger.warn(`  - ${err}`));
      if (stats.errors.length > 10) {
        logger.warn(`  ... and ${stats.errors.length - 10} more errors`);
      }
    }

    // Step 6: Write new cache file
    if (entries.size > 0) {
      logger.info(
        `[Cache Migration] Writing ${entries.size} entries to new cache file: ${newCacheFilePath}`,
      );
      writeNewCacheFile(entries, newCacheFilePath);
    } else {
      logger.info('[Cache Migration] No entries to migrate');
    }

    // Step 7: Clean up old cache directories
    cleanupOldCache(cachePath);

    // Step 8: Clean up backup if appropriate
    const backupDeleted = cleanupBackup(backupPath, stats);

    // Step 9: Mark migration as complete (AFTER all cleanup succeeded)
    markMigrationComplete(cachePath, stats);

    logger.info('[Cache Migration] Migration completed successfully');

    return {
      success: true,
      stats,
      // Only return backupPath if backup was kept (not deleted)
      backupPath: backupDeleted ? undefined : backupPath,
    };
  } catch (err) {
    logger.error(`[Cache Migration] Migration failed: ${(err as Error).message}`);
    logger.error(`[Cache Migration] Stack trace: ${(err as Error).stack}`);
    return {
      success: false,
      stats: {
        totalFiles: 0,
        successCount: 0,
        failureCount: 1,
        skippedExpired: 0,
        errors: [(err as Error).message],
      },
    };
  } finally {
    // Always release the lock
    releaseMigrationLock(lock, cachePath);
  }
}

/**
 * Check if migration should be run.
 * Returns false if:
 * - Migration is already complete (marker + new cache file exist)
 * - Migration has been sunset (date passed)
 * - No old cache format exists
 */
export function shouldRunMigration(cachePath: string, newCacheFile?: string): boolean {
  // Fast path: check sunset date first (no I/O needed)
  if (isMigrationSunset()) {
    return false;
  }

  // Check if already complete (uses fast-path when possible)
  if (isMigrationComplete(cachePath, newCacheFile)) {
    return false;
  }

  // Finally, check if old cache format exists
  return hasOldCacheFormat(cachePath);
}
