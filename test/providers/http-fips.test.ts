import { generateKeyPairSync, verify } from 'node:crypto';
import fs from 'fs/promises';

import { Agent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { generateSignature, HttpProvider } from '../../src/providers/http';
import * as fips from '../../src/util/fips';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  Agent: vi.fn(function (options: unknown) {
    return {
      options,
      compose() {
        return this;
      },
    };
  }),
}));
const { toPem, readPkcs12 } = vi.hoisted(() => ({ toPem: vi.fn(), readPkcs12: vi.fn() }));
vi.mock('jks-js', () => ({ toPem }));
vi.mock('pem', () => ({ default: { readPkcs12 } }));

let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({
    PROMPTFOO_INSECURE_SSL: undefined,
    NODE_TLS_REJECT_UNAUTHORIZED: undefined,
  });
  vi.spyOn(fips, 'isFipsEnabled').mockReturnValue(true);
  vi.spyOn(fs, 'readFile');
  toPem.mockReset();
  readPkcs12.mockReset();
  vi.mocked(Agent).mockClear();
  vi.mocked(fetchWithCache).mockReset().mockResolvedValue({
    data: 'fixture',
    cached: false,
    status: 200,
    statusText: 'OK',
    headers: {},
  });
});
afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('HTTP provider FIPS policy', () => {
  it.each([
    { rejectUnauthorized: false },
    { pfxPath: '/unused.p12' },
    { pfx: 'Zml4dHVyZQ==' },
    { jksPath: '/unused.jks' },
    { jksContent: 'Zml4dHVyZQ==' },
  ])('rejects unsupported TLS settings before reading files or making a request: %j', (tls) => {
    expect(
      () => new HttpProvider('https://example.test', { config: { method: 'GET', tls } }),
    ).toThrow(/FIPS mode/);
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(Agent).not.toHaveBeenCalled();
    expect(toPem).not.toHaveBeenCalled();
  });

  it('passes PEM certificates and a trusted CA to a verifying dispatcher', async () => {
    const provider = new HttpProvider('https://example.test', {
      config: {
        method: 'GET',
        tls: { cert: 'PEM certificate fixture', key: 'PEM key fixture', ca: 'PEM CA fixture' },
      },
    });
    await provider.callApi('fixture');
    expect(Agent).toHaveBeenCalledWith({
      connect: {
        cert: 'PEM certificate fixture',
        key: 'PEM key fixture',
        ca: 'PEM CA fixture',
        rejectUnauthorized: true,
      },
    });
    expect(fetchWithCache).toHaveBeenCalledOnce();
  });

  it('preserves an explicit insecure TLS option outside FIPS mode', async () => {
    vi.mocked(fips.isFipsEnabled).mockReturnValue(false);
    const provider = new HttpProvider('https://example.test', {
      config: { method: 'GET', tls: { rejectUnauthorized: false } },
    });
    await provider.callApi('fixture');
    expect(Agent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } });
  });

  it.each([
    { type: 'jks', keystorePath: '/unused.jks' },
    { type: 'jks', certificateContent: 'Zml4dHVyZQ==' },
    { keystoreContent: 'Zml4dHVyZQ==' },
    { type: 'pfx', pfxPath: '/unused.p12' },
    { type: 'pfx', certificateContent: 'Zml4dHVyZQ==' },
    { pfxContent: 'Zml4dHVyZQ==' },
  ])('rejects legacy signing imports before conversion: %j', async (config) => {
    await expect(generateSignature(config, 123)).rejects.toThrow(/FIPS mode.*PEM/);
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(toPem).not.toHaveBeenCalled();
    expect(readPkcs12).not.toHaveBeenCalled();
  });

  it('signs with PEM, including the legacy separate-cert/key PFX configuration', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    for (const config of [
      { type: 'pem', privateKey: pem },
      {
        type: 'pfx',
        certContent: Buffer.from('unused cert fixture').toString('base64'),
        keyContent: Buffer.from(pem).toString('base64'),
      },
    ]) {
      const signature = await generateSignature(
        {
          ...config,
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
        },
        123,
      );
      expect(
        verify('sha256', Buffer.from('123'), publicKey, Buffer.from(signature, 'base64')),
      ).toBe(true);
    }
    expect(readPkcs12).not.toHaveBeenCalled();
  });
});
