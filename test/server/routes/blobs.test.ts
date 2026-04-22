import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies
vi.mock('../../../src/blobs/extractor');
vi.mock('../../../src/blobs');
vi.mock('../../../src/database');

// Import after mocking
import { getBlobByHash, getBlobUrl } from '../../../src/blobs';
import { isBlobStorageEnabled } from '../../../src/blobs/extractor';
import { getDb } from '../../../src/database';

const mockedIsBlobStorageEnabled = vi.mocked(isBlobStorageEnabled);
const mockedGetBlobUrl = vi.mocked(getBlobUrl);
const mockedGetBlobByHash = vi.mocked(getBlobByHash);
const mockedGetDb = vi.mocked(getDb);

describe('Blobs Routes', () => {
  describe('GET /api/blobs/:hash', () => {
    let app: ReturnType<typeof createApp>;
    const validHash = 'a'.repeat(64);

    // Create chainable mock DB that returns assetResult on first .get() and referenceResult on second
    function createMockDb(assetResult?: any, referenceResult?: any) {
      let callCount = 0;
      return {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockImplementation(() => {
          callCount++;
          return callCount === 1 ? assetResult : referenceResult;
        }),
      } as any;
    }

    function setupDbWithAssetAndReference(
      asset: Record<string, unknown>,
      reference: Record<string, unknown> = { evalId: 'eval-123' },
    ) {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      const mockDb = createMockDb(asset, reference);
      mockedGetDb.mockReturnValue(mockDb);
    }

    function createBlobResponse(mimeType: string, sizeBytes: number) {
      return {
        data: Buffer.alloc(sizeBytes),
        metadata: {
          mimeType,
          sizeBytes,
          createdAt: new Date().toISOString(),
          provider: 'local',
          key: validHash,
        },
      };
    }

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return 404 when blob storage is disabled', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(false);

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blob storage disabled' });
    });

    it.each([
      ['too short', 'abc123'],
      ['invalid characters', 'g'.repeat(64)],
      ['too long', 'a'.repeat(65)],
    ])('should return 400 for invalid hash (%s)', async (_label, hash) => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const response = await request(app).get(`/api/blobs/${hash}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 when blob asset not found in DB', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      mockedGetDb.mockReturnValue(createMockDb(undefined));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blob not found' });
    });

    it('should return 403 when no reference exists', async () => {
      const mockAsset = {
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 'local',
      };
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      mockedGetDb.mockReturnValue(createMockDb(mockAsset, undefined));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Not authorized to access this blob' });
    });

    it('should redirect 302 when presigned URL is available', async () => {
      setupDbWithAssetAndReference({
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 's3',
      });

      const presignedUrl = 'https://s3.amazonaws.com/bucket/blob?signature=xyz';
      mockedGetBlobUrl.mockResolvedValue(presignedUrl);

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(302);
      expect(response.header.location).toBe(presignedUrl);
      expect(mockedGetBlobUrl).toHaveBeenCalledWith(validHash);
      expect(mockedGetBlobByHash).not.toHaveBeenCalled();
    });

    it('should serve blob data directly when no presigned URL', async () => {
      setupDbWithAssetAndReference({
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 'local',
      });

      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockResolvedValue(createBlobResponse('image/png', 1024));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('image/png');
      expect(response.header['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.header['accept-ranges']).toBe('none');
      // Content-Length may be absent if response is gzipped (Express uses transfer-encoding: chunked)
      expect(
        response.header['content-length'] === '1024' ||
          response.header['transfer-encoding'] === 'chunked',
      ).toBe(true);
      expect(mockedGetBlobByHash).toHaveBeenCalledWith(validHash);
    });

    it('should use fallback MIME type for invalid MIME types', async () => {
      setupDbWithAssetAndReference(
        { hash: validHash, mimeType: 'audio/wav.html', sizeBytes: 2048, provider: 'local' },
        { evalId: 'eval-456' },
      );

      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockResolvedValue(createBlobResponse('audio/wav.html', 2048));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('application/octet-stream');
      expect(response.header['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.header['accept-ranges']).toBe('none');
    });

    it('should use blob metadata MIME type when available', async () => {
      setupDbWithAssetAndReference(
        { hash: validHash, mimeType: 'image/png', sizeBytes: 1024, provider: 'local' },
        { evalId: 'eval-789' },
      );

      mockedGetBlobUrl.mockResolvedValue(null);
      // Blob metadata has different MIME type and size than the asset record
      mockedGetBlobByHash.mockResolvedValue(createBlobResponse('image/jpeg', 2048));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(200);
      expect(response.header['content-type']).toBe('image/jpeg');
      expect(response.header['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.header['accept-ranges']).toBe('none');
      // Content-Length may be absent if response is gzipped
      expect(
        response.header['content-length'] === '2048' ||
          response.header['transfer-encoding'] === 'chunked',
      ).toBe(true);
    });

    it('should return 404 when getBlobByHash throws error', async () => {
      setupDbWithAssetAndReference(
        { hash: validHash, mimeType: 'text/plain', sizeBytes: 512, provider: 'local' },
        { evalId: 'eval-error' },
      );

      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockRejectedValue(new Error('File system error'));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blob not found' });
    });
  });

  describe('GET /api/blobs/library', () => {
    let app: ReturnType<typeof createApp>;

    /**
     * Create a mock DB for library queries.
     * The /library route executes 3 chained queries:
     * 1. COUNT query via .get() → { count: number }
     * 2. uniqueHashes query via .all() → [{ hash: string }]
     * 3. items detail query via .all() → full item rows
     *
     * We track calls to .get() and .all() to return the right data.
     */
    function createLibraryMockDb(
      countResult: { count: number },
      uniqueHashes: Array<{ hash: string }>,
      items: any[],
    ) {
      let getAllCallCount = 0;
      return {
        select: vi.fn().mockReturnThis(),
        selectDistinct: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        get: vi.fn().mockReturnValue(countResult),
        all: vi.fn().mockImplementation(() => {
          getAllCallCount++;
          // First .all() call: uniqueHashes query
          // Second .all() call: items detail query
          return getAllCallCount === 1 ? uniqueHashes : items;
        }),
      } as any;
    }

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return empty list with blobStorageEnabled=false when blob storage is disabled', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(false);

      const response = await request(app).get('/api/blobs/library');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { items: [], total: 0, hasMore: false, blobStorageEnabled: false },
      });
    });

    it('should return 400 for invalid query parameters', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const response = await request(app).get('/api/blobs/library?limit=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid query parameters',
      });
    });

    it('should return 400 for invalid type filter', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const response = await request(app).get('/api/blobs/library?type=invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid query parameters',
      });
    });

    it('should return empty list when no items match', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      const mockDb = createLibraryMockDb({ count: 0 }, [], []);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data.hasMore).toBe(false);
    });

    it('should return items with correct response shape (list mode)', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const hash1 = 'a'.repeat(64);
      const items = [
        {
          hash: hash1,
          mimeType: 'image/png',
          sizeBytes: 1024,
          createdAt: '2025-01-01 00:00:00',
          evalId: 'eval-1',
          testIdx: 0,
          promptIdx: 0,
          location: 'response',
          kind: 'image',
          evalDescription: 'Test eval',
          provider: { id: 'openai:gpt-4', label: 'GPT-4' },
          success: true,
          score: 0.9,
        },
      ];

      const mockDb = createLibraryMockDb({ count: 1 }, [{ hash: hash1 }], items);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.hasMore).toBe(false);

      const item = response.body.data.items[0];
      expect(item.hash).toBe(hash1);
      expect(item.mimeType).toBe('image/png');
      expect(item.sizeBytes).toBe(1024);
      expect(item.kind).toBe('image');
      expect(item.url).toBe(`/api/blobs/${hash1}`);
      expect(item.context.evalId).toBe('eval-1');
      expect(item.context.evalDescription).toBe('Test eval');
      expect(item.context.provider).toBe('GPT-4');
      expect(item.context.pass).toBe(true);
      expect(item.context.score).toBe(0.9);
      // Detail-only fields should NOT be in list responses
      expect(item.context.prompt).toBeUndefined();
      expect(item.context.variables).toBeUndefined();
      expect(item.context.graderResults).toBeUndefined();
      expect(item.context.latencyMs).toBeUndefined();
      expect(item.context.cost).toBeUndefined();
    });

    it('should return detail fields when hash filter is provided', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const hash1 = 'a'.repeat(64);
      const items = [
        {
          hash: hash1,
          mimeType: 'image/png',
          sizeBytes: 1024,
          createdAt: '2025-01-01 00:00:00',
          evalId: 'eval-1',
          testIdx: 0,
          promptIdx: 0,
          location: 'response',
          kind: 'image',
          evalDescription: 'Test eval',
          provider: { id: 'openai:gpt-4', label: 'GPT-4' },
          prompt: { raw: 'Generate an image' },
          success: true,
          score: 0.9,
          gradingResult: null,
          testCase: { vars: { prompt: 'test' } },
          latencyMs: 500,
          cost: 0.01,
        },
      ];

      const mockDb = createLibraryMockDb({ count: 1 }, [{ hash: hash1 }], items);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get(`/api/blobs/library?hash=${hash1}`);

      expect(response.status).toBe(200);
      const item = response.body.data.items[0];
      expect(item.context.prompt).toBe('Generate an image');
      expect(item.context.variables).toEqual({ prompt: 'test' });
      expect(item.context.latencyMs).toBe(500);
      expect(item.context.cost).toBe(0.01);
    });

    it('should handle string provider format (legacy)', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const hash1 = 'b'.repeat(64);
      const items = [
        {
          hash: hash1,
          mimeType: 'audio/wav',
          sizeBytes: 2048,
          createdAt: 1700000000,
          evalId: 'eval-2',
          testIdx: 0,
          promptIdx: 0,
          location: null,
          kind: null,
          evalDescription: null,
          provider: 'openai:tts-1',
          prompt: null,
          success: null,
          score: null,
          gradingResult: null,
          testCase: null,
          latencyMs: null,
          cost: null,
        },
      ];

      const mockDb = createLibraryMockDb({ count: 1 }, [{ hash: hash1 }], items);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library');

      expect(response.status).toBe(200);
      const item = response.body.data.items[0];
      expect(item.context.provider).toBe('openai:tts-1');
      // Kind should be derived from mimeType when not set in reference
      expect(item.kind).toBe('audio');
    });

    it('should indicate hasMore when more items exist beyond the page', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const hash1 = 'c'.repeat(64);
      const items = [
        {
          hash: hash1,
          mimeType: 'image/jpeg',
          sizeBytes: 512,
          createdAt: '2025-06-01 12:00:00',
          evalId: 'eval-3',
          testIdx: 0,
          promptIdx: 0,
          location: null,
          kind: 'image',
          evalDescription: null,
          provider: null,
          prompt: null,
          success: null,
          score: null,
          gradingResult: null,
          testCase: null,
          latencyMs: null,
          cost: null,
        },
      ];

      // Total is 5 but only 1 returned (limit=1, offset=0)
      const mockDb = createLibraryMockDb({ count: 5 }, [{ hash: hash1 }], items);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library?limit=1');

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(5);
      expect(response.body.data.hasMore).toBe(true);
      expect(response.body.data.items).toHaveLength(1);
    });

    it('should accept valid filter parameters', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      const mockDb = createLibraryMockDb({ count: 0 }, [], []);
      mockedGetDb.mockReturnValue(mockDb);

      // Type filter
      const res1 = await request(app).get('/api/blobs/library?type=image');
      expect(res1.status).toBe(200);

      // Sort parameters
      const res2 = await request(app).get('/api/blobs/library?sortField=sizeBytes&sortOrder=asc');
      expect(res2.status).toBe(200);

      // Eval filter
      const res3 = await request(app).get('/api/blobs/library?evalId=some-eval-id');
      expect(res3.status).toBe(200);

      // Hash filter (deep link)
      const hash = 'd'.repeat(64);
      const res4 = await request(app).get(`/api/blobs/library?hash=${hash}`);
      expect(res4.status).toBe(200);
    });

    it('should handle grading results in detail response', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const hash1 = 'e'.repeat(64);
      const items = [
        {
          hash: hash1,
          mimeType: 'image/png',
          sizeBytes: 1024,
          createdAt: '2025-01-01 00:00:00',
          evalId: 'eval-grading',
          testIdx: 0,
          promptIdx: 0,
          location: null,
          kind: 'image',
          evalDescription: null,
          provider: null,
          prompt: null,
          success: true,
          score: 0.75,
          gradingResult: {
            componentResults: [
              { pass: true, score: 1.0, reason: 'Looks good', assertion: { type: 'human' } },
              { pass: false, score: 0.5, reason: 'Low quality' },
            ],
          },
          testCase: null,
          latencyMs: null,
          cost: null,
        },
      ];

      const mockDb = createLibraryMockDb({ count: 1 }, [{ hash: hash1 }], items);
      mockedGetDb.mockReturnValue(mockDb);

      // Use hash filter to trigger detail mode
      const response = await request(app).get(`/api/blobs/library?hash=${hash1}`);

      expect(response.status).toBe(200);
      const item = response.body.data.items[0];
      expect(item.context.graderResults).toHaveLength(2);
      expect(item.context.graderResults[0]).toEqual({
        name: 'human',
        pass: true,
        score: 1.0,
        reason: 'Looks good',
      });
      expect(item.context.graderResults[1]).toEqual({
        name: 'Grader 2',
        pass: false,
        score: 0.5,
        reason: 'Low quality',
      });
    });

    it('should return 500 on database error', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      mockedGetDb.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app).get('/api/blobs/library');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/blobs/library/evals', () => {
    let app: ReturnType<typeof createApp>;

    function createEvalsMockDb(evals: any[]) {
      return {
        selectDistinct: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        all: vi.fn().mockReturnValue(evals),
      } as any;
    }

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should return empty array when blob storage is disabled', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(false);

      const response = await request(app).get('/api/blobs/library/evals');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [] });
    });

    it('should return 400 for invalid query parameters', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const response = await request(app).get('/api/blobs/library/evals?limit=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid query parameters',
      });
    });

    it('should return evals with correct shape', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const mockEvals = [
        {
          evalId: 'eval-abc-123',
          description: 'Image generation test',
          createdAt: '2025-06-15 10:30:00',
        },
        {
          evalId: 'eval-def-456',
          description: null,
          createdAt: 1700000000,
        },
      ];

      const mockDb = createEvalsMockDb(mockEvals);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library/evals');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);

      // First eval with description
      expect(response.body.data[0].evalId).toBe('eval-abc-123');
      expect(response.body.data[0].description).toBe('Image generation test');
      expect(response.body.data[0].createdAt).toBeDefined();

      // Second eval falls back to truncated ID
      expect(response.body.data[1].evalId).toBe('eval-def-456');
      expect(response.body.data[1].description).toBe('Eval eval-def');
    });

    it('should respect custom limit parameter', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      const mockDb = createEvalsMockDb([]);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library/evals?limit=5');

      expect(response.status).toBe(200);
      expect(mockDb.limit).toHaveBeenCalledWith(5);
    });

    it('should return 500 on database error', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      mockedGetDb.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app).get('/api/blobs/library/evals');

      expect(response.status).toBe(500);
    });

    it('should pass search query to where clause', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      const mockDb = createEvalsMockDb([]);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library/evals?search=test');

      expect(response.status).toBe(200);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should not add where clause when search is empty', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);
      const mockDb = createEvalsMockDb([]);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get('/api/blobs/library/evals');

      expect(response.status).toBe(200);
      // where is called with undefined (no conditions)
      expect(mockDb.where).toHaveBeenCalledWith(undefined);
    });

    it('should reject search strings exceeding max length', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const longSearch = 'a'.repeat(201);
      const response = await request(app).get(`/api/blobs/library/evals?search=${longSearch}`);

      expect(response.status).toBe(400);
    });
  });
});
