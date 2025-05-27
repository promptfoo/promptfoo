import {
  generateProviderHash,
  generateShortProviderHash,
  sendCanary,
  checkCanary,
  serializeProviderForHashing,
} from '../../src/canary/index';
import { cloudConfig } from '../../src/globalConfig/cloud';
import type { ApiProvider, ProviderOptions } from '../../src/types/providers';
import { makeRequest } from '../../src/util/cloud';

jest.mock('../../src/util/cloud');
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('canary', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('serializeProviderForHashing', () => {
    it('should serialize provider with function id', () => {
      const provider = {
        id: () => 'test-provider',
        callApi: async () => ({ output: 'test' }),
      } as ApiProvider;

      const serialized = serializeProviderForHashing(provider);
      expect(JSON.parse(serialized)).toEqual({ id: 'test-provider' });
    });

    it('should serialize provider with string id', () => {
      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      const serialized = serializeProviderForHashing(provider);
      expect(JSON.parse(serialized)).toEqual({ id: 'test-provider' });
    });

    it('should include config in serialization', () => {
      const provider = {
        id: 'test',
        config: {},
      } as ProviderOptions;

      const serialized = serializeProviderForHashing(provider);
      const parsed = JSON.parse(serialized);
      expect(parsed.id).toBe('test');
      expect(parsed.config).toEqual({});
    });

    it('should include transform in serialization', () => {
      const provider = {
        id: 'test',
        transform: 'transform-function',
      } as ProviderOptions;

      const serialized = serializeProviderForHashing(provider);
      expect(JSON.parse(serialized)).toEqual({
        id: 'test',
        transform: 'transform-function',
      });
    });

    it('should sort keys for stable serialization', () => {
      const provider = {
        transform: 'transform',
        id: 'test',
        config: {},
      } as ProviderOptions;

      const serialized = serializeProviderForHashing(provider);
      expect(serialized).toBe('{"config":{},"id":"test","transform":"transform"}');
    });

    it('should handle empty provider', () => {
      const provider = {} as ProviderOptions;
      const serialized = serializeProviderForHashing(provider);
      expect(serialized).toBe('{}');
    });

    it('should handle provider with null/undefined values', () => {
      const provider = {
        id: 'test',
        config: null,
        transform: undefined,
      } as any;

      const serialized = serializeProviderForHashing(provider);
      expect(JSON.parse(serialized)).toEqual({ id: 'test' });
    });
  });

  describe('generateProviderHash', () => {
    it('should generate hash for provider with function id', () => {
      const provider = {
        id: () => 'test-provider',
        callApi: async () => ({ output: 'test' }),
      } as ApiProvider;

      const hash = generateProviderHash(provider);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64);
    });

    it('should generate same hash for same provider config', () => {
      const provider1 = {
        id: 'test',
        config: {},
      } as ProviderOptions;

      const provider2 = {
        id: 'test',
        config: {},
      } as ProviderOptions;

      expect(generateProviderHash(provider1)).toBe(generateProviderHash(provider2));
    });

    it('should generate different hashes for different configs', () => {
      const provider1 = {
        id: 'test',
        config: {},
        transform: 'a',
      } as ProviderOptions;

      const provider2 = {
        id: 'test',
        config: {},
        transform: 'b',
      } as ProviderOptions;

      expect(generateProviderHash(provider1)).not.toBe(generateProviderHash(provider2));
    });
  });

  describe('generateShortProviderHash', () => {
    it('should generate shortened hash with default length', () => {
      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      const hash = generateShortProviderHash(provider);
      expect(hash).toHaveLength(8);
    });

    it('should generate shortened hash with custom length', () => {
      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      const hash = generateShortProviderHash(provider, 4);
      expect(hash).toHaveLength(4);
    });

    it('should handle length longer than hash', () => {
      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      const hash = generateShortProviderHash(provider, 128);
      expect(hash.length).toBeLessThanOrEqual(64);
    });
  });

  describe('sendCanary', () => {
    beforeEach(() => {
      jest.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
    });

    it('should throw error if cloud config is not enabled', async () => {
      jest.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(sendCanary(provider, 'test message')).rejects.toThrow(
        'Could not send canary. Cloud config is not enabled',
      );
    });

    it('should send canary successfully', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      const result = await sendCanary(provider, 'test message');
      expect(result).toEqual({ status: 'success' });
      expect(makeRequest).toHaveBeenCalledWith(
        'api/canary',
        'POST',
        expect.objectContaining({
          message: 'test message',
          providerId: 'test-provider',
        }),
      );
    });

    it('should handle network errors', async () => {
      jest.mocked(makeRequest).mockRejectedValue(new Error('Network error'));

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(sendCanary(provider, 'test message')).rejects.toThrow('Network error');
    });

    it('should handle server errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server Error'),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(sendCanary(provider, 'test message')).rejects.toThrow('Failed to send canary');
    });

    it('should use "unknown" for missing provider id', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {} as ProviderOptions;

      const result = await sendCanary(provider, 'msg');
      expect(result).toEqual({ status: 'success' });
      expect(makeRequest).toHaveBeenCalledWith(
        'api/canary',
        'POST',
        expect.objectContaining({
          providerId: 'unknown',
        }),
      );
    });

    it('should use function id if provided', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {
        id: () => 'func-id',
      } as ApiProvider;

      await sendCanary(provider, 'msg');
      expect(makeRequest).toHaveBeenCalledWith(
        'api/canary',
        'POST',
        expect.objectContaining({
          providerId: 'func-id',
        }),
      );
    });
  });

  describe('checkCanary', () => {
    beforeEach(() => {
      jest.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
    });

    it('should throw error if cloud config is not enabled', async () => {
      jest.spyOn(cloudConfig, 'isEnabled').mockReturnValue(false);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(checkCanary(provider)).rejects.toThrow(
        'Could not check canary. Cloud config is not enabled',
      );
    });

    it('should check canary successfully', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ status: 'active' }),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      const result = await checkCanary(provider);
      expect(result).toEqual({ status: 'active' });
      expect(makeRequest).toHaveBeenCalledWith(expect.stringContaining('api/canary/'), 'GET');
    });

    it('should throw error when canary not found', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not Found'),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(checkCanary(provider)).rejects.toThrow('No canary found for provider');
    });

    it('should handle network errors', async () => {
      jest.mocked(makeRequest).mockRejectedValue(new Error('Network error'));

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(checkCanary(provider)).rejects.toThrow('Network error');
    });

    it('should handle other server errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server Error'),
      } as unknown as Response;
      jest.mocked(makeRequest).mockResolvedValue(mockResponse);

      const provider = {
        id: 'test-provider',
      } as ProviderOptions;

      await expect(checkCanary(provider)).rejects.toThrow('Failed to check canary');
    });
  });
});
