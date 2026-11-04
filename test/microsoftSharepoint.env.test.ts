import fs from 'node:fs/promises';

import { ConfidentialClientApplication } from '@azure/msal-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from './util/utils';
import type { Configuration } from '@azure/msal-node';

vi.mock('fs/promises', () => ({ default: { readFile: vi.fn() } }));
vi.mock('@azure/msal-node', () => ({ ConfidentialClientApplication: vi.fn() }));
vi.mock('../src/logger', () => ({ default: { debug: vi.fn() } }));
vi.mock('../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));

const pem = (label: string) => `-----BEGIN PRIVATE KEY-----
${label}
-----END PRIVATE KEY-----
-----BEGIN CERTIFICATE-----
${Buffer.from(label).toString('base64')}
-----END CERTIFICATE-----`;

const settings = (label: string) => ({
  SHAREPOINT_CLIENT_ID: `client-${label}`,
  SHAREPOINT_TENANT_ID: `tenant-${label}`,
  SHAREPOINT_CERT_PATH: `/fixture/${label}.pem`,
  SHAREPOINT_BASE_URL: `https://${label}.sharepoint.invalid`,
});

describe('SharePoint authentication environment isolation', () => {
  let cliState: typeof import('../src/cliState').default;
  let getToken: typeof import('../src/microsoftSharepoint').getSharePointAccessToken;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.readFile).mockImplementation(async (file) => pem(String(file)));
    vi.mocked(ConfidentialClientApplication).mockReset();
    vi.mocked(ConfidentialClientApplication).mockImplementation(function (config: Configuration) {
      return {
        acquireTokenByClientCredential: vi.fn(async ({ scopes }) => ({
          accessToken: JSON.stringify({
            clientId: config.auth.clientId,
            authority: config.auth.authority,
            certificate: config.auth.clientCertificate?.thumbprintSha256,
            scopes,
          }),
        })),
      } as unknown as ConfidentialClientApplication;
    });
    cliState = (await import('../src/cliState')).default;
    getToken = (await import('../src/microsoftSharepoint')).getSharePointAccessToken;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('selects the current identity for sequential evaluations and reuses identical credentials', async () => {
    for (const label of ['a', 'a', 'b', 'a']) {
      const token = JSON.parse(await cliState.withEnv(settings(label), getToken));
      expect(token).toMatchObject({
        clientId: `client-${label}`,
        authority: `https://login.microsoftonline.com/tenant-${label}`,
        scopes: [`https://${label}.sharepoint.invalid/.default`],
      });
    }
    expect(ConfidentialClientApplication).toHaveBeenCalledTimes(3);
  });

  it.each(['SHAREPOINT_CLIENT_ID', 'SHAREPOINT_TENANT_ID', 'SHAREPOINT_CERT_PATH'] as const)(
    'does not reuse an earlier client after %s changes or disappears',
    async (field) => {
      const first = await cliState.withEnv(settings('a'), getToken);
      const second = await cliState.withEnv(
        { ...settings('a'), [field]: settings('b')[field] },
        getToken,
      );
      expect(second).not.toBe(first);
      await expect(cliState.withEnv({ ...settings('a'), [field]: '' }, getToken)).rejects.toThrow(
        `${field} environment variable is required`,
      );
    },
  );

  it('reloads a rotated certificate at the same path', async () => {
    const first = await cliState.withEnv(settings('a'), getToken);
    vi.mocked(fs.readFile).mockResolvedValue(pem('rotated-fixture'));
    const second = await cliState.withEnv(settings('a'), getToken);
    expect(JSON.parse(second).certificate).not.toBe(JSON.parse(first).certificate);
    expect(ConfidentialClientApplication).toHaveBeenCalledTimes(2);
  });

  it('keeps overlapping requests bound to their own tenant, certificate and token scope', async () => {
    const releaseA = createDeferred<string>();
    const enteredA = createDeferred<void>();
    vi.mocked(fs.readFile).mockImplementation(async (file) => {
      if (file === settings('a').SHAREPOINT_CERT_PATH) {
        enteredA.resolve();
        return releaseA.promise;
      }
      return pem(String(file));
    });
    const pendingA = cliState.withEnv(settings('a'), getToken);
    await enteredA.promise;
    const tokenB = await cliState.withEnv(settings('b'), getToken);
    releaseA.resolve(pem('a-fixture'));
    const tokenA = await pendingA;
    expect(JSON.parse(tokenA)).toMatchObject({
      clientId: 'client-a',
      scopes: ['https://a.sharepoint.invalid/.default'],
    });
    expect(JSON.parse(tokenB)).toMatchObject({
      clientId: 'client-b',
      scopes: ['https://b.sharepoint.invalid/.default'],
    });
  });

  it('does not cache failed initialization or reuse a client after a certificate read fails', async () => {
    await cliState.withEnv(settings('a'), getToken);
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('fixture read failure'));
    await expect(cliState.withEnv(settings('a'), getToken)).rejects.toThrow('fixture read failure');
    vi.mocked(ConfidentialClientApplication).mockImplementationOnce(function () {
      throw new Error('fixture initialization failure');
    });
    await expect(cliState.withEnv(settings('b'), getToken)).rejects.toThrow(
      'fixture initialization failure',
    );
    expect(JSON.parse(await cliState.withEnv(settings('b'), getToken)).clientId).toBe('client-b');
  });
});
