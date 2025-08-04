import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AssetStore } from '../../src/assets';
import { AssetDeduplicator } from '../../src/assets/dedup';

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key, defaultValue) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') {
      return true;
    }
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') {
      return true;
    }
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
}));

describe('Asset Deduplication', () => {
  let tempDir: string;
  let assetStore: AssetStore;
  
  const mockGetConfigDirectoryPath = jest.requireMock('../../src/util/config/manage').getConfigDirectoryPath;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-dedup-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    
    assetStore = new AssetStore();
    
    // Give deduplicator time to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Deduplication behavior', () => {
    it('should detect and deduplicate identical assets', async () => {
      const data = Buffer.from('identical content for deduplication test');
      
      // Save the same content twice
      const metadata1 = await assetStore.save(data, 'image', 'image/png', 'eval1', 'result1');
      const metadata2 = await assetStore.save(data, 'image', 'image/png', 'eval2', 'result2');
      
      // Both should have the same hash
      expect(metadata1.hash).toBe(metadata2.hash);
      
      // Second metadata should indicate it's deduplicated
      expect(metadata2.dedupedFrom).toBe(`eval1/result1/${metadata1.id}`);
      
      // First asset file should exist
      const asset1Path = path.join(tempDir, 'assets', 'eval1', 'result1', metadata1.id);
      await expect(fs.access(asset1Path)).resolves.not.toThrow();
      
      // Second asset file should NOT exist (only metadata)
      const asset2Path = path.join(tempDir, 'assets', 'eval2', 'result2', metadata2.id);
      await expect(fs.access(asset2Path)).rejects.toThrow();
      
      // But second metadata should exist
      const meta2Path = path.join(tempDir, 'assets', 'eval2', 'result2', `${metadata2.id}.json`);
      await expect(fs.access(meta2Path)).resolves.not.toThrow();
    });

    it('should load deduplicated assets correctly', async () => {
      const data = Buffer.from('content to load after deduplication');
      
      // Save twice to trigger deduplication
      const metadata1 = await assetStore.save(data, 'image', 'image/png', 'eval1', 'result1');
      const metadata2 = await assetStore.save(data, 'image', 'image/png', 'eval2', 'result2');
      
      // Load both assets
      const loaded1 = await assetStore.load('eval1', 'result1', metadata1.id);
      const loaded2 = await assetStore.load('eval2', 'result2', metadata2.id);
      
      // Both should return the same content
      expect(loaded1).toEqual(data);
      expect(loaded2).toEqual(data);
      expect(loaded1).toEqual(loaded2);
    });

    it('should not deduplicate different content', async () => {
      const data1 = Buffer.from('first unique content');
      const data2 = Buffer.from('second unique content');
      
      const metadata1 = await assetStore.save(data1, 'image', 'image/png', 'eval1', 'result1');
      const metadata2 = await assetStore.save(data2, 'image', 'image/png', 'eval2', 'result2');
      
      // Different hashes
      expect(metadata1.hash).not.toBe(metadata2.hash);
      
      // No deduplication
      expect(metadata2.dedupedFrom).toBeUndefined();
      
      // Both files should exist
      const asset1Path = path.join(tempDir, 'assets', 'eval1', 'result1', metadata1.id);
      const asset2Path = path.join(tempDir, 'assets', 'eval2', 'result2', metadata2.id);
      await expect(fs.access(asset1Path)).resolves.not.toThrow();
      await expect(fs.access(asset2Path)).resolves.not.toThrow();
    });

    it('should handle multiple levels of deduplication', async () => {
      const data = Buffer.from('content for multiple dedup');
      
      // Save the same content three times
      const metadata1 = await assetStore.save(data, 'image', 'image/png', 'eval1', 'result1');
      const metadata2 = await assetStore.save(data, 'image', 'image/png', 'eval2', 'result2');
      const metadata3 = await assetStore.save(data, 'image', 'image/png', 'eval3', 'result3');
      
      // All should reference the first one
      expect(metadata2.dedupedFrom).toBe(`eval1/result1/${metadata1.id}`);
      expect(metadata3.dedupedFrom).toBe(`eval1/result1/${metadata1.id}`);
      
      // All should load correctly
      const loaded1 = await assetStore.load('eval1', 'result1', metadata1.id);
      const loaded2 = await assetStore.load('eval2', 'result2', metadata2.id);
      const loaded3 = await assetStore.load('eval3', 'result3', metadata3.id);
      
      expect(loaded1).toEqual(data);
      expect(loaded2).toEqual(data);
      expect(loaded3).toEqual(data);
    });
  });

  describe('Deduplication stats', () => {
    it('should calculate deduplication savings', async () => {
      const data1 = Buffer.from('a'.repeat(1000)); // 1KB
      const data2 = Buffer.from('b'.repeat(2000)); // 2KB
      
      // Save data1 three times (2KB saved)
      await assetStore.save(data1, 'image', 'image/png', 'eval1', 'result1');
      await assetStore.save(data1, 'image', 'image/png', 'eval2', 'result2');
      await assetStore.save(data1, 'image', 'image/png', 'eval3', 'result3');
      
      // Save data2 twice (2KB saved)
      await assetStore.save(data2, 'audio', 'audio/wav', 'eval4', 'result4');
      await assetStore.save(data2, 'audio', 'audio/wav', 'eval5', 'result5');
      
      const stats = await assetStore.getDedupStats();
      
      expect(stats.enabled).toBe(true);
      expect(stats.totalAssets).toBe(5);
      expect(stats.uniqueAssets).toBe(2);
      expect(stats.duplicateBytes).toBe(4000); // 2KB + 2KB
    });
  });

  describe('Deduplication index', () => {
    it('should persist deduplication index across instances', async () => {
      const data = Buffer.from('persistent data');
      
      // Save with first instance
      const metadata = await assetStore.save(data, 'image', 'image/png', 'eval1', 'result1');
      
      // Create new instance
      const assetStore2 = new AssetStore();
      await new Promise(resolve => setTimeout(resolve, 100)); // Let it initialize
      
      // Save same data with new instance
      const metadata2 = await assetStore2.save(data, 'image', 'image/png', 'eval2', 'result2');
      
      // Should be deduplicated
      expect(metadata2.dedupedFrom).toBe(`eval1/result1/${metadata.id}`);
    });

    it('should rebuild index when requested', async () => {
      const data1 = Buffer.from('data for rebuild 1');
      const data2 = Buffer.from('data for rebuild 2');
      
      // Save some assets
      await assetStore.save(data1, 'image', 'image/png', 'eval1', 'result1');
      await assetStore.save(data2, 'image', 'image/png', 'eval2', 'result2');
      await assetStore.save(data1, 'image', 'image/png', 'eval3', 'result3'); // Duplicate
      
      // Delete the index file
      const indexPath = path.join(tempDir, 'assets', '.dedupe-index.json');
      await fs.unlink(indexPath).catch(() => {});
      
      // Rebuild index
      await assetStore.rebuildDedupIndex();
      
      // Check stats to verify rebuild worked
      const stats = await assetStore.getDedupStats();
      expect(stats.totalAssets).toBe(3);
      expect(stats.uniqueAssets).toBe(2);
    });
  });
});

describe('AssetDeduplicator', () => {
  let tempDir: string;
  let deduplicator: AssetDeduplicator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-dedup-unit-test-'));
    deduplicator = new AssetDeduplicator(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should handle missing index file gracefully', async () => {
    await expect(deduplicator.initialize()).resolves.not.toThrow();
  });

  it('should save and load index', async () => {
    await deduplicator.initialize();
    
    await deduplicator.addEntry({
      hash: 'testhash123',
      evalId: 'eval1',
      resultId: 'result1',
      assetId: 'asset1',
      size: 1000,
      type: 'image',
      mimeType: 'image/png',
    });
    
    await deduplicator.save();
    
    // Create new instance and load
    const dedup2 = new AssetDeduplicator(tempDir);
    await dedup2.initialize();
    
    const found = await dedup2.findExisting('testhash123');
    expect(found).toMatchObject({
      hash: 'testhash123',
      evalId: 'eval1',
      resultId: 'result1',
      assetId: 'asset1',
    });
  });
});