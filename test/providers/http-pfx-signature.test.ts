import crypto from 'crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSignature } from '../../src/providers/http';

// Hoisted mock for fs.promises.stat
const mockStat = vi.hoisted(() => vi.fn());

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        stat: mockStat,
      },
    },
    promises: {
      ...actual.promises,
      stat: mockStat,
    },
  };
});

describe('PFX signature paths (generateSignature)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
    mockStat.mockRejectedValue(new Error('ENOENT'));

    vi.doMock('pem', () => ({
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
    vi.doMock('pem', () => ({
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
    vi.doMock('pem', () => ({
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
    const update = vi.fn();
    const end = vi.fn();
    const sign = vi.fn().mockReturnValue(Buffer.from('sig'));
    vi.spyOn(crypto, 'createSign').mockReturnValue({ update, end, sign } as any);

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
