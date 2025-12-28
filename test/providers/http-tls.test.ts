import fs from 'fs';

import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { HttpProvider } from '../../src/providers/http';

// Mock dependencies
vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

vi.mock('undici', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    Agent: vi.fn().mockImplementation(function (options) {
      return {
        options,
        dispatcher: 'mock-agent',
      };
    }),
  };
});

// Hoisted mock for fs.readFileSync
const mockReadFileSync = vi.hoisted(() => vi.fn());

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
  };
});

describe('HttpProvider with TLS Configuration', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock response
    mockFetchWithCache.mockResolvedValue({
      data: JSON.stringify({ result: 'success' }),
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
    });
  });

  describe('TLS certificate configuration', () => {
    it('should create HTTPS agent when TLS config is provided', async () => {
      // Mock file reads before creating provider
      (fs.readFileSync as Mock)
        .mockReturnValueOnce('CA_CERT_CONTENT')
        .mockReturnValueOnce('CLIENT_CERT_CONTENT')
        .mockReturnValueOnce('PRIVATE_KEY_CONTENT');

      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
          tls: {
            caPath: '/path/to/ca.pem',
            certPath: '/path/to/cert.pem',
            keyPath: '/path/to/key.pem',
            rejectUnauthorized: true,
          },
        },
      });

      await provider.callApi('test prompt');

      // Verify that fetchWithCache was called with dispatcher option
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: 'test prompt' }),
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );

      // Verify files were read
      expect(mockReadFileSync).toHaveBeenCalledTimes(3);
    });

    it('should support inline certificates', async () => {
      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
          tls: {
            ca: '-----BEGIN CERTIFICATE-----\nCA_CONTENT\n-----END CERTIFICATE-----',
            cert: '-----BEGIN CERTIFICATE-----\nCERT_CONTENT\n-----END CERTIFICATE-----',
            key: '-----BEGIN PRIVATE KEY-----\nKEY_CONTENT\n-----END PRIVATE KEY-----',
          },
        },
      });

      await provider.callApi('test prompt');

      // Should not read from files when inline certs are provided
      expect(mockReadFileSync).not.toHaveBeenCalled();

      // Verify dispatcher was included
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
        }),
        expect.any(Number),
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it('should support PFX certificates', async () => {
      // Mock PFX file read (returns Buffer)
      mockReadFileSync.mockReturnValue(Buffer.from('PFX_CONTENT'));

      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
          tls: {
            pfxPath: '/path/to/cert.pfx',
            passphrase: 'secret',
          },
        },
      });

      await provider.callApi('test prompt');

      // Verify PFX file was read
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('cert.pfx'));

      // Verify dispatcher was included
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
        }),
        expect.any(Number),
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it('should support inline PFX certificates as base64-encoded string', async () => {
      // Create a base64-encoded PFX content (simulating a real PFX file)
      const pfxBuffer = Buffer.from('PFX_BINARY_CONTENT');
      const base64Pfx = pfxBuffer.toString('base64');

      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
          tls: {
            pfx: base64Pfx,
            passphrase: 'secret',
          },
        },
      });

      await provider.callApi('test prompt');

      // Should not read from files when inline PFX is provided
      expect(mockReadFileSync).not.toHaveBeenCalled();

      // Verify dispatcher was included
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
        }),
        expect.any(Number),
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it('should support inline PFX certificates as Buffer', async () => {
      const pfxBuffer = Buffer.from('PFX_BINARY_CONTENT');

      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
          tls: {
            pfx: pfxBuffer,
            passphrase: 'secret',
          },
        },
      });

      await provider.callApi('test prompt');

      // Should not read from files when inline PFX is provided
      expect(mockReadFileSync).not.toHaveBeenCalled();

      // Verify dispatcher was included
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
        }),
        expect.any(Number),
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it('should support advanced TLS options', async () => {
      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'GET',
          tls: {
            rejectUnauthorized: false,
            servername: 'api.example.com',
            ciphers: 'TLS_AES_256_GCM_SHA384',
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
          },
        },
      });

      await provider.callApi('test prompt');

      // Verify dispatcher was included with the configuration
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
            options: expect.objectContaining({
              connect: expect.objectContaining({
                rejectUnauthorized: false,
                servername: 'api.example.com',
                ciphers: 'TLS_AES_256_GCM_SHA384',
              }),
            }),
          }),
        }),
        expect.any(Number),
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it('should work without TLS configuration', async () => {
      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
        },
      });

      await provider.callApi('test prompt');

      // Verify that fetchWithCache was called without dispatcher
      const callArgs = mockFetchWithCache.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('dispatcher');
    });

    it('should validate cert/key pairs', () => {
      // This should throw because cert is provided without key
      expect(() => {
        new HttpProvider('https://api.example.com', {
          config: {
            method: 'POST',
            tls: {
              certPath: '/path/to/cert.pem',
              // Missing keyPath - should fail validation
            },
          },
        });
      }).toThrow('Both certificate and key must be provided');
    });

    it('should work with raw request and TLS', async () => {
      mockReadFileSync.mockReturnValue('CA_CERT_CONTENT');

      const provider = new HttpProvider('https://api.example.com', {
        config: {
          request:
            'POST /endpoint HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\n\n{"prompt": "{{prompt}}"}',
          tls: {
            caPath: '/path/to/ca.pem',
          },
        },
      });

      await provider.callApi('test prompt');

      // Verify dispatcher was included for raw request
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('api.example.com'),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });
  });

  describe('TLS with signature auth', () => {
    it('should support both TLS and signature authentication', async () => {
      // Mock crypto.createSign to avoid actual signature generation
      const mockSign = {
        update: vi.fn(),
        end: vi.fn(),
        sign: vi.fn().mockReturnValue(Buffer.from('mock-signature')),
      };
      vi.spyOn(require('crypto'), 'createSign').mockReturnValue(mockSign as any);

      mockReadFileSync.mockReturnValue('CA_CERT_CONTENT');

      const provider = new HttpProvider('https://api.example.com', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
          tls: {
            caPath: '/path/to/ca.pem',
          },
          signatureAuth: {
            type: 'pem',
            privateKey:
              '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7W8rjA3yCLAVz\nKEY_FOR_TESTING\n-----END PRIVATE KEY-----',
            signatureAlgorithm: 'SHA256',
          },
        },
      });

      await provider.callApi('test prompt');

      // Should have both dispatcher (for TLS) and signature in body
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dispatcher: expect.objectContaining({
            dispatcher: 'mock-agent',
          }),
          headers: expect.any(Object),
        }),
        expect.any(Number),
        expect.any(String),
        undefined,
        undefined,
      );
    });
  });
});
