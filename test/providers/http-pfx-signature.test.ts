import crypto from 'crypto';
import fs from 'fs/promises';
import * as os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSignature } from '../../src/providers/http';
import { readPfxPrivateKey } from '../../src/util/pfx';
import { runCommand } from '../../src/util/runCommand';

vi.mock('../../src/util/runCommand', () => ({ runCommand: vi.fn() }));

describe('PFX signature paths (generateSignature)', () => {
  beforeEach(() => {
    vi.mocked(runCommand).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    vi.mocked(runCommand).mockRejectedValue(
      Object.assign(new Error('openssl failed'), { stderr: 'Mac verify error: invalid password' }),
    );

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
    const filename = vi.mocked(runCommand).mock.calls[0][1][2];
    await expect(fs.access(filename)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    {
      label: 'literal padding',
      password: '  secret\t ',
      accepted: '  secret\t ',
      attempts: ['  secret\t '],
    },
    {
      label: 'configuration padding',
      password: '  secret\t ',
      accepted: 'secret',
      attempts: ['  secret\t ', 'secret'],
    },
    { label: 'empty archive password', password: '   ', accepted: '', attempts: ['   ', ''] },
  ])(
    'passes $label through stdin and preserves compatibility',
    async ({ password, accepted, attempts }) => {
      const key = '-----BEGIN PRIVATE KEY-----\nYQ==\n-----END PRIVATE KEY-----';
      vi.mocked(runCommand).mockImplementation(async (_binary, args, options) => {
        expect(args).toEqual([
          'pkcs12',
          '-in',
          'fixture.p12',
          '-nocerts',
          '-nodes',
          '-passin',
          'stdin',
        ]);
        if (options?.input !== accepted + '\n') {
          throw Object.assign(new Error('openssl failed'), {
            stderr: 'Mac verify error: invalid password?',
          });
        }
        return { stdout: key, stderr: '' };
      });

      await expect(readPfxPrivateKey('fixture.p12', password)).resolves.toBe(key);
      expect(vi.mocked(runCommand).mock.calls.map(([, , options]) => options?.input)).toEqual(
        attempts.map((value) => value + '\n'),
      );
    },
  );

  it('succeeds when PFX content yields a key', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const expectedKey = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    vi.mocked(runCommand)
      .mockRejectedValueOnce(
        Object.assign(new Error('unsupported algorithm'), { stderr: 'unsupported: RC2-40-CBC' }),
      )
      .mockResolvedValueOnce({ stdout: expectedKey, stderr: '' });

    const signatureAuth = {
      type: 'pfx' as const,
      pfxContent: Buffer.from('dummy').toString('base64'),
      pfxPassword: 'ok',
      signatureDataTemplate: '{{signatureTimestamp}}',
      signatureAlgorithm: 'SHA256',
      signatureValidityMs: 300000,
    };

    const timestamp = Date.now();
    const result = await generateSignature(signatureAuth, timestamp);
    const [binary, args, options] = vi.mocked(runCommand).mock.calls[0];
    expect(options?.input).toBe('ok\n');
    expect(args).not.toContain('ok');
    expect(runCommand).toHaveBeenNthCalledWith(2, binary, [...args, '-legacy'], options);
    await expect(fs.access(args[2])).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      crypto.verify(
        'SHA256',
        Buffer.from(String(timestamp)),
        publicKey,
        Buffer.from(result, 'base64'),
      ),
    ).toBe(true);
  });
});
