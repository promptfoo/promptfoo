import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

import { AssetStore } from '../../src/assets';
import { AssetMetrics } from '../../src/assets/metrics';

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

describe('AssetStore', () => {
  let tempDir: string;
  let assetStore: AssetStore;
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-asset-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);

    // Reset metrics
    AssetMetrics.getInstance().reset();

    // Create new AssetStore instance with test directory
    assetStore = new AssetStore({
      baseDir: path.join(tempDir, 'assets'),
      maxFileSize: 1024 * 1024, // 1MB for testing
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('should save asset and metadata correctly', async () => {
      const data = Buffer.from('test image data');
      const evalId = randomUUID();
      const resultId = randomUUID();

      const metadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);

      expect(metadata).toMatchObject({
        id: expect.any(String),
        type: 'image',
        mimeType: 'image/png',
        size: data.length,
        hash: expect.any(String),
        createdAt: expect.any(Number),
      });

      // Check that files were created
      const assetPath = path.join(tempDir, 'assets', evalId, resultId, metadata.id);
      const metaPath = `${assetPath}.json`;

      await expect(fs.access(assetPath)).resolves.toBeUndefined();
      await expect(fs.access(metaPath)).resolves.toBeUndefined();

      // Verify file content
      const savedData = await fs.readFile(assetPath);
      expect(savedData).toEqual(data);

      // Verify metadata content
      const savedMeta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
      expect(savedMeta).toEqual(metadata);
    });

    it('should reject files that are too large', async () => {
      const data = Buffer.alloc(2 * 1024 * 1024); // 2MB
      const evalId = randomUUID();
      const resultId = randomUUID();

      await expect(assetStore.save(data, 'image', 'image/png', evalId, resultId)).rejects.toThrow(
        'Asset too large',
      );
    });

    it('should reject invalid IDs', async () => {
      const data = Buffer.from('test data');

      await expect(
        assetStore.save(data, 'image', 'image/png', '../evil', 'resultId'),
      ).rejects.toThrow('Invalid evalId or resultId format');

      await expect(
        assetStore.save(data, 'image', 'image/png', 'evalId', '../../etc/passwd'),
      ).rejects.toThrow('Invalid evalId or resultId format');
    });

    it('should handle concurrent saves correctly', async () => {
      const promises = [];
      const evalId = randomUUID();

      // Create 10 concurrent saves
      for (let i = 0; i < 10; i++) {
        const data = Buffer.from(`test data ${i}`);
        const resultId = randomUUID();
        promises.push(assetStore.save(data, 'image', 'image/png', evalId, resultId));
      }

      const results = await Promise.all(promises);

      // All saves should succeed
      expect(results).toHaveLength(10);
      results.forEach((metadata) => {
        expect(metadata.id).toBeTruthy();
      });
    });
  });

  describe('load', () => {
    it('should load saved assets correctly', async () => {
      const data = Buffer.from('test image data');
      const evalId = randomUUID();
      const resultId = randomUUID();

      const metadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      const loadedData = await assetStore.load(evalId, resultId, metadata.id);

      expect(loadedData).toEqual(data);
    });

    it('should throw error for non-existent assets', async () => {
      const evalId = randomUUID();
      const resultId = randomUUID();
      const assetId = randomUUID();

      await expect(assetStore.load(evalId, resultId, assetId)).rejects.toThrow('Asset metadata not found');
    });

    it('should prevent path traversal attacks', async () => {
      await expect(assetStore.load('../../../etc', 'passwd', 'evil')).rejects.toThrow(
        'Invalid ID format',
      );

      await expect(assetStore.load('eval', 'result', '../../../etc/passwd')).rejects.toThrow(
        'Invalid ID format',
      );
    });
  });

  describe('getMetadata', () => {
    it('should retrieve metadata correctly', async () => {
      const data = Buffer.from('test data');
      const evalId = randomUUID();
      const resultId = randomUUID();

      const savedMetadata = await assetStore.save(data, 'audio', 'audio/mp3', evalId, resultId);
      const retrievedMetadata = await assetStore.getMetadata(evalId, resultId, savedMetadata.id);

      expect(retrievedMetadata).toEqual(savedMetadata);
    });

    it('should throw error for non-existent metadata', async () => {
      const evalId = randomUUID();
      const resultId = randomUUID();
      const assetId = randomUUID();

      await expect(assetStore.getMetadata(evalId, resultId, assetId)).rejects.toThrow(
        'Asset metadata not found',
      );
    });
  });

  describe('exists', () => {
    it('should return true for existing assets', async () => {
      const data = Buffer.from('test data');
      const evalId = randomUUID();
      const resultId = randomUUID();

      const metadata = await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      const exists = await assetStore.exists(evalId, resultId, metadata.id);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent assets', async () => {
      const evalId = randomUUID();
      const resultId = randomUUID();
      const assetId = randomUUID();

      const exists = await assetStore.exists(evalId, resultId, assetId);

      expect(exists).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should validate file size limit', async () => {
      // Test with custom smaller limit
      const smallLimitStore = new AssetStore({
        baseDir: path.join(tempDir, 'assets'),
        maxFileSize: 10, // 10 bytes
      });

      const data = Buffer.from('this is more than 10 bytes');
      const evalId = randomUUID();
      const resultId = randomUUID();

      await expect(
        smallLimitStore.save(data, 'image', 'image/png', evalId, resultId),
      ).rejects.toThrow('Asset too large');
    });

    it('should generate consistent hashes for same data', async () => {
      const data = Buffer.from('test data');
      const evalId1 = randomUUID();
      const evalId2 = randomUUID();
      const resultId1 = randomUUID();
      const resultId2 = randomUUID();

      const metadata1 = await assetStore.save(data, 'image', 'image/png', evalId1, resultId1);
      const metadata2 = await assetStore.save(data, 'image', 'image/png', evalId2, resultId2);

      // Same data should produce same hash
      expect(metadata1.hash).toBe(metadata2.hash);
      // But different IDs
      expect(metadata1.id).not.toBe(metadata2.id);
    });
  });
});
