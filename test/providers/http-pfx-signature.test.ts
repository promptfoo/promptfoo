import crypto from 'crypto';
import fs from 'fs/promises';
import * as os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
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
    ['EACCES', /OPENSSL_BIN.*executable/i],
    ['EPERM', /OPENSSL_BIN.*executable/i],
    ['ENOENT', /OpenSSL is required.*OPENSSL_BIN/i],
    [1, /Invalid PFX file format or wrong password/],
  ] as const)(
    'reports OpenSSL failures safely without retrying a padded password (%s)',
    async (code, message) => {
      vi.mocked(runCommand).mockRejectedValue(
        Object.assign(new Error('child diagnostic'), {
          code,
          stdout: 'private-key-output',
          stderr: 'asn1 encoding routines:wrong tag: raw stderr',
        }),
      );
      const failure = readPfxPrivateKey('fixture.p12', ' padded-password ');
      await expect(failure).rejects.toThrow(message);
      await expect(failure).rejects.not.toThrow(
        /private-key-output|padded-password|raw stderr|child diagnostic/,
      );
      expect(runCommand).toHaveBeenCalledTimes(1);
    },
  );

  it('reports an unavailable legacy provider without retrying a padded password', async () => {
    vi.mocked(runCommand)
      .mockRejectedValueOnce(
        Object.assign(new Error('unsupported algorithm'), { stderr: 'unsupported: RC2-40-CBC' }),
      )
      .mockRejectedValue(
        Object.assign(new Error('child diagnostic'), {
          stdout: 'private-key-output',
          stderr: 'pkcs12: unable to load provider legacy at raw stderr',
        }),
      );
    const failure = readPfxPrivateKey('fixture.p12', ' padded-password ');
    await expect(failure).rejects.toThrow(/provider.*OPENSSL_MODULES/i);
    await expect(failure).rejects.not.toThrow(
      /private-key-output|padded-password|raw stderr|child diagnostic/,
    );
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runCommand).mock.calls[1][1]).toContain('-legacy');
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

  describe.each(['bad decrypt', 'pkcs12 cipherfinal error'])(
    'PKCS#12 archives without a MAC (%s)',
    (diagnostic) => {
      const childError = Object.assign(new Error('child diagnostic'), {
        code: 1,
        stdout: 'private key output',
        stderr: `OpenSSL:${diagnostic}:child diagnostic`,
      });

      it('retries with the trimmed password', async () => {
        const key = '-----BEGIN PRIVATE KEY-----\nYQ==\n-----END PRIVATE KEY-----';
        const run = vi.mocked(runCommand);
        run.mockRejectedValueOnce(childError).mockResolvedValueOnce({ stdout: key, stderr: '' });

        await expect(readPfxPrivateKey('fixture.p12', ' secret ')).resolves.toBe(key);
        expect(run.mock.calls.map(([, , options]) => options?.input)).toEqual([
          ' secret \n',
          'secret\n',
        ]);
      });

      it('returns a sanitized error when both passwords fail', async () => {
        const run = vi.mocked(runCommand).mockRejectedValue(childError);

        await expect(readPfxPrivateKey('fixture.p12', ' wrong ')).rejects.toThrow(
          /^Invalid PFX file format or wrong password$/,
        );
        expect(run.mock.calls.map(([, , options]) => options?.input)).toEqual([
          ' wrong \n',
          'wrong\n',
        ]);
      });
    },
  );

  it('uses the OpenSSL executable selected by the current invocation', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    vi.mocked(runCommand).mockResolvedValue({ stdout: key, stderr: '' });
    const signatureAuth = {
      type: 'pfx',
      pfxPassword: 'secret',
      pfxContent: Buffer.from('fixture').toString('base64'),
      signatureDataTemplate: '{{signatureTimestamp}}',
      signatureAlgorithm: 'SHA256',
    };

    await Promise.all(
      ['first-openssl', 'second-openssl'].map((binary) =>
        cliState.withEnv({ OPENSSL_BIN: binary }, () =>
          generateSignature(signatureAuth, Date.now()),
        ),
      ),
    );

    expect(
      vi
        .mocked(runCommand)
        .mock.calls.map(([binary]) => binary)
        .sort(),
    ).toEqual(['first-openssl', 'second-openssl']);
  });

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
