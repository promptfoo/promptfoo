import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { UserRefreshClient } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AzureFoundryAgentProvider } from '../../src/providers/azure/foundry-agent';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { getGoogleAccessToken } from '../../src/providers/google/util';
import { createAzureCredential } from '../../src/util/azureCredentials';
import { mockProcessEnv } from '../util/utils';

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-adc-fixture-'));
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
  it('isolates concurrent Live ADC clients without minting tokens', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-live-adc-fixture-'));
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
