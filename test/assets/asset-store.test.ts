import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AssetStore } from '../../src/assets';

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string, defaultValue: boolean) => {
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return true;
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
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

describe('AssetStore', () => {
  let tempDir: string;
  let assetStore: AssetStore;
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-asset-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    assetStore = new AssetStore();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('should save an asset successfully', async () => {
      const data = Buffer.from('test image data');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      const metadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);

      expect(metadata).toMatchObject({
        type: 'image',
        mimeType: 'image/png',
        size: data.length,
      });
      expect(metadata.id).toBeTruthy();
      expect(metadata.hash).toBeTruthy();

      // Verify files were created
      const assetPath = path.join(tempDir, 'assets', evalId, resultId, metadata.id);
      const metaPath = `${assetPath}.json`;

      await expect(fs.access(assetPath)).resolves.not.toThrow();
      await expect(fs.access(metaPath)).resolves.not.toThrow();
    });

    it('should reject assets that are too large', async () => {
      const smallStore = new AssetStore({ maxFileSize: 10 });
      const data = Buffer.from('this is too large for the limit');

      await expect(
        smallStore.save(data, 'image', 'image/png', 'eval-123', 'result-456'),
      ).rejects.toThrow('Asset too large');
    });

    it('should reject invalid evalId', async () => {
      const data = Buffer.from('test');

      await expect(
        assetStore.save(data, 'image', 'image/png', '../../../etc/passwd', 'result-456'),
      ).rejects.toThrow('Invalid evalId or resultId format');
    });

    it('should reject invalid resultId', async () => {
      const data = Buffer.from('test');

      await expect(
        assetStore.save(data, 'image', 'image/png', 'eval-123', '../../etc/passwd'),
      ).rejects.toThrow('Invalid evalId or resultId format');
    });

    it('should handle concurrent saves without corruption', async () => {
      const data1 = Buffer.from('test data 1');
      const data2 = Buffer.from('test data 2');
      const evalId = 'eval-concurrent';
      const resultId = 'result-concurrent';

      // Save concurrently
      const [metadata1, metadata2] = await Promise.all([
        assetStore.save(data1, 'image', 'image/png', evalId, resultId),
        assetStore.save(data2, 'audio', 'audio/wav', evalId, resultId),
      ]);

      // Both should succeed with different IDs
      expect(metadata1.id).not.toBe(metadata2.id);

      // Verify both can be loaded
      const loaded1 = await assetStore.load(evalId, resultId, metadata1.id);
      const loaded2 = await assetStore.load(evalId, resultId, metadata2.id);

      expect(loaded1.toString()).toBe('test data 1');
      expect(loaded2.toString()).toBe('test data 2');
    });
  });

  describe('load', () => {
    it('should load a saved asset', async () => {
      const data = Buffer.from('test data');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      const metadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      const loaded = await assetStore.load(evalId, resultId, metadata.id);

      expect(loaded.toString()).toBe('test data');
    });

    it('should reject invalid IDs', async () => {
      await expect(
        assetStore.load('../../../etc', 'passwd', 'root'),
      ).rejects.toThrow('Invalid ID format');
    });

    it('should throw for non-existent asset', async () => {
      await expect(
        assetStore.load('eval-123', 'result-456', 'non-existent-id'),
      ).rejects.toThrow('Asset metadata not found');
    });
  });

  describe('deduplication', () => {
    it('should deduplicate identical assets', async () => {
      const data = Buffer.from('duplicate data');
      const evalId1 = 'eval-001';
      const resultId1 = 'result-001';
      const evalId2 = 'eval-002';
      const resultId2 = 'result-002';

      // Save first asset
      const metadata1 = await assetStore.save(data, 'image', 'image/png', evalId1, resultId1);

      // Save identical asset
      const metadata2 = await assetStore.save(data, 'image', 'image/png', evalId2, resultId2);

      // Should have same hash
      expect(metadata2.hash).toBe(metadata1.hash);

      // Second should be deduplicated
      expect(metadata2.dedupedFrom).toBe(`${evalId1}/${resultId1}/${metadata1.id}`);

      // Should only have one actual file
      const assetPath1 = path.join(tempDir, 'assets', evalId1, resultId1, metadata1.id);
      const assetPath2 = path.join(tempDir, 'assets', evalId2, resultId2, metadata2.id);

      await expect(fs.access(assetPath1)).resolves.not.toThrow();
      await expect(fs.access(assetPath2)).rejects.toThrow(); // Should not exist

      // But loading should work for both
      const loaded1 = await assetStore.load(evalId1, resultId1, metadata1.id);
      const loaded2 = await assetStore.load(evalId2, resultId2, metadata2.id);

      expect(loaded1.toString()).toBe('duplicate data');
      expect(loaded2.toString()).toBe('duplicate data');
    });

    it('should not deduplicate different assets', async () => {
      const data1 = Buffer.from('unique data 1');
      const data2 = Buffer.from('unique data 2');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      const metadata1 = await assetStore.save(data1, 'image', 'image/png', evalId, resultId);
      const metadata2 = await assetStore.save(data2, 'image', 'image/png', evalId, resultId);

      // Different hashes
      expect(metadata2.hash).not.toBe(metadata1.hash);
      
      // Not deduplicated
      expect(metadata2.dedupedFrom).toBeUndefined();

      // Both files should exist
      const assetPath1 = path.join(tempDir, 'assets', evalId, resultId, metadata1.id);
      const assetPath2 = path.join(tempDir, 'assets', evalId, resultId, metadata2.id);

      await expect(fs.access(assetPath1)).resolves.not.toThrow();
      await expect(fs.access(assetPath2)).resolves.not.toThrow();
    });

    it('should handle deduplication initialization race condition', async () => {
      // Create a new store and immediately save
      const newStore = new AssetStore();
      const data = Buffer.from('test data');

      // This should wait for initialization
      const metadata = await newStore.save(data, 'image', 'image/png', 'eval-123', 'result-456');

      expect(metadata).toBeTruthy();
      expect(metadata.id).toBeTruthy();
    });
  });

  describe('getMetadata', () => {
    it('should retrieve metadata for saved asset', async () => {
      const data = Buffer.from('test data');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      const savedMetadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      const retrievedMetadata = await assetStore.getMetadata(evalId, resultId, savedMetadata.id);

      expect(retrievedMetadata).toEqual(savedMetadata);
    });

    it('should retrieve metadata for deduplicated asset', async () => {
      const data = Buffer.from('duplicate data');
      const evalId1 = 'eval-001';
      const resultId1 = 'result-001';
      const evalId2 = 'eval-002';
      const resultId2 = 'result-002';

      await assetStore.save(data, 'image', 'image/png', evalId1, resultId1);
      const metadata2 = await assetStore.save(data, 'image', 'image/png', evalId2, resultId2);

      const retrieved = await assetStore.getMetadata(evalId2, resultId2, metadata2.id);
      expect(retrieved.dedupedFrom).toBeTruthy();
    });
  });

  describe('exists', () => {
    it('should return true for existing asset', async () => {
      const data = Buffer.from('test data');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      const metadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      const exists = await assetStore.exists(evalId, resultId, metadata.id);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent asset', async () => {
      const exists = await assetStore.exists('eval-123', 'result-456', 'non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should clean up temp files on write error', async () => {
      const data = Buffer.from('test data');
      const evalId = 'eval-123';
      const resultId = 'result-456';

      // Mock fs.rename to fail
      const originalRename = fs.rename;
      (fs as any).rename = jest.fn().mockRejectedValue(new Error('Rename failed'));

      try {
        await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      } catch (error) {
        // Expected to fail
      }

      // Restore
      (fs as any).rename = originalRename;

      // Check that temp files don't exist
      const files = await fs.readdir(path.join(tempDir, 'assets', evalId, resultId));
      const tempFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should handle corrupted metadata gracefully', async () => {
      const evalId = 'eval-123';
      const resultId = 'result-456';
      const assetId = 'corrupted-meta';

      // Create corrupted metadata
      const dir = path.join(tempDir, 'assets', evalId, resultId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${assetId}.json`), 'invalid json{');

      await expect(
        assetStore.getMetadata(evalId, resultId, assetId),
      ).rejects.toThrow();
    });
  });

  describe('security', () => {
    it('should prevent path traversal in evalId', async () => {
      const data = Buffer.from('test');
      const maliciousIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'eval/../../../etc',
        'eval%2F..%2F..%2Fetc',
      ];

      for (const id of maliciousIds) {
        await expect(
          assetStore.save(data, 'image', 'image/png', id, 'result-456'),
        ).rejects.toThrow('Invalid evalId or resultId format');
      }
    });

    it('should prevent path traversal in load', async () => {
      await expect(
        assetStore.load('eval/../../etc', 'passwd', 'root'),
      ).rejects.toThrow('Invalid ID format');
    });
  });
});