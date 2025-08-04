import * as path from 'path';
import * as os from 'os';

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string, defaultValue: boolean) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return true;
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
}));

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import * as fs from 'fs/promises';
import { AssetStore } from '../../src/assets';
import { FileLock } from '../../src/util/lock';

describe('Asset Storage Concurrent Write Protection', () => {
  let tempDir: string;
  let assetStore: AssetStore;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-concurrent-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    assetStore = new AssetStore({ baseDir: path.join(tempDir, 'assets') });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Concurrent writes with same content', () => {
    it('should handle multiple concurrent writes of the same asset', async () => {
      const imageData = Buffer.from('test image data');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      // Start multiple concurrent saves
      const saves = await Promise.all([
        assetStore.save(imageData, 'image', 'image/png', evalId, resultId),
        assetStore.save(imageData, 'image', 'image/png', evalId, resultId),
        assetStore.save(imageData, 'image', 'image/png', evalId, resultId),
        assetStore.save(imageData, 'image', 'image/png', evalId, resultId),
        assetStore.save(imageData, 'image', 'image/png', evalId, resultId),
      ]);

      // All saves should succeed
      expect(saves).toHaveLength(5);
      
      // They should all have the same hash
      const hashes = saves.map(s => s.hash);
      expect(new Set(hashes).size).toBe(1);

      // At least some should be deduplicated
      const dedupedCount = saves.filter(s => s.dedupedFrom).length;
      expect(dedupedCount).toBeGreaterThan(0);

      // Only one actual file should exist
      const assetDir = path.join(tempDir, 'assets', evalId, resultId);
      const files = await fs.readdir(assetDir);
      const dataFiles = files.filter(f => !f.endsWith('.json'));
      expect(dataFiles).toHaveLength(1);
    });

    it('should handle concurrent writes with different content', async () => {
      const evalId = 'eval-789';
      const resultId = 'result-012';

      // Create different data for each save
      const saves = await Promise.all([
        assetStore.save(Buffer.from('image 1'), 'image', 'image/png', evalId, resultId),
        assetStore.save(Buffer.from('image 2'), 'image', 'image/png', evalId, resultId),
        assetStore.save(Buffer.from('image 3'), 'image', 'image/png', evalId, resultId),
      ]);

      // All saves should succeed
      expect(saves).toHaveLength(3);
      
      // They should all have different hashes
      const hashes = saves.map(s => s.hash);
      expect(new Set(hashes).size).toBe(3);

      // None should be deduplicated
      const dedupedCount = saves.filter(s => s.dedupedFrom).length;
      expect(dedupedCount).toBe(0);

      // Three actual files should exist
      const assetDir = path.join(tempDir, 'assets', evalId, resultId);
      const files = await fs.readdir(assetDir);
      const dataFiles = files.filter(f => !f.endsWith('.json'));
      expect(dataFiles).toHaveLength(3);
    });
  });

  describe('File locking', () => {
    it('should properly acquire and release locks', async () => {
      const lockDir = path.join(tempDir, 'assets', '.locks');
      const lock = new FileLock(path.join(tempDir, 'assets'));
      
      // Acquire a lock
      const unlock = await lock.acquire('test-lock');
      
      // Lock file should exist
      const lockFiles = await fs.readdir(lockDir);
      expect(lockFiles).toContain('test-lock.lock');
      
      // Release the lock
      await unlock();
      
      // Lock file should be removed
      const lockFilesAfter = await fs.readdir(lockDir);
      expect(lockFilesAfter).not.toContain('test-lock.lock');
    });

    it('should wait for lock to be released', async () => {
      const lock = new FileLock(path.join(tempDir, 'assets'));
      
      // Acquire a lock
      const unlock1 = await lock.acquire('test-lock');
      
      // Try to acquire the same lock
      let secondLockAcquired = false;
      const secondLockPromise = lock.acquire('test-lock', { retries: 5, retryDelay: 50 }).then(unlock => {
        secondLockAcquired = true;
        return unlock;
      });
      
      // Give it some time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Second lock should not be acquired yet
      expect(secondLockAcquired).toBe(false);
      
      // Release first lock
      await unlock1();
      
      // Now second lock should be acquired
      const unlock2 = await secondLockPromise;
      expect(secondLockAcquired).toBe(true);
      
      // Clean up
      await unlock2();
    });

    it('should clean up stale locks', async () => {
      const lockDir = path.join(tempDir, 'assets', '.locks');
      const lock = new FileLock(path.join(tempDir, 'assets'), 100); // 100ms stale timeout
      
      // Create a stale lock manually
      await fs.mkdir(lockDir, { recursive: true });
      const staleLockData = {
        id: 'stale-lock',
        pid: 99999,
        timestamp: Date.now() - 1000, // 1 second old
      };
      await fs.writeFile(
        path.join(lockDir, 'stale-lock.lock'),
        JSON.stringify(staleLockData)
      );
      
      // Clean up stale locks
      await lock.cleanup();
      
      // Stale lock should be removed
      const lockFiles = await fs.readdir(lockDir);
      expect(lockFiles).not.toContain('stale-lock.lock');
    });
  });

  describe('Error handling', () => {
    it('should handle errors during save operations', async () => {
      const evalId = 'eval-error';
      const resultId = 'result-error';
      
      // Create a store with a base directory that we'll make read-only
      const readOnlyDir = path.join(tempDir, 'readonly');
      await fs.mkdir(readOnlyDir, { recursive: true });
      
      // Create the target directory and make it read-only
      const targetDir = path.join(readOnlyDir, evalId, resultId);
      await fs.mkdir(targetDir, { recursive: true });
      
      // Write a file without write permissions
      const blockingFile = path.join(targetDir, 'blocking.txt');
      await fs.writeFile(blockingFile, 'block');
      await fs.chmod(targetDir, 0o555); // read + execute only
      
      // Create a new store instance
      const restrictedStore = new AssetStore({ 
        baseDir: readOnlyDir,
        enableMetrics: false 
      });
      
      // Try to save, should fail due to permissions
      await expect(
        restrictedStore.save(Buffer.from('test'), 'image', 'image/png', evalId, resultId)
      ).rejects.toThrow();
      
      // Restore permissions for cleanup
      await fs.chmod(targetDir, 0o755);
    });
  });
});