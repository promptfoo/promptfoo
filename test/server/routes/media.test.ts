import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  describe('GET /api/media/stats', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      vi.clearAllMocks();
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
      vi.clearAllMocks();
      app = createApp();
    });

    it('should return 400 for invalid type', async () => {
      const response = await request(app).get('/api/media/info/document/abcdef123456.pdf');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('type');
    });

    it('should return 400 for invalid filename with path traversal', async () => {
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

    it('should accept valid video type', async () => {
      const mockStorage = {
        providerId: 'local-fs',
        getUrl: vi.fn().mockResolvedValue('/media/video/abcdef123456.mp4'),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(app).get('/api/media/info/video/abcdef123456.mp4');

      expect(response.status).toBe(200);
      expect(response.body.data.key).toBe('video/abcdef123456.mp4');
    });

    it('should accept valid image type', async () => {
      const mockStorage = {
        providerId: 'local-fs',
        getUrl: vi.fn().mockResolvedValue('/media/image/abcdef123456.png'),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(app).get('/api/media/info/image/abcdef123456.png');

      expect(response.status).toBe(200);
      expect(response.body.data.key).toBe('image/abcdef123456.png');
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
      vi.clearAllMocks();
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

    it('should serve audio file with correct content-type for wav', async () => {
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

    it('should serve audio file with correct content-type for mp3', async () => {
      const mockData = Buffer.from('fake mp3 data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/abcdef123456.mp3');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('audio/mpeg');
      expect(response.body).toEqual(mockData);
    });

    it('should serve audio file with correct content-type for ogg', async () => {
      const mockData = Buffer.from('fake ogg data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/abcdef123456.ogg');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('audio/ogg');
    });

    it('should serve audio file with correct content-type for webm', async () => {
      const mockData = Buffer.from('fake webm data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/abcdef123456.webm');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('audio/webm');
    });

    it('should serve image file with correct content-type for png', async () => {
      const mockData = Buffer.from('fake png data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/image/abcdef123456.png');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
    });

    it('should serve image file with correct content-type for jpg', async () => {
      const mockData = Buffer.from('fake jpg data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/image/abcdef123456.jpg');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    it('should serve image file with correct content-type for jpeg', async () => {
      const mockData = Buffer.from('fake jpeg data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/image/abcdef123456.jpeg');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    it('should serve image file with correct content-type for gif', async () => {
      const mockData = Buffer.from('fake gif data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/image/abcdef123456.gif');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/gif');
    });

    it('should serve image file with correct content-type for webp', async () => {
      const mockData = Buffer.from('fake webp data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/image/abcdef123456.webp');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
    });

    it('should serve video file with correct content-type for mp4', async () => {
      const mockData = Buffer.from('fake mp4 data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/video/abcdef123456.mp4');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('video/mp4');
    });

    it('should serve video file with correct content-type for ogv', async () => {
      const mockData = Buffer.from('fake ogv data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/video/abcdef123456.ogv');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('video/ogg');
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

    it('should accept uppercase hex characters in filename', async () => {
      const mockData = Buffer.from('fake data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/ABCDEF123456.mp3');

      expect(response.status).toBe(200);
      expect(mockedRetrieveMedia).toHaveBeenCalledWith('audio/ABCDEF123456.mp3');
    });

    it('should accept mixed case hex characters in filename', async () => {
      const mockData = Buffer.from('fake data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await request(app).get('/api/media/audio/AbCdEf123456.mp3');

      expect(response.status).toBe(200);
      expect(mockedRetrieveMedia).toHaveBeenCalledWith('audio/AbCdEf123456.mp3');
    });
  });
});
