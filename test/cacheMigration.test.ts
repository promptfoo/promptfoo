import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigration, shouldRunMigration } from '../src/cacheMigration';

describe('Cache Migration from v4 to v7', () => {
  let testCacheDir: string;
  let newCacheFile: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testCacheDir = path.join(os.tmpdir(), `test-cache-${Date.now()}`);
    fs.mkdirSync(testCacheDir, { recursive: true });
    newCacheFile = path.join(testCacheDir, 'cache.json');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  function createOldCacheEntry(
    diskstoreDir: string,
    filename: string,
    entry: { expireTime: string; key: string; val: string },
  ) {
    const dirPath = path.join(testCacheDir, diskstoreDir);
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
  }

  function readNewCacheFile(): { cache: Array<[string, any]>; lastExpire: number } {
    const content = fs.readFileSync(newCacheFile, 'utf-8');
    return JSON.parse(content);
  }

  describe('runMigration', () => {
    it('should migrate a simple cache entry', () => {
      // Create old cache entry
      const futureTime = Date.now() + 60000; // 1 minute in future
      createOldCacheEntry('diskstore-abc', 'test123.json', {
        expireTime: futureTime.toString(),
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'test value' }),
      });

      // Run migration
      const result = runMigration(testCacheDir, newCacheFile);

      // Verify result
      expect(result.success).toBe(true);
      expect(result.stats.successCount).toBe(1);
      expect(result.stats.failureCount).toBe(0);

      // Verify new cache file
      const newCache = readNewCacheFile();
      expect(newCache.cache).toHaveLength(1);
      expect(newCache.cache[0][0]).toBe('fetch:v2:https://example.com');
      expect(newCache.cache[0][1].value).toBe(JSON.stringify({ data: 'test value' }));
      expect(newCache.cache[0][1].expires).toBe(futureTime);
    });

    it('should handle expireTime with [object Object] suffix', () => {
      const futureTime = Date.now() + 60000;
      createOldCacheEntry('diskstore-abc', 'test123.json', {
        expireTime: `${futureTime}[object Object]`,
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'test value' }),
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.successCount).toBe(1);

      const newCache = readNewCacheFile();
      expect(newCache.cache[0][1].expires).toBe(futureTime);
    });

    it('should skip expired entries', () => {
      const pastTime = Date.now() - 60000; // 1 minute ago
      createOldCacheEntry('diskstore-abc', 'test123.json', {
        expireTime: pastTime.toString(),
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'expired value' }),
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.skippedExpired).toBe(1);
      expect(result.stats.successCount).toBe(0);

      // New cache file should be empty or not contain the expired entry
      if (fs.existsSync(newCacheFile)) {
        const newCache = readNewCacheFile();
        expect(newCache.cache).toHaveLength(0);
      }
    });

    it('should migrate multiple entries from multiple directories', () => {
      const futureTime = Date.now() + 60000;

      createOldCacheEntry('diskstore-abc', 'test1.json', {
        expireTime: futureTime.toString(),
        key: 'fetch:v2:https://example1.com',
        val: JSON.stringify({ data: 'value1' }),
      });

      createOldCacheEntry('diskstore-def', 'test2.json', {
        expireTime: (futureTime + 1000).toString(),
        key: 'fetch:v2:https://example2.com',
        val: JSON.stringify({ data: 'value2' }),
      });

      createOldCacheEntry('diskstore-abc', 'test3.json', {
        expireTime: (futureTime + 2000).toString(),
        key: 'fetch:v2:https://example3.com',
        val: JSON.stringify({ data: 'value3' }),
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.successCount).toBe(3);
      expect(result.stats.totalFiles).toBe(3);

      const newCache = readNewCacheFile();
      expect(newCache.cache).toHaveLength(3);
    });

    it('should handle corrupted JSON files gracefully', () => {
      const futureTime = Date.now() + 60000;

      // Valid entry
      createOldCacheEntry('diskstore-abc', 'valid.json', {
        expireTime: futureTime.toString(),
        key: 'fetch:v2:https://valid.com',
        val: JSON.stringify({ data: 'valid' }),
      });

      // Corrupted entry
      const dirPath = path.join(testCacheDir, 'diskstore-abc');
      const corruptedPath = path.join(dirPath, 'corrupted.json');
      fs.writeFileSync(corruptedPath, '{invalid json', 'utf-8');

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.successCount).toBe(1);
      expect(result.stats.failureCount).toBe(1);
      expect(result.stats.errors.length).toBeGreaterThan(0);

      const newCache = readNewCacheFile();
      expect(newCache.cache).toHaveLength(1);
    });

    it('should handle missing required fields', () => {
      const dirPath = path.join(testCacheDir, 'diskstore-abc');
      fs.mkdirSync(dirPath, { recursive: true });

      // Missing key
      fs.writeFileSync(
        path.join(dirPath, 'missing-key.json'),
        JSON.stringify({
          expireTime: (Date.now() + 60000).toString(),
          val: 'value',
        }),
        'utf-8',
      );

      // Missing val
      fs.writeFileSync(
        path.join(dirPath, 'missing-val.json'),
        JSON.stringify({
          expireTime: (Date.now() + 60000).toString(),
          key: 'test:key',
        }),
        'utf-8',
      );

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.failureCount).toBe(2);
    });

    it('should handle entries without expiration', () => {
      createOldCacheEntry('diskstore-abc', 'no-expire.json', {
        expireTime: 'invalid',
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'no expiration' }),
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.successCount).toBe(1);

      const newCache = readNewCacheFile();
      // When expireTime is invalid, the expires field should be undefined (no expiration)
      expect(newCache.cache[0][1].expires).toBeUndefined();
    });

    it('should create and keep backup when valid entries are migrated', () => {
      const futureTime = Date.now() + 60000;
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: futureTime.toString(),
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'test' }),
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);

      // Verify backup contains the old cache
      const backupDirs = fs.readdirSync(result.backupPath!);
      expect(backupDirs).toContain('diskstore-abc');
    });

    it('should delete backup when no valid entries are migrated (all expired)', () => {
      const pastTime = Date.now() - 60000; // expired
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: pastTime.toString(),
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'expired' }),
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.skippedExpired).toBe(1);
      expect(result.stats.successCount).toBe(0);

      // Backup should not be kept (backupPath undefined)
      expect(result.backupPath).toBeUndefined();

      // Verify backup directory for this specific test cache was deleted
      // The backup would have been at testCacheDir + '.backup.*'
      const parentDir = path.dirname(testCacheDir);
      const testCacheBasename = path.basename(testCacheDir);
      const backupDirs = fs
        .readdirSync(parentDir)
        .filter((d) => d.startsWith(testCacheBasename + '.backup.'));
      expect(backupDirs.length).toBe(0);
    });

    it('should keep backup when entries are corrupted (for debugging)', () => {
      // Create only corrupted entries
      const dirPath = path.join(testCacheDir, 'diskstore-abc');
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'corrupted.json'), '{invalid json', 'utf-8');

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.failureCount).toBe(1);
      expect(result.stats.successCount).toBe(0);

      // Backup should be KEPT when there are failures (for debugging)
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);
    });

    it('should keep backup when mix of expired and corrupted', () => {
      const dirPath = path.join(testCacheDir, 'diskstore-abc');
      fs.mkdirSync(dirPath, { recursive: true });

      // Expired entry
      createOldCacheEntry('diskstore-abc', 'expired.json', {
        expireTime: (Date.now() - 60000).toString(),
        key: 'expired:key',
        val: 'value',
      });

      // Corrupted entry
      fs.writeFileSync(path.join(dirPath, 'corrupted.json'), '{invalid', 'utf-8');

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.skippedExpired).toBe(1);
      expect(result.stats.failureCount).toBe(1);
      expect(result.stats.successCount).toBe(0);

      // Backup kept due to corruption
      expect(result.backupPath).toBeDefined();
    });

    it('should clean up old cache directories after successful migration', () => {
      const futureTime = Date.now() + 60000;
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: futureTime.toString(),
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'test' }),
      });

      runMigration(testCacheDir, newCacheFile);

      // Old diskstore directories should be removed
      const items = fs.readdirSync(testCacheDir);
      const diskstoreDirs = items.filter((item) => item.startsWith('diskstore-'));
      expect(diskstoreDirs).toHaveLength(0);
    });

    it('should not run migration twice', () => {
      const futureTime = Date.now() + 60000;
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: futureTime.toString(),
        key: 'fetch:v2:https://example.com',
        val: JSON.stringify({ data: 'test' }),
      });

      // First migration
      const result1 = runMigration(testCacheDir, newCacheFile);
      expect(result1.success).toBe(true);
      expect(result1.stats.successCount).toBe(1);

      // Second migration should skip
      const result2 = runMigration(testCacheDir, newCacheFile);
      expect(result2.success).toBe(true);
      expect(result2.stats.successCount).toBe(0);
    });

    it('should handle empty cache directory', () => {
      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.totalFiles).toBe(0);
    });

    it('should handle non-existent cache directory', () => {
      const nonExistentDir = path.join(os.tmpdir(), `nonexistent-${Date.now()}`);
      const result = runMigration(nonExistentDir, newCacheFile);

      expect(result.success).toBe(true);
      expect(result.stats.totalFiles).toBe(0);
    });
  });

  describe('shouldRunMigration', () => {
    it('should return true when old cache exists and migration not complete', () => {
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      expect(shouldRunMigration(testCacheDir)).toBe(true);
    });

    it('should return false when migration is already complete', () => {
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      // Run migration
      runMigration(testCacheDir, newCacheFile);

      // Should not run again
      expect(shouldRunMigration(testCacheDir)).toBe(false);
    });

    it('should return false when no old cache exists', () => {
      expect(shouldRunMigration(testCacheDir)).toBe(false);
    });
  });

  describe('migration marker', () => {
    it('should create migration marker file', () => {
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      runMigration(testCacheDir, newCacheFile);

      const markerPath = path.join(testCacheDir, '.cache-migrated');
      expect(fs.existsSync(markerPath)).toBe(true);
    });

    it('should include stats in migration marker', () => {
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      runMigration(testCacheDir, newCacheFile);

      const markerPath = path.join(testCacheDir, '.cache-migrated');
      const markerContent = fs.readFileSync(markerPath, 'utf-8');
      const marker = JSON.parse(markerContent);

      expect(marker.version).toBe('4-to-7');
      expect(marker.stats).toBeDefined();
      expect(marker.timestamp).toBeDefined();
    });
  });

  describe('concurrency protection', () => {
    it('should prevent concurrent migrations', () => {
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      // Create a lock file manually to simulate another process
      const lockFile = path.join(testCacheDir, '.migration.lock');
      fs.writeFileSync(lockFile, process.pid.toString());

      const result = runMigration(testCacheDir, newCacheFile);

      // Should skip due to lock
      expect(result.success).toBe(true);
      expect(result.stats.totalFiles).toBe(0);

      // Clean up lock file
      fs.unlinkSync(lockFile);
    });

    it('should handle stale lock files', () => {
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      // Create a lock file with a non-existent PID
      const lockFile = path.join(testCacheDir, '.migration.lock');
      fs.writeFileSync(lockFile, '999999'); // Very unlikely PID

      const result = runMigration(testCacheDir, newCacheFile);

      // Should proceed after removing stale lock
      expect(result.success).toBe(true);
      expect(result.stats.successCount).toBe(1);
    });
  });

  describe('marker validation', () => {
    it('should detect incomplete migration state', () => {
      // Create old cache
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: (Date.now() + 60000).toString(),
        key: 'test:key',
        val: 'value',
      });

      // Create marker but not the new cache file (simulating incomplete migration)
      const markerPath = path.join(testCacheDir, '.cache-migrated');
      fs.writeFileSync(
        markerPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          stats: { totalFiles: 1, successCount: 1, failureCount: 0, skippedExpired: 0, errors: [] },
          version: '4-to-7',
        }),
      );

      // Should detect inconsistent state and retry
      expect(shouldRunMigration(testCacheDir, newCacheFile)).toBe(true);

      // Marker should be removed
      expect(fs.existsSync(markerPath)).toBe(false);
    });
  });

  describe('atomic writes', () => {
    it('should create temporary file during write', () => {
      const futureTime = Date.now() + 60000;
      createOldCacheEntry('diskstore-abc', 'test.json', {
        expireTime: futureTime.toString(),
        key: 'test:key',
        val: 'value',
      });

      const result = runMigration(testCacheDir, newCacheFile);

      expect(result.success).toBe(true);

      // Should not leave any .tmp files after successful write
      const tmpFiles = fs.readdirSync(testCacheDir).filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles.length).toBe(0);

      // Final cache file should exist
      expect(fs.existsSync(newCacheFile)).toBe(true);
    });
  });
});
