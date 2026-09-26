import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { readAzureBlobText } from '../../src/util/azureBlob';
import { createAzureCredential } from '../../src/util/azureCredentials';
import { mockProcessEnv } from './utils';

const sdk = vi.hoisted(() => ({ blob: vi.fn() }));
vi.mock('@azure/identity', () => ({
  ClientSecretCredential: vi.fn(),
  DefaultAzureCredential: vi.fn(),
}));
vi.mock('@azure/storage-blob', () => ({ BlobServiceClient: sdk.blob }));
let restore: () => void;
const principal = (label: string) => ({
  AZURE_CLIENT_ID: `${label}-client`,
  AZURE_TENANT_ID: `${label}-tenant`,
  AZURE_CLIENT_SECRET: `${label}-secret`,
});
beforeEach(() => {
  restore = mockProcessEnv({
    AZURE_CLIENT_ID: undefined,
    AZURE_CLIENT_SECRET: undefined,
    AZURE_TENANT_ID: undefined,
    AZURE_AUTHORITY_HOST: undefined,
    AZURE_STORAGE_CONNECTION_STRING: undefined,
  });
  vi.mocked(ClientSecretCredential)
    .mockReset()
    .mockImplementation(function (tenantId, clientId) {
      return {
        fixture: { tenantId, clientId },
        getToken: vi.fn().mockRejectedValue(new Error('Unexpected authentication')),
      } as unknown as ClientSecretCredential;
    });
  vi.mocked(DefaultAzureCredential)
    .mockReset()
    .mockImplementation(function () {
      return {
        fixture: 'ambient-chain',
        getToken: vi.fn().mockRejectedValue(new Error('Unexpected authentication')),
      } as unknown as DefaultAzureCredential;
    });
  sdk.blob.mockReset().mockImplementation(function (_url, credential) {
    return {
      getContainerClient: () => ({
        getBlobClient: () => ({
          downloadToBuffer: async () => Buffer.from(JSON.stringify(credential.fixture)),
        }),
      }),
    };
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('scoped Azure credentials', () => {
  it('honors explicit configuration and authority above provider environment', async () => {
    await createAzureCredential(
      {
        azureClientId: 'config-client',
        azureClientSecret: 'config-secret',
        azureTenantId: 'config-tenant',
        azureAuthorityHost: 'https://login.fixture.invalid',
      },
      principal('provider'),
    );
    expect(ClientSecretCredential).toHaveBeenCalledWith(
      'config-tenant',
      'config-client',
      'config-secret',
      { authorityHost: 'https://login.fixture.invalid' },
    );
  });

  it('preserves the ambient workload/developer chain when no scoped service principal is supplied', async () => {
    mockProcessEnv(principal('host'));
    await createAzureCredential();
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(ClientSecretCredential).not.toHaveBeenCalled();
  });

  it('does not mix incomplete scoped principals with a lower-priority identity', async () => {
    await cliState.withEnv(principal('suite'), async () => {
      await expect(
        createAzureCredential({}, { AZURE_CLIENT_ID: 'provider-client' }),
      ).rejects.toThrow('incomplete');
    });
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
    expect(ClientSecretCredential).not.toHaveBeenCalled();
  });

  it.each(['config', 'provider', 'suite', 'file'] as const)(
    'rejects whitespace-only Azure principal fields from %s before constructing a credential',
    async (scope) => {
      mockProcessEnv(principal('host'));
      for (const field of ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'] as const) {
        const env = { ...principal('scoped'), [field]: ' \t ' };
        const verify = async () => {
          await expect(
            createAzureCredential(
              scope === 'config'
                ? {
                    azureClientId: env.AZURE_CLIENT_ID,
                    azureClientSecret: env.AZURE_CLIENT_SECRET,
                    azureTenantId: env.AZURE_TENANT_ID,
                  }
                : {},
              scope === 'provider' ? env : undefined,
            ),
          ).rejects.toThrow('incomplete');
        };
        if (scope === 'file') {
          await cliState.withEnvFileOverrides(env, verify);
        } else {
          await cliState.withEnv(scope === 'suite' ? env : principal('lower'), verify);
        }
      }
      expect(ClientSecretCredential).not.toHaveBeenCalled();
      expect(DefaultAzureCredential).not.toHaveBeenCalled();
    },
  );

  it('uses invocation-file principals for Azure Blob reads', async () => {
    for (const label of ['a', 'b']) {
      const text = await cliState.withEnvFileOverrides(principal(label), () =>
        readAzureBlobText('az://fixture/container/file.txt'),
      );
      expect(JSON.parse(text)).toEqual({
        clientId: `${label}-client`,
        tenantId: `${label}-tenant`,
      });
    }
  });
  it.each([
    { AZURE_CLIENT_ID: '' },
    { AZURE_CLIENT_SECRET: '' },
    { AZURE_CLIENT_ID: '', AZURE_CLIENT_SECRET: '', AZURE_TENANT_ID: '' },
  ])('rejects an empty scoped principal without selecting lower credentials: %j', async (env) => {
    await cliState.withEnv(
      {
        AZURE_CLIENT_ID: 'suite-client',
        AZURE_CLIENT_SECRET: 'suite-secret',
        AZURE_TENANT_ID: 'suite-tenant',
      },
      async () => {
        await expect(createAzureCredential({}, env)).rejects.toThrow('incomplete');
      },
    );
  });
});
