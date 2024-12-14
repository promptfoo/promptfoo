import request from 'supertest';
import { checkRemoteHealth, getRemoteHealthUrl } from '../../src/server/server';
import { createApp } from '../../src/server/server';

const mockedFetch = jest.mocked(jest.fn());
global.fetch = mockedFetch;

const mockCloudConfig = {
  isEnabled: jest.fn().mockReturnValue(false),
  getApiHost: jest.fn().mockReturnValue('https://custom.api.com'),
};

jest.mock('../../src/globalConfig/cloud', () => ({
  CloudConfig: jest.fn().mockImplementation(() => mockCloudConfig),
}));

describe('Remote Health Check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION;
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
    mockCloudConfig.isEnabled.mockReturnValue(false);
    mockCloudConfig.getApiHost.mockReturnValue('https://custom.api.com');
  });

  describe('getRemoteHealthUrl', () => {
    it('should return null when remote generation is disabled', () => {
      process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
      expect(getRemoteHealthUrl()).toBeNull();
    });

    it('should use custom URL when provided', () => {
      process.env.PROMPTFOO_REMOTE_GENERATION_URL = 'https://custom-api.example.com/task';
      expect(getRemoteHealthUrl()).toBe('https://custom-api.example.com/health');
    });

    it('should use cloud config when enabled', () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudConfig.getApiHost.mockReturnValue('https://cloud.example.com');
      expect(getRemoteHealthUrl()).toBe('https://cloud.example.com/health');
    });

    it('should use default URL when no configuration is provided', () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);
      expect(getRemoteHealthUrl()).toBe('https://api.promptfoo.app/health');
    });
  });

  describe('checkRemoteHealth', () => {
    it('should return OK status when API is healthy', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(false);
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'OK' }),
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('OK');
      expect(result.message).toBe('Cloud API is healthy');
    });

    it('should include custom endpoint message when cloud config is enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'OK' }),
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('OK');
      expect(result.message).toBe('Cloud API is healthy (using custom endpoint)');
    });

    it('should handle non-OK response', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Failed to connect');
    });

    it('should handle network errors', async () => {
      mockedFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error');
    });

    it('should handle malformed JSON', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Invalid JSON');
    });
  });

  describe('/api/remote-health endpoint', () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      app = createApp();
    });

    it('should return disabled status when remote generation is disabled', async () => {
      process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

      const response = await request(app).get('/api/remote-health').expect(200);

      expect(response.body).toEqual({
        status: 'DISABLED',
        message: 'remote generation and grading are disabled',
      });
    });

    it('should return health check result when enabled', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'OK' }),
      } as Response);

      const response = await request(app).get('/api/remote-health').expect(200);

      expect(response.body).toEqual({
        status: 'OK',
        message: 'Cloud API is healthy',
      });
    });

    it('should handle errors from health check', async () => {
      mockedFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await request(app).get('/api/remote-health').expect(200);

      expect(response.body).toEqual({
        status: 'ERROR',
        message: expect.stringContaining('Network error'),
      });
    });

    it('should use custom URL from environment', async () => {
      process.env.PROMPTFOO_REMOTE_GENERATION_URL = 'https://custom-api.example.com/task';
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'OK' }),
      } as Response);

      await request(app).get('/api/remote-health').expect(200);

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/health',
        expect.any(Object),
      );
    });

    it('should use cloud config URL when enabled', async () => {
      mockCloudConfig.isEnabled.mockReturnValue(true);
      mockCloudConfig.getApiHost.mockReturnValue('https://cloud.example.com');
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'OK' }),
      } as Response);

      await request(app).get('/api/remote-health').expect(200);

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://cloud.example.com/health',
        expect.any(Object),
      );
    });
  });
});
