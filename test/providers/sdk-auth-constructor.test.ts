import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ClientSecretCredential,
  CredentialUnavailableError,
  DefaultAzureCredential,
} from '@azure/identity';
import { GoogleAuth, JWT, UserRefreshClient } from 'google-auth-library';
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
  it.each(['AZURE_CLIENT_ID', 'AZURE_TENANT_ID'])(
    'does not restore a host username credential through cleared %s',
    async (cleared) => {
      mockProcessEnv({
        AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential',
        AZURE_CLIENT_ID: 'host-client',
        AZURE_TENANT_ID: 'host-tenant',
        AZURE_USERNAME: 'fixture@example.invalid',
        AZURE_PASSWORD: 'fixture-password',
      });
      await expect(createAzureCredential({}, { [cleared]: '' })).rejects.toThrow('empty');
    },
  );

  it.each(['AZURE_TENANT_ID', 'AZURE_FEDERATED_TOKEN_FILE'])(
    'does not restore a host workload source in managed identity through cleared %s',
    async (cleared) => {
      mockProcessEnv({
        AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential',
        AZURE_CLIENT_ID: 'host-client',
        AZURE_TENANT_ID: 'host-tenant',
        AZURE_FEDERATED_TOKEN_FILE: '/fixture/host-token',
      });
      await expect(createAzureCredential({}, { [cleared]: '' })).rejects.toThrow('empty');
    },
  );
  it.each(
    [
      'AZURE_TENANT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_CLIENT_CERTIFICATE_PATH',
      'AZURE_FEDERATED_TOKEN_FILE',
    ].flatMap((cleared) =>
      [
        undefined,
        'prod',
        'dev',
        'EnvironmentCredential',
        'WorkloadIdentityCredential',
        'ManagedIdentityCredential',
      ].map((selector) => ({ cleared, selector })),
    ),
  )(
    'retains fallback for a cleared incomplete host $cleared/$selector',
    async ({ cleared, selector }) => {
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector, [cleared]: 'host-fixture' });
      const restoreSelected = mockProcessEnv({ [cleared]: '' });
      let expected;
      try {
        expected = new DefaultAzureCredential();
      } finally {
        restoreSelected();
      }
      const actual = await createAzureCredential({}, { [cleared]: '' });
      expect(actual).toBeInstanceOf(DefaultAzureCredential);
      const describeSources = (credential: object) =>
        Reflect.get(credential, '_sources').map(
          (source: {
            credentialName?: string;
            constructor: { name: string };
            tenantId?: string;
          }) => ({
            kind: source.credentialName ?? source.constructor.name,
            tenantId: source.tenantId,
          }),
        );
      expect(describeSources(actual)).toEqual(describeSources(expected));
    },
  );

  it.each(['EnvironmentCredential', 'WorkloadIdentityCredential', 'dev'])(
    'retains unavailable host-client fallback when managed identity is excluded by %s',
    async (selector) => {
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector, AZURE_CLIENT_ID: 'host-client' });
      const actual = await createAzureCredential({}, { AZURE_CLIENT_ID: '' });
      expect(actual).toBeInstanceOf(DefaultAzureCredential);
    },
  );

  it.each([undefined, 'prod', 'ManagedIdentityCredential'])(
    'does not restore a cleared host managed identity with selector %s',
    async (selector) => {
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector, AZURE_CLIENT_ID: 'host-client' });
      await expect(createAzureCredential({}, { AZURE_CLIENT_ID: '' })).rejects.toThrow('empty');
    },
  );
  it.each(
    ['AZURE_CLIENT_SECRET', 'AZURE_CLIENT_CERTIFICATE_PATH', 'AZURE_FEDERATED_TOKEN_FILE'].flatMap(
      (mode) =>
        [
          'mode-only',
          'missing-client',
          'missing-tenant',
          'empty-client',
          'empty-tenant',
          'empty-mode',
        ].flatMap((partial) =>
          [
            undefined,
            'prod',
            'dev',
            'EnvironmentCredential',
            'WorkloadIdentityCredential',
            'ManagedIdentityCredential',
            'invalid-selector',
          ].map((selector) => ({ mode, partial, selector })),
        ),
    ),
  )(
    'retains Azure SDK fallback for $mode/$partial/$selector',
    async ({ mode, partial, selector }) => {
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
      const selected = {
        [mode]:
          partial === 'empty-mode'
            ? ''
            : mode === 'AZURE_CLIENT_SECRET'
              ? 'fixture-secret'
              : '/fixture/unused-file',
        ...(partial === 'mode-only' || partial === 'missing-client'
          ? {}
          : { AZURE_CLIENT_ID: partial === 'empty-client' ? '' : 'fixture-client' }),
        ...(partial === 'mode-only' || partial === 'missing-tenant'
          ? {}
          : { AZURE_TENANT_ID: partial === 'empty-tenant' ? '' : 'fixture-tenant' }),
      };
      const restoreSelected = mockProcessEnv(selected);
      let expected: DefaultAzureCredential | undefined;
      let expectedError: unknown;
      try {
        expected = new DefaultAzureCredential();
      } catch (error) {
        expectedError = error;
      } finally {
        restoreSelected();
      }
      if (expectedError) {
        await expect(createAzureCredential({}, selected)).rejects.toThrow(
          (expectedError as Error).message,
        );
        return;
      }
      const actual = await createAzureCredential({}, selected);
      expect(actual).toBeInstanceOf(DefaultAzureCredential);
      const describeSources = (credential: object) =>
        Reflect.get(credential, '_sources').map(
          (source: {
            credentialName?: string;
            constructor: { name: string };
            tenantId?: string;
          }) => ({
            kind: source.credentialName ?? source.constructor.name,
            tenantId: source.tenantId,
          }),
        );
      expect(describeSources(actual)).toEqual(describeSources(expected!));
      // Exercise the real SDK chain while every credential exchange stays local.
      const resolveLocally = async (credential: object) => {
        for (const source of Reflect.get(credential, '_sources')) {
          vi.spyOn(source, 'getToken').mockImplementation(async () => {
            if (source.constructor.name === 'AzureCliCredential') {
              return { token: 'fixture-developer-token', expiresOnTimestamp: Date.now() + 3600000 };
            }
            throw new CredentialUnavailableError('Fixture credential unavailable');
          });
        }
        try {
          const token = await (credential as DefaultAzureCredential).getToken('fixture-scope');
          return { token: token?.token };
        } catch (error) {
          return { error: (error as Error).constructor.name };
        }
      };
      expect(await resolveLocally(actual)).toEqual(await resolveLocally(expected!));
    },
  );

  it.each(
    ['AZURE_CLIENT_SECRET', 'AZURE_CLIENT_CERTIFICATE_PATH', 'AZURE_FEDERATED_TOKEN_FILE'].flatMap(
      (mode) => ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID', mode].map((cleared) => ({ mode, cleared })),
    ),
  )('retains host-mask protection for $mode/$cleared', async ({ mode, cleared }) => {
    mockProcessEnv({
      AZURE_CLIENT_ID: 'host-client',
      AZURE_TENANT_ID: 'host-tenant',
      [mode]: mode === 'AZURE_CLIENT_SECRET' ? 'host-secret' : '/fixture/host-file',
    });
    await expect(createAzureCredential({}, { [cleared]: '' })).rejects.toThrow('empty');
  });

  it.each(['AZURE_CLIENT_SECRET', 'AZURE_CLIENT_CERTIFICATE_PATH', 'AZURE_FEDERATED_TOKEN_FILE'])(
    'keeps complete scoped %s identities ahead of developer fallback',
    async (mode) => {
      const selected = {
        AZURE_CLIENT_ID: 'fixture-client',
        AZURE_TENANT_ID: 'fixture-tenant',
        [mode]: mode === 'AZURE_CLIENT_SECRET' ? 'fixture-secret' : '/fixture/unused-file',
      };
      const restoreSelected = mockProcessEnv(selected);
      let expected;
      try {
        const chain = new DefaultAzureCredential();
        const sources = Reflect.get(chain, '_sources');
        expected = mode === 'AZURE_FEDERATED_TOKEN_FILE' ? sources[1] : sources[0]._credential;
      } finally {
        restoreSelected();
      }
      const actual = await createAzureCredential({}, selected);
      expect(actual.constructor).toBe(expected.constructor);
    },
  );
  it.each(
    [
      'explicit-json',
      'sdk-credentials',
      'sdk-keyfile',
      'environment-adc',
      'well-known-adc',
    ].flatMap((mode) =>
      ['host-quota', 'empty-host', 'scoped-quota', 'empty-scope'].map((scope) => ({ mode, scope })),
    ),
  )('retains native quota precedence for $mode with $scope', async ({ mode, scope }) => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-quota-precedence-'));
    const file = path.join(dir, 'application_default_credentials.json');
    const json = {
      type: 'authorized_user',
      client_id: 'fixture-client',
      client_secret: 'fixture-secret',
      refresh_token: 'fixture-refresh',
      quota_project_id: 'credential-quota',
    };
    fs.writeFileSync(file, JSON.stringify(json));
    mockProcessEnv({
      GOOGLE_CLOUD_PROJECT: 'fixture-project',
      GOOGLE_APPLICATION_CREDENTIALS: mode === 'well-known-adc' ? undefined : file,
      CLOUDSDK_CONFIG: dir,
      GOOGLE_CLOUD_QUOTA_PROJECT: scope === 'empty-host' ? '' : 'host-quota',
    });
    const options =
      mode === 'explicit-json'
        ? { credentials: JSON.stringify(json) }
        : mode === 'sdk-credentials'
          ? { googleAuthOptions: { credentials: json } }
          : mode === 'sdk-keyfile'
            ? { googleAuthOptions: { keyFilename: file } }
            : {};
    const scopedQuota =
      scope === 'scoped-quota' ? 'scoped-quota' : scope === 'empty-scope' ? '' : undefined;
    try {
      // Release-equivalent SDK construction with the selected environment value.
      const restoreQuota =
        scopedQuota === undefined
          ? () => {}
          : mockProcessEnv({ GOOGLE_CLOUD_QUOTA_PROJECT: scopedQuota });
      let expected;
      try {
        const auth = new GoogleAuth(options.googleAuthOptions);
        expected = mode === 'explicit-json' ? auth.fromJSON(json) : await auth.getClient();
      } finally {
        restoreQuota();
      }
      const { client } = await cliState.withEnvFileOverrides(
        scopedQuota === undefined ? {} : { GOOGLE_CLOUD_QUOTA_PROJECT: scopedQuota },
        () => GoogleAuthManager.getOAuthClient(options, false),
      );
      for (const credential of [expected, client]) {
        credential.credentials = {
          access_token: 'fixture-token',
          expiry_date: Date.now() + 3600000,
        };
      }
      expect(client.quotaProjectId).toBe(expected.quotaProjectId);
      expect((await client.getRequestHeaders()).get('x-goog-user-project')).toBe(
        (await expected.getRequestHeaders()).get('x-goog-user-project'),
      );
      expect(process.env.GOOGLE_CLOUD_QUOTA_PROJECT).toBe(
        scope === 'empty-host' ? '' : 'host-quota',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    'AzureCliCredential',
    ' dev ',
    'ManagedIdentityCredential',
    'AzurePowerShellCredential',
    'WorkloadIdentityCredential',
  ])('retains the native Azure %s selection with scoped placeholders', async (selector) => {
    mockProcessEnv({
      AZURE_TOKEN_CREDENTIALS: selector,
      AZURE_CLIENT_ID: 'fixture-client',
      AZURE_TENANT_ID: 'fixture-tenant',
      AZURE_CLIENT_SECRET: 'fixture-secret',
    });
    const expected = new DefaultAzureCredential();
    const actual = await createAzureCredential({}, { AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: '' });
    const sources = (credential: unknown) =>
      Reflect.get(credential as object, '_sources').map(
        (source: { constructor: { name: string }; credentialName?: string }) =>
          source.credentialName ?? source.constructor.name,
      );
    expect(actual).toBeInstanceOf(DefaultAzureCredential);
    expect(sources(actual)).toEqual(sources(expected));
    expect(
      Reflect.get(actual, '_sources').map((source: { tenantId?: string }) => source.tenantId),
    ).toEqual(
      Reflect.get(expected, '_sources').map((source: { tenantId?: string }) => source.tenantId),
    );
  });

  it('retains native invalid Azure chain selector validation', async () => {
    mockProcessEnv({
      AZURE_TOKEN_CREDENTIALS: 'invalid-selector',
      AZURE_CLIENT_ID: 'fixture-client',
      AZURE_TENANT_ID: 'fixture-tenant',
      AZURE_CLIENT_SECRET: 'fixture-secret',
    });
    expect(() => new DefaultAzureCredential()).toThrow('Invalid value for AZURE_TOKEN_CREDENTIALS');
    await expect(
      createAzureCredential({}, { AZURE_CLIENT_CERTIFICATE_PASSWORD: '' }),
    ).rejects.toThrow('Invalid value for AZURE_TOKEN_CREDENTIALS');
  });

  it.each(['EnvironmentCredential', 'prod'])(
    'retains the selected Azure %s environment identity',
    async (selector) => {
      mockProcessEnv({
        AZURE_TOKEN_CREDENTIALS: selector,
        AZURE_CLIENT_ID: 'fixture-client',
        AZURE_TENANT_ID: 'fixture-tenant',
        AZURE_CLIENT_SECRET: 'fixture-secret',
      });
      const expected = new DefaultAzureCredential();
      const actual = await createAzureCredential({}, { AZURE_CLIENT_CERTIFICATE_PASSWORD: '' });
      const nativeEnvironment = Reflect.get(expected, '_sources')[0];
      expect(actual.constructor).toBe(nativeEnvironment._credential.constructor);
    },
  );

  it('does not activate workload identity when Azure selects only environment credentials', async () => {
    mockProcessEnv({
      AZURE_TOKEN_CREDENTIALS: 'EnvironmentCredential',
      AZURE_CLIENT_ID: 'fixture-client',
      AZURE_TENANT_ID: 'fixture-tenant',
      AZURE_FEDERATED_TOKEN_FILE: '/fixture/unused-token',
    });
    const actual = await createAzureCredential({}, { AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: '' });
    expect(actual).toBeInstanceOf(DefaultAzureCredential);
    const sources = Reflect.get(actual, '_sources');
    expect(sources).toHaveLength(1);
    expect(sources[0].constructor.name).toBe('EnvironmentCredential');
    await expect(actual.getToken('fixture-scope')).rejects.toThrow('unavailable');
  });

  it('forwards scoped workload inputs when Azure explicitly selects workload identity', async () => {
    mockProcessEnv({
      AZURE_TOKEN_CREDENTIALS: 'WorkloadIdentityCredential',
      AZURE_CLIENT_ID: 'host-client',
      AZURE_TENANT_ID: 'host-tenant',
      AZURE_CLIENT_SECRET: 'excluded-host-secret',
    });
    const credential = await createAzureCredential(
      {},
      {
        AZURE_CLIENT_ID: 'scoped-client',
        AZURE_TENANT_ID: 'scoped-tenant',
        AZURE_FEDERATED_TOKEN_FILE: '/fixture/scoped-token',
      },
    );
    expect(credential.constructor.name).toBe('WorkloadIdentityCredential');
    expect(Reflect.get(credential, 'client').tenantId).toBe('scoped-tenant');
    expect(Reflect.get(credential, 'federatedTokenFilePath')).toBe('/fixture/scoped-token');
  });
  it.each(['authorized_user', 'service_account'])(
    'retains explicit SDK options when loading scoped %s ADC',
    async (type) => {
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-adc-options-'));
      const file = path.join(dir, 'adc.json');
      const credentials =
        type === 'authorized_user'
          ? {
              type,
              client_id: 'fixture-client',
              client_secret: 'fixture-secret',
              refresh_token: 'fixture-refresh',
            }
          : { type, client_email: 'fixture@example.invalid', private_key: 'fixture-private-key' };
      fs.writeFileSync(file, JSON.stringify(credentials));
      // Reuse a real SDK transporter; no token/request method is invoked.
      const transporter = new UserRefreshClient().transporter;
      try {
        const { client } = await GoogleAuthManager.getOAuthClient(
          {
            env: { GOOGLE_APPLICATION_CREDENTIALS: file },
            googleAuthOptions: {
              universeDomain: 'configured.invalid',
              clientOptions: {
                transporter,
                universeDomain: 'lower.invalid',
                subject: 'delegate@example.invalid',
                eagerRefreshThresholdMillis: 120000,
                forceRefreshOnFailure: true,
              },
            },
          },
          false,
        );
        expect(client).toBeInstanceOf(type === 'authorized_user' ? UserRefreshClient : JWT);
        expect(client.universeDomain).toBe('configured.invalid');
        expect(client.transporter).toBe(transporter);
        expect(client.eagerRefreshThresholdMillis).toBe(120000);
        expect(client.forceRefreshOnFailure).toBe(true);
        if (type === 'service_account') {
          expect(client.subject).toBe('delegate@example.invalid');
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('does not recover a host ADC project after selecting scoped authorized-user credentials', async () => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-adc-project-'));
    const file = path.join(dir, 'scoped.json');
    const hostFile = path.join(dir, 'host.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        type: 'authorized_user',
        client_id: 'scoped-client',
        client_secret: 'fixture-secret',
        refresh_token: 'fixture-refresh',
      }),
    );
    fs.writeFileSync(
      hostFile,
      JSON.stringify({
        type: 'service_account',
        project_id: 'host-project',
        client_email: 'host@example.invalid',
        private_key: 'fixture-private-key',
      }),
    );
    mockProcessEnv({ GOOGLE_APPLICATION_CREDENTIALS: hostFile });
    // Keep unrelated gcloud/metadata discovery offline while exercising the SDK's
    // real client cache and ADC project-discovery logic.
    vi.spyOn(Reflect.get(GoogleAuth, 'prototype'), 'getDefaultServiceProjectId').mockResolvedValue(
      null,
    );
    vi.spyOn(Reflect.get(GoogleAuth, 'prototype'), 'getGCEProjectId').mockResolvedValue(null);
    const hostDiscovery = vi.spyOn(
      Reflect.get(GoogleAuth, 'prototype'),
      '_tryGetApplicationCredentialsFromEnvironmentVariable',
    );
    try {
      const { client, projectId } = await GoogleAuthManager.getOAuthClient({
        env: { GOOGLE_APPLICATION_CREDENTIALS: file },
      });
      expect(client).toBeInstanceOf(UserRefreshClient);
      expect(Reflect.get(client, '_clientId')).toBe('scoped-client');
      expect(projectId).toBeUndefined();
      expect(hostDiscovery).not.toHaveBeenCalled();
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBe(hostFile);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([undefined, 'configured-options-quota'])(
    'preserves a shared explicit authClient quota across concurrent environments (options=%s)',
    async (quotaProjectId) => {
      const authClient = new UserRefreshClient(
        'fixture-client',
        'fixture-secret',
        'fixture-refresh',
      );
      authClient.credentials = {
        access_token: 'fixture-access',
        expiry_date: Date.now() + 3600000,
      };
      authClient.quotaProjectId = 'caller-quota';
      const clients = await Promise.all(
        ['first-quota', 'second-quota'].map((quota) =>
          cliState.withEnv({ GOOGLE_CLOUD_QUOTA_PROJECT: quota }, () =>
            GoogleAuthManager.getOAuthClient(
              { googleAuthOptions: { authClient, clientOptions: { quotaProjectId } } },
              false,
            ),
          ),
        ),
      );
      for (const { client } of clients) {
        expect(client).toBe(authClient);
        expect((await client.getRequestHeaders()).get('x-goog-user-project')).toBe('caller-quota');
      }
    },
  );

  it('keeps an explicit SDK authClient ahead of a stale ADC path', async () => {
    const authClient = new UserRefreshClient('fixture-client', 'fixture-secret', 'fixture-refresh');
    const { client } = await GoogleAuthManager.getOAuthClient(
      {
        googleAuthOptions: { authClient },
        env: { GOOGLE_APPLICATION_CREDENTIALS: '/absent-fixture/adc.json' },
      },
      false,
    );
    expect(client).toBe(authClient);
  });

  it.each([{ apiKey: 'fixture-api-key' }, { clientOptions: { apiKey: 'fixture-api-key' } }])(
    'keeps explicit SDK API-key authentication ahead of a stale ADC path: %j',
    async (googleAuthOptions) => {
      const { client } = await GoogleAuthManager.getOAuthClient(
        { googleAuthOptions, env: { GOOGLE_APPLICATION_CREDENTIALS: '/absent-fixture/adc.json' } },
        false,
      );
      expect(client.apiKey).toBe('fixture-api-key');
    },
  );

  it.each(['{invalid ADC json', '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----'])(
    'rejects non-JSON scoped ADC rather than accepting a deferred PEM client',
    async (content) => {
      const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-invalid-adc-'));
      const file = path.join(dir, 'adc.json');
      fs.writeFileSync(file, content);
      try {
        await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: file }, async () => {
          await expect(GoogleAuthManager.getOAuthClient({}, false)).rejects.toThrow(
            'valid ADC JSON',
          );
          expect(await GoogleAuthManager.hasDefaultCredentials()).toBe(false);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each([
    { type: 'authorized_user', client_id: 'fixture-client', client_secret: 'fixture-secret' },
    { type: 'service_account', client_email: 'fixture@example.invalid' },
    null,
    {},
  ])('rejects structurally invalid ADC without falling back to a PEM client: %j', async (data) => {
    const dir = fs.mkdtempSync(path.join(fixtureTempRoot, 'promptfoo-incomplete-adc-'));
    const file = path.join(dir, 'adc.json');
    fs.writeFileSync(file, JSON.stringify(data));
    try {
      await cliState.withEnvFileOverrides({ GOOGLE_APPLICATION_CREDENTIALS: file }, async () => {
        await expect(GoogleAuthManager.getOAuthClient({}, false)).rejects.toThrow();
        expect(await GoogleAuthManager.hasDefaultCredentials()).toBe(false);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

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
