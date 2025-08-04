import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { reverseAssetMigration, getAssetUsageStats } from '../../src/migrate/reverseAssets';
import { getAssetStore } from '../../src/assets';

// Mock dependencies
jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return false; // Disabled for reverse migration
    return false;
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

// Mock database
const mockDb = {
  select: jest.fn(),
  update: jest.fn(),
  insert: jest.fn(),
};

jest.mock('../../src/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

// Mock asset store
const mockAssetStore = {
  load: jest.fn(),
  getMetadata: jest.fn(),
  save: jest.fn(),
};

jest.mock('../../src/assets', () => ({
  getAssetStore: jest.fn(() => mockAssetStore),
  isAssetStorageEnabled: jest.fn(() => false),
}));

describe('Reverse Asset Migration', () => {
  let tempDir: string;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-reverse-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          get: jest.fn(),
          all: jest.fn().mockReturnValue([]),
        }),
        all: jest.fn().mockReturnValue([]),
      }),
    });
    
    mockDb.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          run: jest.fn(),
        }),
      }),
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('reverseAssetMigration', () => {
    it('should convert asset URLs back to base64', async () => {
      const evalId = 'test-eval';
      const resultId = 'test-result';
      const assetId = 'test-asset';
      
      // Mock evaluation
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue({
              id: evalId,
              results: {},
            }),
          }),
        }),
      });
      
      // Mock results with asset URL
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: resultId,
                evalId,
                response: JSON.stringify({
                  output: `Check out this image: ![test](promptfoo://${evalId}/${resultId}/${assetId})`,
                }),
              },
            ]),
          }),
        }),
      });
      
      // Mock asset loading
      const testImageData = Buffer.from('test image data');
      mockAssetStore.load.mockResolvedValue(testImageData);
      mockAssetStore.getMetadata.mockResolvedValue({
        id: assetId,
        type: 'image',
        mimeType: 'image/png',
        size: testImageData.length,
      });
      
      // Run migration
      const result = await reverseAssetMigration({ evalId });
      
      expect(result.evaluationsProcessed).toBe(1);
      expect(result.resultsProcessed).toBe(1);
      expect(result.assetsConverted).toBe(1);
      expect(result.errors).toHaveLength(0);
      
      // Check that asset was loaded
      expect(mockAssetStore.load).toHaveBeenCalledWith(evalId, resultId, assetId);
      
      // Check that result was updated with base64
      const updateCall = mockDb.update.mock.calls[0];
      expect(updateCall).toBeTruthy();
      
      const setCall = mockDb.update.mock.results[0].value.set.mock.calls[0];
      const updatedResponse = JSON.parse(setCall[0].response);
      expect(updatedResponse.output).toContain('data:image/png;base64,');
      expect(updatedResponse.output).toContain(testImageData.toString('base64'));
    });

    it('should handle multiple assets in one result', async () => {
      const evalId = 'test-eval-multi';
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue({
              id: evalId,
              results: {},
            }),
          }),
        }),
      });
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: 'result-1',
                evalId,
                response: JSON.stringify({
                  output: `Image: ![img](promptfoo://${evalId}/result-1/asset-1) and Audio: [audio](promptfoo://${evalId}/result-1/asset-2)`,
                }),
              },
            ]),
          }),
        }),
      });
      
      // Mock different asset types
      mockAssetStore.load
        .mockResolvedValueOnce(Buffer.from('image data'))
        .mockResolvedValueOnce(Buffer.from('audio data'));
      
      mockAssetStore.getMetadata
        .mockResolvedValueOnce({ id: 'asset-1', type: 'image', mimeType: 'image/png', size: 10 })
        .mockResolvedValueOnce({ id: 'asset-2', type: 'audio', mimeType: 'audio/wav', size: 10 });
      
      const result = await reverseAssetMigration({ evalId });
      
      expect(result.assetsConverted).toBe(2);
      expect(mockAssetStore.load).toHaveBeenCalledTimes(2);
    });

    it('should handle dry run mode', async () => {
      const evalId = 'test-eval-dry';
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue({
              id: evalId,
              results: {},
            }),
          }),
        }),
      });
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: 'result-1',
                evalId,
                response: JSON.stringify({
                  output: `Asset: ![test](promptfoo://${evalId}/result-1/asset-1)`,
                }),
              },
            ]),
          }),
        }),
      });
      
      mockAssetStore.load.mockResolvedValue(Buffer.from('test data'));
      mockAssetStore.getMetadata.mockResolvedValue({
        id: 'asset-1',
        type: 'image',
        mimeType: 'image/png',
        size: 9,
      });
      
      const result = await reverseAssetMigration({ evalId, dryRun: true });
      
      expect(result.assetsConverted).toBe(1);
      // Should not update database in dry run
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should handle missing assets gracefully', async () => {
      const evalId = 'test-eval-missing';
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue({
              id: evalId,
              results: {},
            }),
          }),
        }),
      });
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: 'result-1',
                evalId,
                response: JSON.stringify({
                  output: `Missing asset: ![test](promptfoo://${evalId}/result-1/missing-asset)`,
                }),
              },
            ]),
          }),
        }),
      });
      
      mockAssetStore.load.mockRejectedValue(new Error('Asset not found'));
      
      const result = await reverseAssetMigration({ evalId });
      
      expect(result.resultsProcessed).toBe(1);
      expect(result.assetsConverted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Asset not found');
    });

    it('should throw error if asset storage is enabled without force', async () => {
      const mockIsAssetStorageEnabled = jest.requireMock('../../src/assets').isAssetStorageEnabled;
      mockIsAssetStorageEnabled.mockReturnValue(true);
      
      await expect(reverseAssetMigration({})).rejects.toThrow(
        'Asset storage is currently enabled'
      );
      
      // Should work with force flag
      mockIsAssetStorageEnabled.mockReturnValue(true);
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          all: jest.fn().mockReturnValue([]),
        }),
      });
      
      const result = await reverseAssetMigration({ force: true });
      expect(result.evaluationsProcessed).toBe(0);
    });
  });

  describe('getAssetUsageStats', () => {
    it('should calculate asset usage statistics', async () => {
      // Mock evaluations
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          all: jest.fn().mockReturnValue([
            { id: 'eval-1', results: {} },
            { id: 'eval-2', results: {} },
          ]),
        }),
      });
      
      // Mock results for eval-1
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: 'result-1',
                response: JSON.stringify({
                  output: 'Asset: ![img](promptfoo://eval-1/result-1/asset-1)',
                }),
              },
              {
                id: 'result-2',
                response: JSON.stringify({
                  output: 'No assets here',
                }),
              },
            ]),
          }),
        }),
      });
      
      // Mock results for eval-2
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: 'result-3',
                response: JSON.stringify({
                  output: 'Two assets: ![img1](promptfoo://eval-2/result-3/asset-2) ![img2](promptfoo://eval-2/result-3/asset-3)',
                }),
              },
            ]),
          }),
        }),
      });
      
      // Mock asset metadata
      mockAssetStore.getMetadata
        .mockResolvedValueOnce({ size: 1000 }) // asset-1
        .mockResolvedValueOnce({ size: 2000 }) // asset-2
        .mockResolvedValueOnce({ size: 3000 }); // asset-3
      
      const stats = await getAssetUsageStats();
      
      expect(stats.totalAssetUrls).toBe(3);
      expect(stats.evaluationsWithAssets).toBe(2);
      expect(stats.resultsWithAssets).toBe(2);
      // Base64 increases size by ~33%
      expect(stats.estimatedSizeIncrease).toBeGreaterThan(6000);
    });

    it('should handle specific evaluation', async () => {
      const evalId = 'test-eval-stats';
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue({
              id: evalId,
              results: {},
            }),
          }),
        }),
      });
      
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockReturnValue([
              {
                id: 'result-1',
                response: JSON.stringify({
                  output: 'Asset: ![img](promptfoo://test-eval-stats/result-1/asset-1)',
                }),
              },
            ]),
          }),
        }),
      });
      
      mockAssetStore.getMetadata.mockResolvedValue({ size: 1000 });
      
      const stats = await getAssetUsageStats(evalId);
      
      expect(stats.totalAssetUrls).toBe(1);
      expect(stats.evaluationsWithAssets).toBe(1);
      expect(stats.resultsWithAssets).toBe(1);
    });
  });
});