import crypto from 'crypto';
import fs from 'fs/promises';
import * as os from 'os';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseSignatureAuthSchema,
  generateSignature,
  JksSignatureAuthSchema,
  PemSignatureAuthSchema,
  PfxSignatureAuthSchema,
} from '../../src/providers/http';

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
    mockStat.mockReset();
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

  it('throws when separate key file path does not exist', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-pfx-key-'));
    const certPath = path.join(tmpDir, 'cert.pem');
    const keyPath = path.join(tmpDir, 'missing-key.pem');
    await fs.writeFile(certPath, 'CERT');

    try {
      const signatureAuth = {
        type: 'pfx' as const,
        certPath,
        keyPath,
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      await expect(generateSignature(signatureAuth, Date.now())).rejects.toThrow(
        /Key file not found/,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
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

describe('Signature algorithm validation', () => {
  describe('BaseSignatureAuthSchema', () => {
    it('accepts secure hash algorithms', () => {
      const secureAlgorithms = ['SHA256', 'SHA384', 'SHA512', 'SHA224', 'SHA512/224', 'SHA512/256'];

      for (const algorithm of secureAlgorithms) {
        const result = BaseSignatureAuthSchema.safeParse({
          signatureAlgorithm: algorithm,
          signatureValidityMs: 300000,
          signatureDataTemplate: '{{signatureTimestamp}}',
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts lowercase secure hash algorithms', () => {
      const result = BaseSignatureAuthSchema.safeParse({
        signatureAlgorithm: 'sha256',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(true);
    });

    it('rejects MD5 algorithm', () => {
      const result = BaseSignatureAuthSchema.safeParse({
        signatureAlgorithm: 'MD5',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/secure hash algorithm/);
      }
    });

    it('rejects SHA1 algorithm', () => {
      const result = BaseSignatureAuthSchema.safeParse({
        signatureAlgorithm: 'SHA1',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/secure hash algorithm/);
      }
    });

    it('rejects unknown algorithms', () => {
      const result = BaseSignatureAuthSchema.safeParse({
        signatureAlgorithm: 'UNKNOWN',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(false);
    });

    it('defaults to SHA256 when not specified', () => {
      const result = BaseSignatureAuthSchema.safeParse({
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.signatureAlgorithm).toBe('SHA256');
      }
    });
  });

  describe('PEM signature auth with algorithm validation', () => {
    it('accepts PEM with secure algorithm', () => {
      const result = PemSignatureAuthSchema.safeParse({
        type: 'pem',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(true);
    });

    it('rejects PEM with weak algorithm', () => {
      const result = PemSignatureAuthSchema.safeParse({
        type: 'pem',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
        signatureAlgorithm: 'MD5',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('JKS signature auth with algorithm validation', () => {
    it('accepts JKS with secure algorithm', () => {
      const result = JksSignatureAuthSchema.safeParse({
        type: 'jks',
        keystorePath: '/path/to/keystore.jks',
        keystorePassword: 'password',
        signatureAlgorithm: 'SHA512',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(true);
    });

    it('rejects JKS with weak algorithm', () => {
      const result = JksSignatureAuthSchema.safeParse({
        type: 'jks',
        keystorePath: '/path/to/keystore.jks',
        keystorePassword: 'password',
        signatureAlgorithm: 'SHA1',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PFX signature auth with algorithm validation', () => {
    it('accepts PFX with secure algorithm', () => {
      const result = PfxSignatureAuthSchema.safeParse({
        type: 'pfx',
        pfxPath: '/path/to/cert.pfx',
        pfxPassword: 'password',
        signatureAlgorithm: 'SHA384',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(true);
    });

    it('rejects PFX with weak algorithm', () => {
      const result = PfxSignatureAuthSchema.safeParse({
        type: 'pfx',
        pfxPath: '/path/to/cert.pfx',
        pfxPassword: 'password',
        signatureAlgorithm: 'MD5',
        signatureValidityMs: 300000,
        signatureDataTemplate: '{{signatureTimestamp}}',
      });
      expect(result.success).toBe(false);
    });
  });
});
