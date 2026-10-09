import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as identity from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';
import { createAzureCredential } from '../../../src/util/azureCredentials';
import { mockProcessEnv } from '../../util/utils';

import type { EnvOverrides } from '../../../src/types/env';

vi.mock('../../../src/cache', () => ({ getCache: vi.fn(), isCacheEnabled: vi.fn() }));
vi.mock('../../../src/logger');

// Resolve through Identity's graph, which may use a different MSAL from the root.
const require = createRequire(import.meta.url);
const identityRequire = createRequire(require.resolve('@azure/identity'));
const msalMetadata = identityRequire('@azure/msal-node/package.json');
const msalEntry = path.resolve(
  path.dirname(identityRequire.resolve('@azure/msal-node/package.json')),
  msalMetadata.exports['.'].import.default,
);
const { ConfidentialClientApplication, PublicClientApplication } = await import(
  pathToFileURL(msalEntry).href
);
const projectUrl = 'https://fixture.services.ai.azure.com/api/projects/same';
const principal = { AZURE_CLIENT_ID: 'fixture-client', AZURE_TENANT_ID: 'fixture-tenant' };
const publicAuthority = 'https://login.microsoftonline.com/fixture-tenant';
const sovereignAuthority = 'https://login.microsoftonline.us/fixture-tenant';
let restoreEnv: () => void;
let requests: number;
let stored: Map<string, unknown>;
let directory: string;

