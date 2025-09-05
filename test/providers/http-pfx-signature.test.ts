import fs from 'fs';
import crypto from 'crypto';
import { generateSignature } from '../../src/providers/http';

jest.mock('fs');

describe('PFX signature paths (generateSignature)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // Ensure fs.promises exists when fs is mocked
    (fs as any).promises = (fs as any).promises || {};
  });

  it('throws when PFX password is missing', async () => {
    const signatureAuth = {
      type: 'pfx' as const,
      pfxContent: 'BASE64',
      signatureDataTemplate: '{{signatureTimestamp}}',
      signatureAlgorithm: 'SHA256',
      signatureValidityMs: 300000,
    };

    await expect(generateSignature(signatureAuth, Date.now())).rejects.toThrow(
      /PFX certificate password is required/,
    );
  });

  it('throws when PFX file path does not exist', async () => {
    (fs.promises as any).stat = jest.fn().mockRejectedValue(new Error('ENOENT'));

    jest.doMock('pem', () => ({
      __esModule: true,
      default: {
        readPkcs12: (_path: string, _opts: any, cb: any) => cb(new Error('ENOENT'), null),
      },
    }));

    const signatureAuth = {
      type: 'pfx' as const,
      pfxPath: '/missing/cert.p12',
      pfxPassword: 'secret',
      signatureDataTemplate: '{{signatureTimestamp}}',
      signatureAlgorithm: 'SHA256',
      signatureValidityMs: 300000,
    };

    await expect(generateSignature(signatureAuth, Date.now())).rejects.toThrow(
      /PFX file not found/,
    );
  });

  it('throws when PFX content has wrong password', async () => {
    jest.doMock('pem', () => ({
      __esModule: true,
      default: {
        readPkcs12: (_buf: Buffer, _opts: any, cb: any) => cb(new Error('invalid password'), null),
      },
    }));

    const signatureAuth = {
      type: 'pfx' as const,
      pfxContent: Buffer.from('dummy').toString('base64'),
      pfxPassword: 'wrong',
      signatureDataTemplate: '{{signatureTimestamp}}',
      signatureAlgorithm: 'SHA256',
      signatureValidityMs: 300000,
    };

    await expect(generateSignature(signatureAuth, Date.now())).rejects.toThrow(
      /Invalid PFX file format or wrong password/,
    );
  });

  it('succeeds when PFX content yields a key', async () => {
    jest.doMock('pem', () => ({
      __esModule: true,
      default: {
        readPkcs12: (_buf: Buffer, _opts: any, cb: any) =>
          cb(null, {
            key: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
            cert: 'CERT',
          }),
      },
    }));

    // Mock crypto signing
    const update = jest.fn();
    const end = jest.fn();
    const sign = jest.fn().mockReturnValue(Buffer.from('sig'));
    jest.spyOn(crypto, 'createSign').mockReturnValue({ update, end, sign } as any);

    const signatureAuth = {
      type: 'pfx' as const,
      pfxContent: Buffer.from('dummy').toString('base64'),
      pfxPassword: 'ok',
      signatureDataTemplate: '{{signatureTimestamp}}',
      signatureAlgorithm: 'SHA256',
      signatureValidityMs: 300000,
    };

    const result = await generateSignature(signatureAuth, Date.now());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
