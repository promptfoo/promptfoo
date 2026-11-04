import {
  ClientCertificateCredential,
  ClientSecretCredential,
  DefaultAzureCredential,
  WorkloadIdentityCredential,
} from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { readAzureBlobText } from '../../src/util/azureBlob';
import { createAzureCredential } from '../../src/util/azureCredentials';
import { mockProcessEnv } from './utils';

const sdk = vi.hoisted(() => ({ blob: vi.fn() }));
vi.mock('@azure/identity', () => ({
  AzureAuthorityHosts: { AzurePublicCloud: 'https://login.microsoftonline.com' },
  ClientSecretCredential: vi.fn(),
  DefaultAzureCredential: vi.fn(),
  WorkloadIdentityCredential: vi.fn(),
  ClientCertificateCredential: vi.fn(),
}));
vi.mock('../../src/util/azureWorkloadIdentity', () => ({
  createScopedAzureWorkloadCredential: async (
    identity: typeof import('@azure/identity'),
    _native: unknown,
    options: import('@azure/identity').WorkloadIdentityCredentialOptions,
  ) => new identity.WorkloadIdentityCredential(options),
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
    AZURE_CLIENT_CERTIFICATE_PATH: undefined,
    AZURE_CLIENT_CERTIFICATE_PASSWORD: undefined,
    AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: undefined,
    AZURE_FEDERATED_TOKEN_FILE: undefined,
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

  it('preserves per-key environment precedence when a provider overrides part of a principal', async () => {
    await cliState.withEnv(principal('suite'), async () => {
      await createAzureCredential({}, { AZURE_CLIENT_ID: 'provider-client' });
    });
    expect(ClientSecretCredential).toHaveBeenCalledWith(
      'suite-tenant',
      'provider-client',
      'suite-secret',
      { authorityHost: undefined },
    );
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
  });

  it.each(['config', 'provider', 'suite', 'file'] as const)(
    'rejects whitespace-only Azure client/secret fields from %s before constructing a credential',
    async (scope) => {
      mockProcessEnv(principal('host'));
      for (const field of ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'] as const) {
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

  it.each(
    (['config', 'provider', 'suite', 'file'] as const).flatMap((scope) =>
      [false, true].map((servicePrincipal) => ({ scope, servicePrincipal })),
    ),
  )(
    'masks lower Azure authorities with an empty $scope override (principal: $servicePrincipal)',
    async ({ scope, servicePrincipal }) => {
      mockProcessEnv({ AZURE_AUTHORITY_HOST: 'https://host.fixture.invalid' });
      await cliState.withEnvFileOverrides(
        { AZURE_AUTHORITY_HOST: scope === 'file' ? '' : 'https://file.fixture.invalid' },
        () =>
          cliState.withEnv(
            scope === 'file'
              ? {}
              : { AZURE_AUTHORITY_HOST: scope === 'suite' ? '' : 'https://suite.fixture.invalid' },
            () =>
              createAzureCredential(scope === 'config' ? { azureAuthorityHost: '' } : {}, {
                ...(servicePrincipal ? principal('provider') : {}),
                AZURE_AUTHORITY_HOST:
                  scope === 'config'
                    ? 'https://provider.fixture.invalid'
                    : scope === 'provider'
                      ? ''
                      : undefined,
              }),
          ),
      );
      if (servicePrincipal) {
        expect(ClientSecretCredential).toHaveBeenCalledWith(
          'provider-tenant',
          'provider-client',
          'provider-secret',
          { authorityHost: 'https://login.microsoftonline.com' },
        );
      } else {
        expect(DefaultAzureCredential).toHaveBeenCalledWith({
          authorityHost: 'https://login.microsoftonline.com',
        });
      }
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
  it.each([{ AZURE_CLIENT_ID: '' }])(
    'preserves default fallback for an empty scoped principal without host credentials: %j',
    async (env) => {
      await cliState.withEnv(
        {
          AZURE_CLIENT_ID: 'suite-client',
          AZURE_CLIENT_SECRET: 'suite-secret',
          AZURE_TENANT_ID: 'suite-tenant',
        },
        async () => {
          await createAzureCredential({}, env);
          expect(DefaultAzureCredential).toHaveBeenCalledWith(
            expect.objectContaining({ managedIdentityClientId: '' }),
          );
        },
      );
    },
  );
});

describe('Azure identity modes without client secrets', () => {
  it('preserves harmless blank placeholders without ambient values to rediscover', async () => {
    await cliState.withEnvFileOverrides(
      {
        AZURE_CLIENT_ID: '',
        AZURE_TENANT_ID: '',
        AZURE_CLIENT_SECRET: '',
        AZURE_CLIENT_CERTIFICATE_PATH: '',
        AZURE_FEDERATED_TOKEN_FILE: '',
      },
      () => createAzureCredential(),
    );
    expect(DefaultAzureCredential).toHaveBeenCalledOnce();
  });
  it.each(['secret', 'certificate'])(
    'ignores cleared lower-priority files for a selected %s identity',
    async (mode) => {
      mockProcessEnv({ AZURE_FEDERATED_TOKEN_FILE: '/fixture/host-token' });
      await cliState.withEnvFileOverrides(
        {
          ...principal('file'),
          AZURE_FEDERATED_TOKEN_FILE: '',
          AZURE_CLIENT_SECRET: mode === 'secret' ? 'fixture-secret' : '',
          AZURE_CLIENT_CERTIFICATE_PATH: mode === 'certificate' ? '/fixture/file.pem' : '',
        },
        () => createAzureCredential(),
      );
      if (mode === 'secret') {
        expect(ClientSecretCredential).toHaveBeenCalledOnce();
      } else {
        expect(ClientCertificateCredential).toHaveBeenCalledOnce();
      }
      expect(DefaultAzureCredential).not.toHaveBeenCalled();
    },
  );

  it.each([
    'AZURE_CLIENT_ID',
    'AZURE_TENANT_ID',
    'AZURE_FEDERATED_TOKEN_FILE',
    'AZURE_CLIENT_CERTIFICATE_PATH',
  ])('does not restore host identity through an explicitly empty %s selector', async (name) => {
    mockProcessEnv({
      AZURE_CLIENT_ID: 'host-client',
      AZURE_TENANT_ID: 'host-tenant',
      ...(name === 'AZURE_CLIENT_CERTIFICATE_PATH'
        ? { AZURE_CLIENT_CERTIFICATE_PATH: '/fixture/host.pem' }
        : { AZURE_FEDERATED_TOKEN_FILE: '/fixture/host-token' }),
    });
    await cliState.withEnvFileOverrides({ [name]: '' }, async () => {
      await expect(createAzureCredential()).rejects.toThrow('empty');
    });
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
    expect(WorkloadIdentityCredential).not.toHaveBeenCalled();
    expect(ClientCertificateCredential).not.toHaveBeenCalled();
  });

  it.each(['true', 'TRUE', '1'])(
    'forwards file-only certificate password and chain=%s overrides with ambient identity',
    async (flag) => {
      mockProcessEnv({
        AZURE_CLIENT_ID: 'ambient-client',
        AZURE_TENANT_ID: 'ambient-tenant',
        AZURE_CLIENT_CERTIFICATE_PATH: '/fixture/ambient.pem',
        AZURE_CLIENT_CERTIFICATE_PASSWORD: 'old-password',
        AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: 'false',
      });
      await cliState.withEnvFileOverrides(
        {
          AZURE_CLIENT_CERTIFICATE_PASSWORD: 'file-password',
          AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: flag,
        },
        () => createAzureCredential(),
      );
      expect(ClientCertificateCredential).toHaveBeenCalledWith(
        'ambient-tenant',
        'ambient-client',
        {
          certificatePath: '/fixture/ambient.pem',
          certificatePassword: 'file-password',
        },
        { authorityHost: undefined, sendCertificateChain: true },
      );
      expect(DefaultAzureCredential).not.toHaveBeenCalled();
    },
  );
  it('preserves user-assigned managed identity selection from an env file', async () => {
    await cliState.withEnvFileOverrides({ AZURE_CLIENT_ID: 'managed-client' }, () =>
      createAzureCredential(),
    );
    expect(DefaultAzureCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        managedIdentityClientId: 'managed-client',
        workloadIdentityClientId: 'managed-client',
      }),
    );
    expect(ClientSecretCredential).not.toHaveBeenCalled();
  });
  it('forwards the scoped federated token file to workload identity', async () => {
    await cliState.withEnvFileOverrides(
      {
        AZURE_CLIENT_ID: 'workload-client',
        AZURE_TENANT_ID: 'tenant',
        AZURE_FEDERATED_TOKEN_FILE: '/fixture/token',
      },
      () => createAzureCredential(),
    );
    expect(WorkloadIdentityCredential).toHaveBeenCalledWith({
      clientId: 'workload-client',
      tenantId: 'tenant',
      tokenFilePath: '/fixture/token',
      authorityHost: undefined,
    });
    expect(DefaultAzureCredential).toHaveBeenCalledOnce();
  });
  it('forwards a scoped client certificate with the existing environment auth precedence', async () => {
    await cliState.withEnvFileOverrides(
      {
        AZURE_CLIENT_ID: 'certificate-client',
        AZURE_TENANT_ID: 'tenant',
        AZURE_CLIENT_CERTIFICATE_PATH: '/fixture/certificate.pem',
      },
      () => createAzureCredential(),
    );
    expect(ClientCertificateCredential).toHaveBeenCalledWith(
      'tenant',
      'certificate-client',
      { certificatePath: '/fixture/certificate.pem', certificatePassword: undefined },
      { authorityHost: undefined, sendCertificateChain: false },
    );
    expect(DefaultAzureCredential).not.toHaveBeenCalled();
  });
});
