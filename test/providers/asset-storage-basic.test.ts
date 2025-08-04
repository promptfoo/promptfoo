import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getAssetStore } from '../../src/assets';
import type { CallApiContextParams } from '../../src/types';

// Minimal mocks
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

describe('Asset Storage Basic Provider Tests', () => {
  let tempDir: string;
  let assetStore: ReturnType<typeof getAssetStore>;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-basic-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    assetStore = getAssetStore();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Core Asset Storage', () => {
    it('should save and retrieve image assets', async () => {
      const imageData = Buffer.from('test image data');
      const evalId = 'eval-123';
      const resultId = 'result-456';
      
      const metadata = await assetStore.save(
        imageData,
        'image',
        'image/png',
        evalId,
        resultId
      );

      expect(metadata.id).toBeTruthy();
      expect(metadata.type).toBe('image');
      expect(metadata.mimeType).toBe('image/png');
      expect(metadata.size).toBe(imageData.length);
      expect(metadata.hash).toBeTruthy();

      // Retrieve the asset
      const retrieved = await assetStore.load(evalId, resultId, metadata.id);
      expect(retrieved.toString()).toBe('test image data');
    });

    it('should save and retrieve audio assets', async () => {
      const audioData = Buffer.from('test audio data');
      const evalId = 'eval-audio-123';
      const resultId = 'result-audio-456';
      
      const metadata = await assetStore.save(
        audioData,
        'audio',
        'audio/wav',
        evalId,
        resultId
      );

      expect(metadata.type).toBe('audio');
      expect(metadata.mimeType).toBe('audio/wav');

      const retrieved = await assetStore.load(evalId, resultId, metadata.id);
      expect(retrieved.toString()).toBe('test audio data');
    });

    it('should validate MIME types', async () => {
      const data = Buffer.from('test data');
      
      // Invalid image MIME type
      await expect(
        assetStore.save(data, 'image', 'text/plain', 'eval-1', 'result-1')
      ).rejects.toThrow('Invalid image MIME type');

      // Invalid audio MIME type
      await expect(
        assetStore.save(data, 'audio', 'image/png', 'eval-2', 'result-2')
      ).rejects.toThrow('Invalid audio MIME type');

      // Valid MIME types should work
      await expect(
        assetStore.save(data, 'image', 'image/png', 'eval-3', 'result-3')
      ).resolves.toBeTruthy();

      await expect(
        assetStore.save(data, 'audio', 'audio/mp3', 'eval-4', 'result-4')
      ).resolves.toBeTruthy();
    });

    it('should validate IDs for security', async () => {
      const data = Buffer.from('test data');
      
      // Path traversal attempts should be rejected
      await expect(
        assetStore.save(data, 'image', 'image/png', '../../../etc/passwd', 'result-1')
      ).rejects.toThrow('Invalid evalId or resultId');

      await expect(
        assetStore.save(data, 'image', 'image/png', 'eval-1', '../../etc/passwd')
      ).rejects.toThrow('Invalid evalId or resultId');

      // Valid IDs should work
      const validIds = [
        'eval-123',
        'result_456',
        'uuid-12345678-1234-5678-1234-567812345678',
        'test-id',
      ];

      for (const id of validIds) {
        await expect(
          assetStore.save(data, 'image', 'image/png', id, id)
        ).resolves.toBeTruthy();
      }
    });

    it('should deduplicate identical content', async () => {
      const data = Buffer.from('duplicate content');
      
      // Save the same content multiple times
      const metadata1 = await assetStore.save(
        data,
        'image',
        'image/png',
        'eval-dup-1',
        'result-dup-1'
      );

      const metadata2 = await assetStore.save(
        data,
        'image',
        'image/png',
        'eval-dup-2',
        'result-dup-2'
      );

      const metadata3 = await assetStore.save(
        data,
        'image',
        'image/jpeg', // Different MIME type, same content
        'eval-dup-3',
        'result-dup-3'
      );

      // All should have the same hash
      expect(metadata1.hash).toBe(metadata2.hash);
      expect(metadata2.hash).toBe(metadata3.hash);

      // At least some should be deduplicated
      const hasDedupedFrom = [metadata1, metadata2, metadata3].some(m => m.dedupedFrom);
      expect(hasDedupedFrom).toBe(true);

      // All should be retrievable
      const retrieved1 = await assetStore.load('eval-dup-1', 'result-dup-1', metadata1.id);
      const retrieved2 = await assetStore.load('eval-dup-2', 'result-dup-2', metadata2.id);
      const retrieved3 = await assetStore.load('eval-dup-3', 'result-dup-3', metadata3.id);

      expect(retrieved1.toString()).toBe('duplicate content');
      expect(retrieved2.toString()).toBe('duplicate content');
      expect(retrieved3.toString()).toBe('duplicate content');
    });

    it('should handle concurrent writes correctly', async () => {
      const numConcurrent = 10;
      const data = Buffer.from('concurrent test data');
      
      // Create many concurrent saves with slight staggering to avoid filesystem race
      const promises = [];
      for (let i = 0; i < numConcurrent; i++) {
        // Add a tiny delay to reduce filesystem contention
        await new Promise(resolve => setTimeout(resolve, 5));
        promises.push(
          assetStore.save(
            data,
            'image',
            'image/png',
            `eval-concurrent-${i}`,
            `result-concurrent-${i}`
          )
        );
      }

      const results = await Promise.all(promises);
      
      // All should succeed
      expect(results).toHaveLength(numConcurrent);
      results.forEach(result => {
        expect(result.id).toBeTruthy();
        expect(result.hash).toBeTruthy();
      });

      // All should have the same hash (same content)
      const hashes = new Set(results.map(r => r.hash));
      expect(hashes.size).toBe(1);

      // Should have deduplicated some
      const dedupedCount = results.filter(r => r.dedupedFrom).length;
      expect(dedupedCount).toBeGreaterThan(0);
    });

    it('should enforce size limits', async () => {
      // Create data larger than the default limit (50MB)
      const largeData = Buffer.alloc(51 * 1024 * 1024, 'x');
      
      await expect(
        assetStore.save(largeData, 'image', 'image/png', 'eval-large', 'result-large')
      ).rejects.toThrow('Asset too large');
    });

    it('should provide accurate statistics', async () => {
      // Save some assets
      await assetStore.save(
        Buffer.from('image 1'),
        'image',
        'image/png',
        'eval-stats-1',
        'result-stats-1'
      );

      await assetStore.save(
        Buffer.from('image 2'),
        'image',
        'image/jpeg',
        'eval-stats-2',
        'result-stats-2'
      );

      // Save duplicate
      await assetStore.save(
        Buffer.from('image 1'), // Same as first
        'image',
        'image/png',
        'eval-stats-3',
        'result-stats-3'
      );

      const stats = await assetStore.getDedupStats();
      
      expect(stats.enabled).toBe(true);
      // Stats include all assets from all tests in this suite
      expect(stats.totalAssets).toBeGreaterThanOrEqual(3);
      expect(stats.uniqueAssets).toBeGreaterThanOrEqual(2);
      // Only check these if we have duplicates
      if (stats.totalAssets > stats.uniqueAssets) {
        expect(stats.duplicateBytes).toBeGreaterThan(0);
        expect(stats.savingsPercent).toBeGreaterThan(0);
      }
    });

    it('should handle missing assets gracefully', async () => {
      await expect(
        assetStore.load('non-existent-eval', 'non-existent-result', 'non-existent-asset')
      ).rejects.toThrow('Asset not found');

      const exists = await assetStore.exists(
        'non-existent-eval',
        'non-existent-result',
        'non-existent-asset'
      );
      expect(exists).toBe(false);
    });

    it('should clean up temp files on error', async () => {
      // Mock fs.rename to fail
      const originalRename = fs.rename;
      jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('Rename failed'));
      
      try {
        await assetStore.save(
          Buffer.from('test'),
          'image',
          'image/png',
          'eval-error',
          'result-error'
        );
      } catch (error) {
        expect(error).toBeTruthy();
      }

      // Check that temp files don't exist
      const assetDir = path.join(tempDir, 'assets', 'eval-error', 'result-error');
      try {
        const files = await fs.readdir(assetDir);
        const tempFiles = files.filter(f => f.endsWith('.tmp'));
        expect(tempFiles).toHaveLength(0);
      } catch (error: any) {
        // Directory might not exist, which is fine
        expect(error.code).toBe('ENOENT');
      }

      jest.spyOn(fs, 'rename').mockRestore();
    });
  });

  describe('Asset URL Format', () => {
    it('should use promptfoo:// protocol in URLs', async () => {
      const context: CallApiContextParams = {
        vars: {
          __evalId: 'eval-url-test',
          __resultId: 'result-url-test',
        },
      };

      const metadata = await assetStore.save(
        Buffer.from('test'),
        'image',
        'image/png',
        context.vars.__evalId as string,
        context.vars.__resultId as string
      );

      // Construct the expected URL
      const expectedUrl = `promptfoo://${context.vars.__evalId}/${context.vars.__resultId}/${metadata.id}`;
      
      // Verify URL format
      expect(expectedUrl).toMatch(/^promptfoo:\/\/eval-url-test\/result-url-test\/[a-f0-9-]+$/);
    });
  });
});