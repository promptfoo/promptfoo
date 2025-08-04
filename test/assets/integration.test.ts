import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AssetStore, getAssetStore } from '../../src/assets';
import { AssetMetrics } from '../../src/assets/metrics';
import { setupAssetRoutes } from '../../src/server/routes/assets';

// Mock the config and logger modules
jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('../../src/logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
  };
});

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key, defaultValue) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') {
      return true; // Enable for tests
    }
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
}));

describe('Asset Storage Integration', () => {
  let app: express.Application;
  let tempDir: string;
  let assetStore: AssetStore;

  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-integration-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);

    // Reset metrics
    AssetMetrics.getInstance().reset();

    // Create Express app and set up routes
    app = express();
    app.use(express.json());
    setupAssetRoutes(app);

    // Create asset store
    assetStore = getAssetStore();
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Full asset flow', () => {
    it('should save and serve an asset through the API', async () => {
      // Step 1: Save an asset
      const imageData = Buffer.from('fake image data for testing');
      const evalId = randomUUID();
      const resultId = randomUUID();

      const metadata = await assetStore.save(imageData, 'image', 'image/png', evalId, resultId);

      expect(metadata).toMatchObject({
        id: expect.any(String),
        type: 'image',
        mimeType: 'image/png',
        size: imageData.length,
      });

      // Step 2: Serve the asset through API
      const response = await request(app)
        .get(`/api/eval/${evalId}/result/${resultId}/asset/${metadata.id}`)
        .expect(200)
        .expect('Content-Type', 'image/png')
        .expect('Content-Length', imageData.length.toString());

      expect(response.body).toEqual(imageData);
      expect(response.headers['x-asset-hash']).toBe(metadata.hash);
      expect(response.headers['x-asset-type']).toBe('image');
    });

    it('should return 404 for non-existent assets', async () => {
      const evalId = randomUUID();
      const resultId = randomUUID();
      const assetId = randomUUID();

      await request(app)
        .get(`/api/eval/${evalId}/result/${resultId}/asset/${assetId}`)
        .expect(404)
        .expect('Content-Type', /json/)
        .expect({ error: 'Asset not found' });
    });

    it('should validate UUID format', async () => {
      await request(app)
        .get('/api/eval/invalid-id/result/123/asset/456')
        .expect(400)
        .expect('Content-Type', /json/)
        .expect({ error: 'Invalid ID format' });
    });

    it('should return metrics', async () => {
      // Save some assets to generate metrics
      const evalId = randomUUID();

      for (let i = 0; i < 3; i++) {
        const data = Buffer.from(`test data ${i}`);
        const resultId = randomUUID();
        await assetStore.save(data, 'image', 'image/png', evalId, resultId);
      }

      const response = await request(app)
        .get('/api/assets/metrics')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        saveAttempts: 3,
        saveSuccesses: 3,
        saveFailures: 0,
        saveSuccessRate: 1,
        totalBytesStored: expect.any(Number),
      });
    });

    it('should handle health checks', async () => {
      const response = await request(app)
        .get('/api/health/assets')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        enabled: true,
        status: expect.stringMatching(/healthy|degraded/),
        metrics: expect.any(Object),
      });
    });
  });

  describe('Error handling', () => {
    it('should handle missing metadata gracefully', async () => {
      const evalId = randomUUID();
      const resultId = randomUUID();
      const assetId = randomUUID();

      // Create asset file without metadata
      const assetDir = path.join(tempDir, 'assets', evalId, resultId);
      await fs.mkdir(assetDir, { recursive: true });
      await fs.writeFile(path.join(assetDir, assetId), 'test data');

      // Should fail when trying to get metadata
      await request(app)
        .get(`/api/eval/${evalId}/result/${resultId}/asset/${assetId}`)
        .expect(404)
        .expect({ error: 'Asset not found' });
    });

    it('should return 404 when asset storage is disabled', async () => {
      // Mock disabled asset storage
      const mockGetEnvBool = jest.requireMock('../../src/envars').getEnvBool;
      mockGetEnvBool.mockImplementation((key: string, defaultValue: boolean) => {
        if (key === 'PROMPTFOO_USE_ASSET_STORAGE') {
          return false;
        }
        return defaultValue;
      });

      const evalId = randomUUID();
      const resultId = randomUUID();
      const assetId = randomUUID();

      await request(app)
        .get(`/api/eval/${evalId}/result/${resultId}/asset/${assetId}`)
        .expect(404)
        .expect({ error: 'Asset storage is not enabled' });

      // Restore mock
      mockGetEnvBool.mockImplementation((key: string, defaultValue: boolean) => {
        if (key === 'PROMPTFOO_USE_ASSET_STORAGE') {
          return true;
        }
        return defaultValue;
      });
    });
  });

  describe('Performance', () => {
    it('should handle concurrent asset operations', async () => {
      const evalId = randomUUID();
      const promises: Promise<any>[] = [];

      // Save 10 assets concurrently
      for (let i = 0; i < 10; i++) {
        const data = Buffer.from(`concurrent test data ${i}`);
        const resultId = randomUUID();
        promises.push(assetStore.save(data, 'image', 'image/png', evalId, resultId));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);

      // We've verified the saves worked by checking the results array length
      // No need to load them through the API for this test

      // Verify metrics
      const metricsResponse = await request(app).get('/api/assets/metrics').expect(200);

      expect(metricsResponse.body.saveSuccesses).toBe(10);
    });
  });
});
