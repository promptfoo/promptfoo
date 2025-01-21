import crypto from 'crypto';
import fs from 'fs';
import { fetchWithCache } from '../../src/cache';
import { HttpProvider, generateSignature, needsSignatureRefresh } from '../../src/providers/http';

jest.mock('../../src/cache', () => ({
  ...jest.requireActual('../../src/cache'),
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/fetch', () => ({
  ...jest.requireActual('../../src/fetch'),
  fetchWithRetries: jest.fn(),
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  maybeLoadFromExternalFile: jest.fn((input) => input),
}));

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(async (modulePath: string, functionName?: string) => {
    const mockModule = {
      default: jest.fn((data) => data.defaultField),
      parseResponse: jest.fn((data) => data.specificField),
    };
    if (functionName) {
      return mockModule[functionName as keyof typeof mockModule];
    }
    return mockModule;
  }),
}));

jest.mock('../../src/cliState', () => ({
  basePath: '/mock/base/path',
}));

jest.mock('../../src/logger');

describe('HttpProvider', () => {
  describe('RSA signature authentication', () => {
    let mockPrivateKey: string;
    let mockSignature: Buffer;
    let timestamp: number;

    beforeEach(() => {
      mockPrivateKey = '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----';
      mockSignature = Buffer.from('mocksignature');
      timestamp = 1000;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(mockPrivateKey);
      jest.spyOn(Date, 'now').mockReturnValue(timestamp);

      const mockSign = {
        update: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
        sign: jest.fn().mockReturnValue(mockSignature),
      };

      jest.spyOn(crypto, 'createSign').mockReturnValue(mockSign as any);

      jest.mocked(fetchWithCache).mockReset();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate and include signature headers in request', async () => {
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          signatureAuth: {
            privateKeyPath: '/path/to/key.pem',
            signatureValidityMs: 300000,
            signatureDataTemplate: '{{signatureTimestamp}}',
          },
          headers: {
            'content-type': 'application/json',
            signature: 'bW9ja3NpZ25hdHVyZQ==',
            'signature-timestamp': '1000',
          },
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key.pem', 'utf8');
      expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            signature: 'bW9ja3NpZ25hdHVyZQ==',
            'signature-timestamp': '1000',
          }),
          body: JSON.stringify({ key: 'value' }),
        }),
        300000,
        'text',
        undefined,
        undefined,
      );
    });

    it('should reuse cached signature when within validity period', async () => {
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          signatureAuth: {
            privateKeyPath: '/path/to/key.pem',
            signatureValidityMs: 300000,
            signatureDataTemplate: '{{signatureTimestamp}}',
          },
          headers: {
            'content-type': 'application/json',
            signature: 'bW9ja3NpZ25hdHVyZQ==',
            'signature-timestamp': '1000',
          },
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      // First call should generate signature
      await provider.callApi('test');
      expect(crypto.createSign).toHaveBeenCalledTimes(1);

      // Second call within validity period should reuse signature
      jest.spyOn(Date, 'now').mockReturnValue(2000);
      await provider.callApi('test');
      expect(crypto.createSign).toHaveBeenCalledTimes(1);
    });

    it('should regenerate signature when expired', async () => {
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          signatureAuth: {
            privateKeyPath: '/path/to/key.pem',
            signatureValidityMs: 300000,
            signatureDataTemplate: '{{signatureTimestamp}}',
          },
          headers: {
            'content-type': 'application/json',
            signature: 'bW9ja3NpZ25hdHVyZQ==',
            'signature-timestamp': '1000',
          },
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      // First call should generate signature
      await provider.callApi('test');
      expect(crypto.createSign).toHaveBeenCalledTimes(1);

      // Second call after validity period should regenerate signature
      jest.spyOn(Date, 'now').mockReturnValue(301000);
      await provider.callApi('test');
      expect(crypto.createSign).toHaveBeenCalledTimes(2);
    });

    it('should use custom signature data template', async () => {
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          signatureAuth: {
            privateKey: mockPrivateKey,
            signatureValidityMs: 300000,
            signatureDataTemplate: 'custom-{{signatureTimestamp}}-template',
          },
          headers: {
            'content-type': 'application/json',
            signature: 'bW9ja3NpZ25hdHVyZQ==',
            'signature-timestamp': '1000',
          },
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            signature: 'bW9ja3NpZ25hdHVyZQ==',
            'signature-timestamp': '1000',
          }),
          body: JSON.stringify({ key: 'value' }),
        }),
        300000,
        'text',
        undefined,
        undefined,
      );
    });
  });
});

describe('needsSignatureRefresh', () => {
  it('should return true when signature has expired', () => {
    const now = Date.now();
    const timestamp = now - 6000; // 6 seconds ago
    const validityMs = 5000; // 5 seconds validity

    expect(needsSignatureRefresh(timestamp, validityMs)).toBe(true);
  });

  it('should return true when within buffer period', () => {
    const now = Date.now();
    const timestamp = now - 4500; // 4.5 seconds ago
    const validityMs = 5000; // 5 seconds validity
    const bufferMs = 1000; // 1 second buffer

    expect(needsSignatureRefresh(timestamp, validityMs, bufferMs)).toBe(true);
  });

  it('should return false when signature is still valid', () => {
    const now = Date.now();
    const timestamp = now - 2000; // 2 seconds ago
    const validityMs = 5000; // 5 seconds validity

    expect(needsSignatureRefresh(timestamp, validityMs)).toBe(false);
  });
});

describe('generateSignature', () => {
  let mockPrivateKey: string;
  let mockSignature: Buffer;

  beforeEach(() => {
    mockPrivateKey = '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----';
    mockSignature = Buffer.from('mocksignature');

    jest.spyOn(fs, 'readFileSync').mockReturnValue(mockPrivateKey);

    const mockSign = {
      update: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      sign: jest.fn().mockReturnValue(mockSignature),
    };

    jest.spyOn(crypto, 'createSign').mockReturnValue(mockSign as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should generate signature using private key from file', async () => {
    const signature = await generateSignature(
      '/path/to/key.pem',
      1000,
      '{{signatureTimestamp}}',
      'SHA256',
      true,
    );

    expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/key.pem', 'utf8');
    expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
    expect(signature).toBe(mockSignature.toString('base64'));
  });

  it('should generate signature using private key directly', async () => {
    const signature = await generateSignature(
      mockPrivateKey,
      1000,
      '{{signatureTimestamp}}',
      'SHA256',
      false,
    );

    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
    expect(signature).toBe(mockSignature.toString('base64'));
  });

  it('should use custom signature algorithm', async () => {
    await generateSignature(mockPrivateKey, 1000, '{{signatureTimestamp}}', 'SHA512', false);

    expect(crypto.createSign).toHaveBeenCalledWith('SHA512');
  });

  it('should handle template with custom data', async () => {
    await generateSignature(
      mockPrivateKey,
      1000,
      'custom-{{signatureTimestamp}}-template',
      'SHA256',
      false,
    );

    expect(crypto.createSign).toHaveBeenCalledWith('SHA256');
  });

  it('should throw error when file read fails', async () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('File read error');
    });

    await expect(
      generateSignature('/path/to/key.pem', 1000, '{{signatureTimestamp}}'),
    ).rejects.toThrow('Error: File read error');
  });
});
