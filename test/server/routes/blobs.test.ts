import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    const validHash = 'a'.repeat(64); // Valid 64-character hex hash

    // Create chainable mock DB
    const createMockDb = (assetResult?: any, referenceResult?: any) => {
      const mockGet = vi.fn();

      // First call returns asset, second returns reference
      let callCount = 0;
      mockGet.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? assetResult : referenceResult;
      });

      return {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        get: mockGet,
      } as any;
    };

    beforeEach(() => {
      vi.clearAllMocks();
      app = createApp();
    });

    it('should return 404 when blob storage is disabled', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(false);

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blob storage disabled' });
    });

    it('should return 400 for invalid hash (too short)', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const response = await request(app).get('/api/blobs/abc123');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('hash');
    });

    it('should return 400 for invalid hash (invalid characters)', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const invalidHash = 'g'.repeat(64); // 'g' is not a valid hex character

      const response = await request(app).get(`/api/blobs/${invalidHash}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid hash (too long)', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const tooLongHash = 'a'.repeat(65);

      const response = await request(app).get(`/api/blobs/${tooLongHash}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 when blob asset not found in DB', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      // Mock DB to return undefined for asset
      const mockDb = createMockDb(undefined);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blob not found' });
    });

    it('should return 403 when no reference exists', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      // Mock asset exists but no reference
      const mockAsset = {
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 'local',
      };

      const mockDb = createMockDb(mockAsset, undefined);
      mockedGetDb.mockReturnValue(mockDb);

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Not authorized to access this blob' });
    });

    it('should redirect 302 when presigned URL is available', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const mockAsset = {
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 's3',
      };

      const mockReference = {
        evalId: 'eval-123',
      };

      const mockDb = createMockDb(mockAsset, mockReference);
      mockedGetDb.mockReturnValue(mockDb);

      const presignedUrl = 'https://s3.amazonaws.com/bucket/blob?signature=xyz';
      mockedGetBlobUrl.mockResolvedValue(presignedUrl);

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(302);
      expect(response.header.location).toBe(presignedUrl);
      expect(mockedGetBlobUrl).toHaveBeenCalledWith(validHash);
      expect(mockedGetBlobByHash).not.toHaveBeenCalled();
    });

    it('should serve blob data directly when no presigned URL', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const mockAsset = {
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 'local',
      };

      const mockReference = {
        evalId: 'eval-123',
      };

      const mockDb = createMockDb(mockAsset, mockReference);
      mockedGetDb.mockReturnValue(mockDb);

      const blobData = Buffer.alloc(1024); // Create buffer of exact size
      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockResolvedValue({
        data: blobData,
        metadata: {
          mimeType: 'image/png',
          sizeBytes: 1024,
          createdAt: new Date().toISOString(),
          provider: 'local',
          key: validHash,
        },
      });

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
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const mockAsset = {
        hash: validHash,
        mimeType: 'audio/wav.html', // Invalid: contains period
        sizeBytes: 2048,
        provider: 'local',
      };

      const mockReference = {
        evalId: 'eval-456',
      };

      const mockDb = createMockDb(mockAsset, mockReference);
      mockedGetDb.mockReturnValue(mockDb);

      const blobData = Buffer.alloc(2048); // Create buffer of exact size
      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockResolvedValue({
        data: blobData,
        metadata: {
          mimeType: 'audio/wav.html',
          sizeBytes: 2048,
          createdAt: new Date().toISOString(),
          provider: 'local',
          key: validHash,
        },
      });

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(200);
      // Should use fallback MIME type
      expect(response.header['content-type']).toBe('application/octet-stream');
      expect(response.header['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.header['accept-ranges']).toBe('none');
    });

    it('should use blob metadata MIME type when available', async () => {
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const mockAsset = {
        hash: validHash,
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 'local',
      };

      const mockReference = {
        evalId: 'eval-789',
      };

      const mockDb = createMockDb(mockAsset, mockReference);
      mockedGetDb.mockReturnValue(mockDb);

      const blobData = Buffer.alloc(2048); // Create buffer of exact size
      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockResolvedValue({
        data: blobData,
        metadata: {
          mimeType: 'image/jpeg', // Different from asset MIME type
          sizeBytes: 2048, // Different from asset size
          createdAt: new Date().toISOString(),
          provider: 'local',
          key: validHash,
        },
      });

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(200);
      // Should prefer blob metadata MIME type over asset MIME type
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
      mockedIsBlobStorageEnabled.mockReturnValue(true);

      const mockAsset = {
        hash: validHash,
        mimeType: 'text/plain',
        sizeBytes: 512,
        provider: 'local',
      };

      const mockReference = {
        evalId: 'eval-error',
      };

      const mockDb = createMockDb(mockAsset, mockReference);
      mockedGetDb.mockReturnValue(mockDb);

      mockedGetBlobUrl.mockResolvedValue(null);
      mockedGetBlobByHash.mockRejectedValue(new Error('File system error'));

      const response = await request(app).get(`/api/blobs/${validHash}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blob not found' });
    });
  });
});
