import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

import type { MediaStorageProvider } from '../../../src/storage/types';

// Mock dependencies
vi.mock('../../../src/storage');

// Import after mocking
import { getMediaStorage, mediaExists, retrieveMedia } from '../../../src/storage';

const mockedGetMediaStorage = vi.mocked(getMediaStorage);
const mockedMediaExists = vi.mocked(mediaExists);
const mockedRetrieveMedia = vi.mocked(retrieveMedia);

describe('Media Routes', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/media/stats', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
    });

    it('should return success with providerId when storage has no stats', async () => {
      const mockStorage = {
        providerId: 'local-fs',
      } as MediaStorageProvider;

      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(app).get('/api/media/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          providerId: 'local-fs',
        },
      });
    });

    it('should return success with providerId and stats when storage has getStats', async () => {
      const mockStorage = {
        providerId: 'local-fs',
        getStats: vi.fn().mockResolvedValue({
          totalFiles: 42,
          totalSize: 1024000,
        }),
      } as unknown as MediaStorageProvider;

      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(app).get('/api/media/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          providerId: 'local-fs',
          totalFiles: 42,
          totalSize: 1024000,
        },
      });
    });

    it('should return 500 when getMediaStorage throws error', async () => {
      mockedGetMediaStorage.mockImplementation(() => {
        throw new Error('Storage initialization failed');
      });

      const response = await request(app).get('/api/media/stats');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get storage stats',
      });
    });
  });

  describe('GET /api/media/info/:type/:filename', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
    });

    it('should return 400 for invalid type', async () => {
      const response = await request(app).get('/api/media/info/document/abcdef123456.pdf');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('type');
    });

    it('should return 400 when path segments resolve to invalid type and filename', async () => {
      // Express resolves ../../ before routing, so params become { type: 'etc', filename: 'passwd' }
      const response = await request(app).get('/api/media/info/audio/../../etc/passwd');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 400 for filename without hex prefix', async () => {
      const response = await request(app).get('/api/media/info/audio/malicious.mp3');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 400 for filename with wrong hex length', async () => {
      const response = await request(app).get('/api/media/info/audio/abc123.mp3');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 404 when media file does not exist', async () => {
      mockedMediaExists.mockResolvedValue(false);

      const response = await request(app).get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Media not found',
      });
      expect(mockedMediaExists).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it('should return info when media file exists', async () => {
      const mockStorage = {
        providerId: 'local-fs',
        getUrl: vi.fn().mockResolvedValue('/media/audio/abcdef123456.mp3'),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(app).get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          key: 'audio/abcdef123456.mp3',
          exists: true,
          url: '/media/audio/abcdef123456.mp3',
        },
      });
      expect(mockedMediaExists).toHaveBeenCalledWith('audio/abcdef123456.mp3');
      expect(mockStorage.getUrl).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it.each(['video', 'image'] as const)('should accept valid %s type', async (type) => {
      const ext = type === 'video' ? 'mp4' : 'png';
      const mockStorage = {
        providerId: 'local-fs',
        getUrl: vi.fn().mockResolvedValue(`/media/${type}/abcdef123456.${ext}`),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(app).get(`/api/media/info/${type}/abcdef123456.${ext}`);

      expect(response.status).toBe(200);
      expect(response.body.data.key).toBe(`${type}/abcdef123456.${ext}`);
    });

    it('should return 500 when mediaExists throws error', async () => {
      mockedMediaExists.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get media info',
      });
    });
  });

  describe('GET /api/media/:type/:filename', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.resetAllMocks();
      app = createApp();
    });

    it('should return 400 for invalid type', async () => {
      const response = await request(app).get('/api/media/text/abcdef123456.txt');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('type');
    });

    it('should return 400 for invalid filename', async () => {
      // Filename must be exactly 12 hex characters + extension
      const response = await request(app).get('/api/media/audio/invalid-name.mp3');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 404 when media not found', async () => {
      mockedMediaExists.mockResolvedValue(false);

      const response = await request(app).get('/api/media/audio/abcdef123456.mp3');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Media not found',
      });
      expect(mockedMediaExists).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it('should serve audio file with correct headers', async () => {
      const mockData = Buffer.from('fake wav data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/abcdef123456.wav');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('audio/wav');
      expect(response.headers['content-length']).toBe(String(mockData.length));
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.body).toEqual(mockData);
      expect(mockedRetrieveMedia).toHaveBeenCalledWith('audio/abcdef123456.wav');
    });

    it.each([
      ['audio', 'mp3', 'audio/mpeg'],
      ['audio', 'ogg', 'audio/ogg'],
      ['audio', 'webm', 'audio/webm'],
      ['image', 'png', 'image/png'],
      ['image', 'jpg', 'image/jpeg'],
      ['image', 'jpeg', 'image/jpeg'],
      ['image', 'gif', 'image/gif'],
      ['image', 'webp', 'image/webp'],
      ['video', 'mp4', 'video/mp4'],
      ['video', 'ogv', 'video/ogg'],
    ])('should serve %s/%s with content-type %s', async (type, ext, expectedContentType) => {
      const mockData = Buffer.from(`fake ${ext} data`);

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get(`/api/media/${type}/abcdef123456.${ext}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe(expectedContentType);
    });

    it('should use application/octet-stream for unknown extension', async () => {
      const mockData = Buffer.from('unknown data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/abcdef123456.xyz');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/octet-stream');
    });

    it('should return 500 when retrieveMedia throws error', async () => {
      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockRejectedValue(new Error('Disk read error'));

      const response = await request(app).get('/api/media/audio/abcdef123456.mp3');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to serve media',
      });
    });

    it.each([
      ['ABCDEF123456', 'uppercase'],
      ['AbCdEf123456', 'mixed case'],
    ])('should accept %s hex characters in filename (%s)', async (hex) => {
      const mockData = Buffer.from('fake data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get(`/api/media/audio/${hex}.mp3`);

      expect(response.status).toBe(200);
      expect(mockedRetrieveMedia).toHaveBeenCalledWith(`audio/${hex}.mp3`);
    });
  });
});
