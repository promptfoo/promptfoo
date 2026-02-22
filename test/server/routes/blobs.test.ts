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
});
