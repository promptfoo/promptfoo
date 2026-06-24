import type { Server } from 'node:http';

import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaRouter } from '../../../src/server/routes/media';
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
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/media/stats', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should return success with providerId when storage has no stats', async () => {
      const mockStorage = {
        providerId: 'local-fs',
      } as MediaStorageProvider;

      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await api.get('/api/media/stats');

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

      const response = await api.get('/api/media/stats');

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

      const response = await api.get('/api/media/stats');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get storage stats',
      });
    });
  });

  it.each([
    '/api/media/info/audio/%FF',
    '/api/media/audio/%E0%A4%A',
  ])('should safely reject malformed path encoding for %s', async (path) => {
    const response = await api.get(path).set('Origin', 'https://attacker.example');

    expect(response.status).toBe(400);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ error: 'Invalid media path' });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.text).not.toContain('/home/');
    expect(mockedMediaExists).not.toHaveBeenCalled();
    expect(mockedGetMediaStorage).not.toHaveBeenCalled();
  });

  it.each([
    '/api/media/%FF',
    '/api/media/audio/%FF/extra',
    '/api/media/foo/bar/%FF',
    '/api/media/%',
  ])('should contain malformed paths that do not match a media route for %s', async (path) => {
    const response = await api.get(path).set('Origin', 'https://attacker.example');

    expect(response.status).toBe(404);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ error: 'Media route not found' });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.text).not.toContain('/home/');
    expect(mockedMediaExists).not.toHaveBeenCalled();
    expect(mockedGetMediaStorage).not.toHaveBeenCalled();
  });

  describe('GET /api/media/info/:type/:filename', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should return 400 for invalid type', async () => {
      const response = await api.get('/api/media/info/document/abcdef123456.pdf');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('type');
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('should return 400 when path segments resolve to invalid type and filename', async () => {
      // Express resolves ../../ before routing, so params become { type: 'etc', filename: 'passwd' }
      const response = await api.get('/api/media/info/audio/../../etc/passwd');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 400 for filename without hex prefix', async () => {
      const response = await api.get('/api/media/info/audio/malicious.mp3');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 400 for filename with wrong hex length', async () => {
      const response = await api.get('/api/media/info/audio/abc123.mp3');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 404 when media file does not exist', async () => {
      mockedMediaExists.mockResolvedValue(false);

      const response = await api.get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Media not found',
      });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(mockedMediaExists).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it.each([
      'https://storage.example.com/audio/abcdef123456.mp3',
      '//storage.example.com/audio/abcdef123456.mp3',
      '/media/audio/abcdef123456.mp3',
      'media/audio/abcdef123456.mp3',
    ])('should preserve browser-safe provider URL %s', async (providerUrl) => {
      const mockStorage = {
        providerId: 'local-fs',
        getUrl: vi.fn().mockResolvedValue(providerUrl),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await api.get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          key: 'audio/abcdef123456.mp3',
          exists: true,
          url: providerUrl,
          apiUrl: '/api/media/audio/abcdef123456.mp3',
        },
      });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(mockedMediaExists).toHaveBeenCalledWith('audio/abcdef123456.mp3');
      expect(mockStorage.getUrl).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it.each([
      'file:///Users/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'FILE:///C:/Users/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'file://fileserver/promptfoo/audio/abcdef123456.mp3',
      '  file:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      '\0file:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      '\u00a0file:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      '\ufefffile:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'f\tile:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'fi\nle:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'fil\re:///home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'file://%ZZ/home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      '\0file://%ZZ/home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      '\u00a0\0\ufefffile://%ZZ/home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'file://[invalid/home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
      'file://user:pass@/home/test-user/.promptfoo/media/audio/abcdef123456.mp3',
    ])('should replace local file URL %s with the API URL', async (providerUrl) => {
      const mockStorage = {
        providerId: 'local',
        getUrl: vi.fn().mockResolvedValue(providerUrl),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await api.get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          key: 'audio/abcdef123456.mp3',
          exists: true,
          url: '/api/media/audio/abcdef123456.mp3',
          apiUrl: '/api/media/audio/abcdef123456.mp3',
        },
      });
      expect(JSON.stringify(response.body)).not.toContain(providerUrl);
      expect(mockStorage.getUrl).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it('should return API access when provider URL generation fails', async () => {
      const mockStorage = {
        providerId: 'custom-storage',
        getUrl: vi.fn().mockRejectedValue(new Error('Signed URL service unavailable')),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await api.get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          key: 'audio/abcdef123456.mp3',
          exists: true,
          url: null,
          apiUrl: '/api/media/audio/abcdef123456.mp3',
        },
      });
      expect(mockStorage.getUrl).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it('should include the Express mount path in the API URL', async () => {
      const mockStorage = {
        providerId: 'local',
        getUrl: vi.fn().mockResolvedValue(null),
      } as unknown as MediaStorageProvider;
      const prefixedApp = express();
      prefixedApp.use('/promptfoo/api/media', mediaRouter);

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await request(prefixedApp).get(
        '/promptfoo/api/media/info/audio/abcdef123456.mp3',
      );

      expect(response.status).toBe(200);
      expect(response.body.data.apiUrl).toBe('/promptfoo/api/media/audio/abcdef123456.mp3');

      mockedRetrieveMedia.mockResolvedValue(Buffer.from('mounted media'));
      const mediaResponse = await request(prefixedApp).get(response.body.data.apiUrl);

      expect(mediaResponse.status).toBe(200);
      expect(mediaResponse.body).toEqual(Buffer.from('mounted media'));
    });

    it('should return info when URL generation is unsupported', async () => {
      const mockStorage = {
        providerId: 'custom-storage',
        getUrl: vi.fn().mockResolvedValue(null),
      } as unknown as MediaStorageProvider;

      mockedMediaExists.mockResolvedValue(true);
      mockedGetMediaStorage.mockReturnValue(mockStorage);

      const response = await api.get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          key: 'audio/abcdef123456.mp3',
          exists: true,
          url: null,
          apiUrl: '/api/media/audio/abcdef123456.mp3',
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

      const response = await api.get(`/api/media/info/${type}/abcdef123456.${ext}`);

      expect(response.status).toBe(200);
      expect(response.body.data.key).toBe(`${type}/abcdef123456.${ext}`);
    });

    it('should return 500 when mediaExists throws error', async () => {
      mockedMediaExists.mockRejectedValue(new Error('Database connection failed'));

      const response = await api.get('/api/media/info/audio/abcdef123456.mp3');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get media info',
      });
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it.each([
      '%2e%2e%2fetc%2fpasswd',
      '%252e%252e%252fetc%252fpasswd',
      '%2fetc%2fpasswd',
      'C%3a%5cWindows%5cwin.ini',
      'abcdef123456.mp3%00',
    ])('should reject encoded or absolute filename %s before storage access', async (filename) => {
      const response = await api.get(`/api/media/info/audio/${filename}`);

      expect(response.status).toBe(400);
      expect(mockedMediaExists).not.toHaveBeenCalled();
      expect(mockedGetMediaStorage).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/media/:type/:filename', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should return 400 for invalid type', async () => {
      const response = await api.get('/api/media/text/abcdef123456.txt');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('type');
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('should return 400 for invalid filename', async () => {
      // Filename must be exactly 12 hex characters + extension
      const response = await api.get('/api/media/audio/invalid-name.mp3');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('filename');
    });

    it('should return 404 when media not found', async () => {
      mockedMediaExists.mockResolvedValue(false);

      const response = await api.get('/api/media/audio/abcdef123456.mp3');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Media not found',
      });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(mockedMediaExists).toHaveBeenCalledWith('audio/abcdef123456.mp3');
    });

    it('should serve audio file with correct headers', async () => {
      const mockData = Buffer.from('fake wav data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await api.get('/api/media/audio/abcdef123456.wav');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('audio/wav');
      expect(response.headers['content-length']).toBe(String(mockData.length));
      expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
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

      const response = await api.get(`/api/media/${type}/abcdef123456.${ext}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe(expectedContentType);
    });

    it('should use application/octet-stream for unknown extension', async () => {
      const mockData = Buffer.from('unknown data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await api.get('/api/media/audio/abcdef123456.xyz');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/octet-stream');
    });

    it('should return 500 when retrieveMedia throws error', async () => {
      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockRejectedValue(new Error('Disk read error'));

      const response = await api.get('/api/media/audio/abcdef123456.mp3');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to serve media',
      });
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it.each([
      ['ABCDEF123456', 'uppercase'],
      ['AbCdEf123456', 'mixed case'],
    ])('should accept %s hex characters in filename (%s)', async (hex) => {
      const mockData = Buffer.from('fake data');

      mockedMediaExists.mockResolvedValue(true);
      mockedRetrieveMedia.mockResolvedValue(mockData);

      const response = await api.get(`/api/media/audio/${hex}.mp3`);

      expect(response.status).toBe(200);
      expect(mockedRetrieveMedia).toHaveBeenCalledWith(`audio/${hex}.mp3`);
    });
  });
});
