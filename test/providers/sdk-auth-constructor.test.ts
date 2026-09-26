import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { UserRefreshClient } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { loadApiProvider } from '../../src/providers';
import { AzureFoundryAgentProvider } from '../../src/providers/azure/foundry-agent';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { getGoogleAccessToken } from '../../src/providers/google/util';
import { createAzureCredential } from '../../src/util/azureCredentials';
import { mockProcessEnv } from '../util/utils';

const fixtureTempRoot = os.tmpdir();
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({}, { clear: true });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('real cloud SDK credential construction without authentication calls', () => {
  it('loads a local scoped ADC file and applies scoped quota over the host quota', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-adc-fixture-'));
    const file = path.join(dir, 'adc.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        type: 'authorized_user',
        client_id: 'fixture-id',
        client_secret: 'fixture-secret',
        refresh_token: 'fixture-refresh',
      }),
    );
    mockProcessEnv({ GOOGLE_CLOUD_QUOTA_PROJECT: 'host-quota' });
    try {
      const { client } = await GoogleAuthManager.getOAuthClient(
        {
          env: { GOOGLE_APPLICATION_CREDENTIALS: file, GOOGLE_CLOUD_QUOTA_PROJECT: 'scoped-quota' },
        },
        false,
      );
      expect(client).toBeInstanceOf(UserRefreshClient);
      expect(client.quotaProjectId).toBe('scoped-quota');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    'vertex:live:fixture',
    'vertex:embedding:fixture',
    'vertex:embeddings:fixture',
    'vertex:video:fixture',
    'vertex:claude-sonnet-4-5',
    'vertex:chat:claude-sonnet-4-5',
    'vertex:llama-3.3-70b-instruct-maas',
    'vertex:chat-bison',
    'vertex:unknown-model',
    'vertex:gemini-omni-flash-preview',
    'vertex:chat:gemini-omni-1.1-flash-preview',
  ])('retains suite ADC when an unrelated provider API key is present on %s', async (id) => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-oauth-route-'));
    const file = path.join(dir, 'adc.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        type: 'authorized_user',
        client_id: 'suite-id',
        client_secret: 'fixture-secret',
        refresh_token: 'fixture-refresh',
      }),
    );
    mockProcessEnv({ GOOGLE_CLOUD_PROJECT: 'fixture-project' });
    vi.spyOn(UserRefreshClient.prototype, 'getRequestHeaders').mockResolvedValue(
      new Headers({ authorization: 'Bearer fixture' }),
    );
    try {
      const provider = await loadApiProvider(id, {
        env: { GOOGLE_APPLICATION_CREDENTIALS: file },
        options: {
          env: { GOOGLE_API_KEY: 'unrelated-provider-key' },
          config: { projectId: 'fixture-project' },
        },
      });
      expect(Reflect.get(provider, 'env').GOOGLE_APPLICATION_CREDENTIALS).toBe(file);
      if (id.includes(':live:')) {
        expect(
          await Reflect.get(provider, 'getConnection').call(provider, {
            projectId: 'fixture-project',
          }),
        ).toMatchObject({
          headers: { authorization: 'Bearer fixture' },
        });
      } else {
        const client = id.includes('gemini-omni')
          ? (await GoogleAuthManager.getOAuthClient({ env: Reflect.get(provider, 'env') })).client
          : await Reflect.get(provider, 'getClientWithCredentials').call(provider, {});
        expect(client).toBeInstanceOf(UserRefreshClient);
        expect(Reflect.get(client, '_clientId')).toBe('suite-id');
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['vertex:gemini-3.8-flash', 'vertex:chat:gemini-3.8-flash'])(
    'keeps higher API keys preferred to lower ADC on express-capable %s',
    async (id) => {
      const provider = await loadApiProvider(id, {
        env: { GOOGLE_APPLICATION_CREDENTIALS: 'lower-adc.json' },
        options: { env: { GOOGLE_API_KEY: 'provider-key' } },
      });
      expect(Reflect.get(provider, 'env').GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
      expect(await Reflect.get(provider, 'getAuthHeaders').call(provider)).toMatchObject({
        'x-goog-api-key': 'provider-key',
      });
    },
  );

  it('constructs an explicit Azure service principal and preserves the default chain fallback', async () => {
    const credential = await createAzureCredential(
      {},
      {
        AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
        AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000002',
        AZURE_CLIENT_SECRET: 'synthetic-fixture',
      },
    );
    expect(credential).toBeInstanceOf(ClientSecretCredential);
    expect(await createAzureCredential()).toBeInstanceOf(DefaultAzureCredential);
  });
  it.each(['azure:foundry-agent:fixture', 'azureopenai:foundry-agent:fixture'])(
    'rejects partial provider credentials on %s instead of borrowing a suite principal',
    async (id) => {
      const provider = await loadApiProvider(id, {
        env: {
          AZURE_CLIENT_ID: 'suite-client',
          AZURE_CLIENT_SECRET: 'suite-secret',
          AZURE_TENANT_ID: 'suite-tenant',
        },
        options: {
          config: { projectUrl: 'https://fixture.services.ai.azure.com/api/projects/fixture' },
          env: { AZURE_CLIENT_ID: 'provider-client' },
        },
      });
      await expect(Reflect.get(provider, 'initializeClient').call(provider)).rejects.toThrow(
        'incomplete',
      );
    },
  );

  it('isolates concurrent Live ADC clients without minting tokens', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-live-adc-fixture-'));
    vi.spyOn(UserRefreshClient.prototype, 'getAccessToken').mockImplementation(async function (
      this: UserRefreshClient,
    ) {
      return { token: Reflect.get(this, '_clientId') };
    });
    try {
      const tokens = await Promise.all(
        ['a', 'b'].map((label) => {
          const file = path.join(dir, `${label}.json`);
          fs.writeFileSync(
            file,
            JSON.stringify({
              type: 'authorized_user',
              client_id: label,
              client_secret: 'fixture-secret',
              refresh_token: 'fixture-refresh',
            }),
          );
          return cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: file }, () =>
            getGoogleAccessToken(),
          );
        }),
      );
      expect(tokens).toEqual(['a', 'b']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('binds concurrent Foundry SDK clients to their own scoped service principals', async () => {
    const tenants = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ];
    await Promise.all(
      tenants.map((tenantId) =>
        cliState.withEnv(
          {
            AZURE_TENANT_ID: tenantId,
            AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000003',
            AZURE_CLIENT_SECRET: 'synthetic-fixture',
          },
          async () => {
            const provider = new AzureFoundryAgentProvider('fixture', {
              config: { projectUrl: 'https://fixture.services.ai.azure.com/api/projects/fixture' },
            });
            const client = await Reflect.get(provider, 'initializeClient').call(provider);
            const credential = Reflect.get(client, '_credential');
            expect(credential).toBeInstanceOf(ClientSecretCredential);
            expect(Reflect.get(credential, 'tenantId')).toBe(tenantId);
            expect(await Reflect.get(provider, 'initializeClient').call(provider)).toBe(client);
          },
        ),
      ),
    );
  });
});
