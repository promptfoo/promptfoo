import { getRemoteHealthUrl } from '../../src/redteam/remoteGeneration';
import { checkRemoteHealth } from '../../src/util/apiHealth';

const mockedFetch = jest.mocked(jest.fn());
global.fetch = mockedFetch;

const mockCloudConfig = {
  isEnabled: jest.fn().mockReturnValue(false),
  getApiHost: jest.fn().mockReturnValue('https://custom.api.com'),
};

jest.mock('../../src/globalConfig/cloud', () => ({
  CloudConfig: jest.fn().mockImplementation(() => mockCloudConfig),
}));

describe('API Health Utilities', () => {
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

    it('should handle ECONNREFUSED errors', async () => {
      const connectionError: any = new Error('Connection refused');
      connectionError.cause = { code: 'ECONNREFUSED' };
      mockedFetch.mockRejectedValueOnce(connectionError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toBe('API is not reachable');
    });

    it('should handle ECONNREFUSED with nested cause structure', async () => {
      const connectionError: any = new Error('Connection error');
      connectionError['cause'] = { code: 'ECONNREFUSED' };
      mockedFetch.mockRejectedValueOnce(connectionError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toBe('API is not reachable');
    });

    it('should handle errors with cause but no ECONNREFUSED code', async () => {
      const errorWithCause: any = new Error('Some network error');
      errorWithCause.cause = { code: 'ETIMEDOUT' };
      errorWithCause.code = 'NETWORK_ERROR';
      mockedFetch.mockRejectedValueOnce(errorWithCause);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error [NETWORK_ERROR]');
      expect(result.message).toContain('Some network error');
      expect(result.message).toContain('(Cause: [object Object])');
      expect(result.message).toContain('URL: https://test.api/health');
    });

    it('should handle TimeoutError gracefully', async () => {
      const timeoutError: any = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      mockedFetch.mockRejectedValueOnce(timeoutError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('OK');
      expect(result.message).toBe('API health check timed out, proceeding anyway');
    });

    it('should handle certificate errors specifically', async () => {
      const certError = new Error('unable to verify the first certificate');
      mockedFetch.mockRejectedValueOnce(certError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('SSL/Certificate issue detected');
      expect(result.message).toContain('unable to verify the first certificate');
    });

    it('should handle self-signed certificate errors', async () => {
      const selfSignedError = new Error('self signed certificate in certificate chain');
      mockedFetch.mockRejectedValueOnce(selfSignedError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('SSL/Certificate issue detected');
      expect(result.message).toContain('self signed certificate');
    });

    it('should handle DISABLED status from API', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'DISABLED' }),
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('DISABLED');
      expect(result.message).toBe('remote generation and grading are disabled');
    });

    it('should handle unknown status from API', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'UNKNOWN' }),
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toBe('Unknown error');
    });

    it('should handle unknown status with custom message', async () => {
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          status: 'MAINTENANCE',
          message: 'System is under maintenance' 
        }),
      } as Response);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toBe('System is under maintenance');
    });

    it('should handle errors without cause property', async () => {
      const simpleError = new Error('Simple network error');
      mockedFetch.mockRejectedValueOnce(simpleError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error: Simple network error');
      expect(result.message).toContain('URL: https://test.api/health');
      expect(result.message).not.toContain('Cause:');
    });

    it('should handle non-Error objects thrown as errors', async () => {
      mockedFetch.mockRejectedValueOnce('String error');

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error: String error');
      expect(result.message).toContain('URL: https://test.api/health');
    });

    it('should handle errors with code property but no cause', async () => {
      const errorWithCode: any = new Error('Connection error');
      errorWithCode.code = 'ERR_SOCKET_TIMEOUT';
      mockedFetch.mockRejectedValueOnce(errorWithCode);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error [ERR_SOCKET_TIMEOUT]');
      expect(result.message).toContain('Connection error');
      expect(result.message).not.toContain('Cause:');
    });

    it('should handle errors with both code and cause', async () => {
      const complexError: any = new Error('Complex network failure');
      complexError.code = 'ERR_NETWORK';
      complexError.cause = 'Underlying system error';
      mockedFetch.mockRejectedValueOnce(complexError);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error [ERR_NETWORK]');
      expect(result.message).toContain('Complex network failure');
      expect(result.message).toContain('(Cause: Underlying system error)');
      expect(result.message).toContain('URL: https://test.api/health');
    });

    it('should handle null or undefined errors gracefully', async () => {
      mockedFetch.mockRejectedValueOnce(null);

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      // When null is passed through String(), it becomes "null"
      expect(result.message).toContain('Network error: ');
      expect(result.message).toContain('URL: https://test.api/health');
    });

    it('should handle object errors that are not Error instances', async () => {
      mockedFetch.mockRejectedValueOnce({ error: 'Custom error object', code: 500 });

      const result = await checkRemoteHealth('https://test.api/health');
      expect(result.status).toBe('ERROR');
      expect(result.message).toContain('Network error: [object Object]');
      expect(result.message).toContain('URL: https://test.api/health');
    });
  });
});
