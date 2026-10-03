import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { AnonymousCredential, BlobClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { CreateJobRequestSchema } from '../../src/types/api/eval';
import { readAzureBlobText } from '../../src/util/azureBlob';
import { mockProcessEnv } from './utils';

const principal = {
  AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
  AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000002',
  AZURE_CLIENT_SECRET: 'fixture-secret',
};
const connectionString =
  'DefaultEndpointsProtocol=https;AccountName=account;AccountKey=Zml4dHVyZQ==;EndpointSuffix=core.windows.net';
let restoreEnv: () => void;
let credential: BlobClient['credential'] | undefined;

beforeEach(() => {
  restoreEnv = mockProcessEnv({
    AZURE_STORAGE_CONNECTION_STRING: connectionString,
    AZURE_CLIENT_ID: undefined,
    AZURE_TENANT_ID: undefined,
    AZURE_CLIENT_SECRET: undefined,
    AZURE_AUTHORITY_HOST: undefined,
  });
  credential = undefined;
  vi.spyOn(BlobClient.prototype, 'downloadToBuffer').mockImplementation(async function (
    this: BlobClient,
  ) {
    credential = this.credential;
    expect(this.url).toContain('https://account.blob.core.windows.net/container/tests.json');
    return Buffer.from('fixture');
  });
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('Azure Blob authentication scopes with the installed SDK', () => {
  it.each([connectionString, ''])(
    'honors a parsed job connection string override of %j',
    async (value) => {
      const parsed = CreateJobRequestSchema.parse({
        providers: ['echo'],
        prompts: ['fixture'],
        env: { AZURE_STORAGE_CONNECTION_STRING: value },
      });
      await cliState.withEnvFileOverrides(value ? principal : {}, () =>
        cliState.withEnv(parsed.env, () => readAzureBlobText('az://account/container/tests.json')),
      );
      expect(credential).toBeInstanceOf(
        value ? StorageSharedKeyCredential : DefaultAzureCredential,
      );
    },
  );

  it.each(['suite', 'file'] as const)(
    'preserves connection string precedence with a %s principal',
    async (scope) => {
      const read = () => readAzureBlobText('az://account/container/tests.json');
      const result =
        scope === 'suite'
          ? await cliState.withEnv(principal, read)
          : await cliState.withEnvFileOverrides(principal, read);
      expect(result).toBe('fixture');
      expect(credential).toBeInstanceOf(StorageSharedKeyCredential);
    },
  );

  it.each(['suite', 'file'] as const)(
    'forwards a %s principal to the installed SDK',
    async (scope) => {
      mockProcessEnv({ AZURE_STORAGE_CONNECTION_STRING: undefined });
      const read = () => readAzureBlobText('az://account/container/tests.json');
      await (scope === 'suite'
        ? cliState.withEnv(principal, read)
        : cliState.withEnvFileOverrides(principal, read));
      expect(credential).toBeInstanceOf(ClientSecretCredential);
    },
  );

  it.each([{ ...principal, AZURE_CLIENT_SECRET: '' }])(
    'rejects an incomplete selected principal without starting a download',
    async (env) => {
      mockProcessEnv({ AZURE_STORAGE_CONNECTION_STRING: undefined });
      await expect(
        cliState.withEnv(env, () => readAzureBlobText('az://account/container/tests.json')),
      ).rejects.toThrow('Scoped Azure service principal credentials are incomplete');
      expect(BlobClient.prototype.downloadToBuffer).not.toHaveBeenCalled();
    },
  );

  it('keeps a higher connection string ahead of a lower principal', async () => {
    await cliState.withEnvFileOverrides(principal, () =>
      cliState.withEnv({ AZURE_STORAGE_CONNECTION_STRING: connectionString }, () =>
        readAzureBlobText('az://account/container/tests.json'),
      ),
    );
    expect(credential).toBeInstanceOf(StorageSharedKeyCredential);
  });

  it('keeps connection string precedence within the same scope', async () => {
    await cliState.withEnv(
      { ...principal, AZURE_STORAGE_CONNECTION_STRING: connectionString },
      () => readAzureBlobText('az://account/container/tests.json'),
    );
    expect(credential).toBeInstanceOf(StorageSharedKeyCredential);
  });

  it('uses a lower principal when an empty connection string masks lower connection strings', async () => {
    await cliState.withEnvFileOverrides(
      { ...principal, AZURE_STORAGE_CONNECTION_STRING: connectionString },
      () =>
        cliState.withEnv({ AZURE_STORAGE_CONNECTION_STRING: '' }, () =>
          readAzureBlobText('az://account/container/tests.json'),
        ),
    );
    expect(credential).toBeInstanceOf(ClientSecretCredential);
  });

  it('preserves the ambient credential chain after an empty connection string mask', async () => {
    await cliState.withEnv({ AZURE_STORAGE_CONNECTION_STRING: '' }, () =>
      readAzureBlobText('az://account/container/tests.json'),
    );
    expect(credential).toBeInstanceOf(DefaultAzureCredential);
  });

  it('keeps explicit URI SAS authentication ahead of environment credentials', async () => {
    await cliState.withEnv({ AZURE_CLIENT_ID: '' }, () =>
      readAzureBlobText('az://account/container/tests.json?sig=fixture'),
    );
    expect(credential).toBeInstanceOf(AnonymousCredential);
  });
});