function provider(env: EnvOverrides = {}, config: Record<string, unknown> = {}) {
  const instance = new AzureFoundryAgentProvider('fixture-agent', {
    config: { projectUrl, ...config },
    env,
  });
  vi.spyOn(instance as any, 'createProjectClient').mockImplementation(async () => {
    const credential = await createAzureCredential(config, env);
    return {
      agents: { get: async () => ({ id: 'fixture-agent', name: 'fixture-agent' }) },
      getOpenAIClient: () => ({
        responses: {
          create: async () => {
            requests++;
            const token = await credential.getToken('https://ai.azure.com/.default');
            return {
              id: 'fixture-response',
              model: 'fixture',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: token!.token }],
                },
              ],
            };
          },
        },
      }),
    };
  });
  return instance;
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-foundry-cache-'));
  restoreEnv = mockProcessEnv({}, { clear: true });
  requests = 0;
  stored = new Map();
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  vi.mocked(getCache).mockResolvedValue({
    get: async (key: string) => stored.get(key),
    set: async (key: string, value: unknown) => {
      stored.set(key, value);
    },
  } as any);
  const deny = () => {
    throw new Error('Unexpected network access.');
  };
  vi.spyOn(http, 'request').mockImplementation(deny);
  vi.spyOn(https, 'request').mockImplementation(deny);
  vi.spyOn(globalThis, 'fetch').mockImplementation(deny);
  vi.spyOn(
    ConfidentialClientApplication.prototype,
    'acquireTokenByClientCredential',
  ).mockImplementation(async function (this: any) {
    if (typeof this.config.auth.clientAssertion === 'function') {
      await this.config.auth.clientAssertion();
    }
    return {
      accessToken: this.config.auth.authority,
      expiresOn: new Date('2100-01-01'),
      tokenType: 'Bearer',
    };
  });
  vi.spyOn(PublicClientApplication.prototype, 'acquireTokenByUsernamePassword').mockResolvedValue({
    accessToken: 'username-identity',
    expiresOn: new Date('2100-01-01'),
    tokenType: 'Bearer',
  });
  for (const credential of [
    identity.ManagedIdentityCredential,
    identity.VisualStudioCodeCredential,
  ]) {
    vi.spyOn(credential.prototype, 'getToken').mockRejectedValue(
      new identity.CredentialUnavailableError('Fixture mode unavailable.'),
    );
  }
  vi.spyOn(identity.AzureCliCredential.prototype, 'getToken').mockResolvedValue({
    token: 'developer-identity',
    expiresOnTimestamp: 9_999_999_999_999,
  });
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restoreEnv();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('Foundry scoped credential cache with the installed Identity SDK', () => {
  it.each(['environment', 'config'] as const)(
    'separates principal, unavailable and invalid secrets from %s',
    async (source) => {
      const make = (secret: string | undefined) =>
        source === 'environment'
          ? provider({ ...principal, AZURE_CLIENT_SECRET: secret })
          : provider(
              {},
              {
                azureClientId: principal.AZURE_CLIENT_ID,
                azureTenantId: principal.AZURE_TENANT_ID,
                azureClientSecret: secret,
              },
            );
      expect(await make('fixture-secret').callApi('same prompt')).toMatchObject({
        output: publicAuthority,
      });
      for (const unavailable of ['', undefined]) {
        expect(await make(unavailable).callApi('same prompt')).toMatchObject({
          output: 'developer-identity',
        });
      }
      expect(await make(' \t ').callApi('same prompt')).toMatchObject({
        error: expect.stringContaining('credentials are incomplete'),
      });
      expect(await make('rotated-fixture-secret').callApi('same prompt')).toMatchObject({
        output: publicAuthority,
        cached: true,
      });
      expect(requests).toBe(2);
      expect(stored.size).toBe(2);
    },
  );

  it.each(['', undefined])(
    'separates username/password availability (%s) from developer fallback',
    async (password) => {
      const common = { ...principal, AZURE_USERNAME: 'fixture-user' };
      expect(
        await provider({ ...common, AZURE_PASSWORD: 'fixture-password' }).callApi('same prompt'),
      ).toMatchObject({ output: 'username-identity' });
      expect(
        await provider({ ...common, AZURE_PASSWORD: password }).callApi('same prompt'),
      ).toMatchObject({ output: 'developer-identity' });
      expect(
        await provider({ ...common, AZURE_PASSWORD: 'rotated-password' }).callApi('same prompt'),
      ).toMatchObject({ output: 'username-identity', cached: true });
      expect(requests).toBe(2);
    },
  );

  it('separates native process-level credential selectors within a scoped identity', async () => {
    const env = { ...principal, AZURE_CLIENT_SECRET: 'fixture-secret' };
    expect(await provider(env).callApi('same prompt')).toMatchObject({ output: publicAuthority });
    const restoreSelector = mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: 'AzureCliCredential' });
    try {
      expect(await provider(env).callApi('same prompt')).toMatchObject({
        output: 'developer-identity',
      });
    } finally {
      restoreSelector();
    }
    expect(await provider(env).callApi('same prompt')).toMatchObject({
      output: publicAuthority,
      cached: true,
    });
  });

  it('does not replay a principal result after its secret clears and workload falls through', async () => {
    const file = path.join(directory, 'empty-token');
    fs.writeFileSync(file, '');
    const env = { ...principal, AZURE_FEDERATED_TOKEN_FILE: file };
    expect(
      await provider({ ...env, AZURE_CLIENT_SECRET: 'fixture-secret' }).callApi('same prompt'),
    ).toMatchObject({ output: publicAuthority });
    // The actual SDK marks the empty workload token unavailable and continues
    // to the local developer fixture. The selected file itself has not changed.
    expect(
      await provider({ ...env, AZURE_CLIENT_SECRET: '' }).callApi('same prompt'),
    ).toMatchObject({ output: 'developer-identity' });
    expect(requests).toBe(2);
  });

  it('does not replay a principal result after its secret clears and certificate loading fails', async () => {
    const env = {
      ...principal,
      AZURE_CLIENT_CERTIFICATE_PATH: path.join(directory, 'missing.pem'),
    };
    expect(
      await provider({ ...env, AZURE_CLIENT_SECRET: 'fixture-secret' }).callApi('same prompt'),
    ).toMatchObject({ output: publicAuthority });
    const failed = await provider({ ...env, AZURE_CLIENT_SECRET: '' }).callApi('same prompt');
    expect(failed.error).toBeDefined();
    expect(failed.cached).not.toBe(true);
    expect(requests).toBe(2);
  });

  it('does not replay a scoped result when native selector validation fails', async () => {
    const env = { ...principal, AZURE_CLIENT_SECRET: 'fixture-secret' };
    expect(await provider(env).callApi('same prompt')).toMatchObject({ output: publicAuthority });
    const restoreSelector = mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: 'invalid-fixture-selector' });
    try {
      const failed = await provider(env).callApi('same prompt');
      expect(failed.error).toContain('Invalid value');
      expect(failed.cached).not.toBe(true);
    } finally {
      restoreSelector();
    }
  });

  it('partitions authority-only config including explicit empty host masks', async () => {
    const restoreHost = mockProcessEnv({
      ...principal,
      AZURE_CLIENT_SECRET: 'fixture-secret',
      AZURE_AUTHORITY_HOST: 'https://login.microsoftonline.us',
      AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential',
    });
    try {
      // Release/base constructed this no-option SDK chain and ignored config authority.
      expect(
        (await new identity.DefaultAzureCredential().getToken('https://ai.azure.com/.default'))!
          .token,
      ).toBe(sovereignAuthority);
      expect(
        await provider({}, { azureAuthorityHost: 'https://login.microsoftonline.us' }).callApi(
          'same prompt',
        ),
      ).toMatchObject({ output: sovereignAuthority });
      expect(await provider({}, { azureAuthorityHost: '' }).callApi('same prompt')).toMatchObject({
        output: publicAuthority,
      });
      expect(await provider({}, { azureAuthorityHost: '' }).callApi('same prompt')).toMatchObject({
        output: publicAuthority,
        cached: true,
      });
      expect((provider() as any).getResponseCacheNamespace()).toBeUndefined();
      expect(requests).toBe(2);
    } finally {
      restoreHost();
    }
  });

  it('does not use another authority cache entry to hide authentication failure', async () => {
    const restoreHost = mockProcessEnv({
      ...principal,
      AZURE_CLIENT_SECRET: 'fixture-secret',
      AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential',
    });
    try {
      expect(
        await provider({}, { azureAuthorityHost: 'https://login.microsoftonline.com' }).callApi(
          'same prompt',
        ),
      ).toMatchObject({ output: publicAuthority });
      vi.mocked(
        ConfidentialClientApplication.prototype.acquireTokenByClientCredential,
      ).mockRejectedValueOnce(new Error('Synthetic authority authentication failed.'));
      expect(
        await provider({}, { azureAuthorityHost: 'https://login.microsoftonline.us' }).callApi(
          'same prompt',
        ),
      ).toMatchObject({
        error: expect.stringContaining('Synthetic authority authentication failed.'),
      });
      expect(
        await provider({}, { azureAuthorityHost: 'https://login.microsoftonline.com' }).callApi(
          'same prompt',
        ),
      ).toMatchObject({ output: publicAuthority, cached: true });
    } finally {
      restoreHost();
    }
  });
});
