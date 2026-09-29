import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../../src/envars';
import { parseAzureBlobUri, readAzureBlobText } from '../../src/util/azureBlob';

const mocks = vi.hoisted(() => {
  const downloadToBuffer = vi.fn();
  const getBlobClient = vi.fn(() => ({ downloadToBuffer }));
  const getContainerClient = vi.fn(() => ({ getBlobClient }));
  const serviceClient = { getContainerClient };
  const fromConnectionString = vi.fn(() => serviceClient);
  const blobServiceClient = vi.fn(function BlobServiceClientMock() {
    return serviceClient;
  });
  Object.assign(blobServiceClient, { fromConnectionString });

  return {
    blobServiceClient,
    downloadToBuffer,
    fromConnectionString,
    getBlobClient,
    getContainerClient,
    serviceClient,
    defaultAzureCredential: vi.fn(function DefaultAzureCredentialMock() {
      return { credential: 'default' };
    }),
  };
});

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: mocks.blobServiceClient,
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: mocks.defaultAzureCredential,
}));

vi.mock('../../src/envars', async () => ({
  ...(await vi.importActual('../../src/envars')),
  getEnvString: vi.fn(),
}));

describe('Azure Blob test-set loading', () => {
  beforeEach(() => {
    vi.mocked(getEnvString).mockReset().mockReturnValue('');
    mocks.downloadToBuffer.mockReset().mockResolvedValue(Buffer.from('blob text', 'utf8'));
    mocks.getBlobClient.mockReset().mockReturnValue({
      downloadToBuffer: mocks.downloadToBuffer,
    });
    mocks.getContainerClient.mockReset().mockReturnValue({
      getBlobClient: mocks.getBlobClient,
    });
    mocks.fromConnectionString.mockReset().mockReturnValue(mocks.serviceClient);
    mocks.blobServiceClient.mockReset().mockImplementation(function BlobServiceClientMock() {
      return mocks.serviceClient;
    });
    mocks.defaultAzureCredential
      .mockReset()
      .mockImplementation(function DefaultAzureCredentialMock() {
        return { credential: 'default' };
      });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('parses az:// account, container, blob, and SAS query string', () => {
    expect(
      parseAzureBlobUri('az://appliedciblobdata/data/ianw/cyber-evals/tests.json?sp=r&sig=abc'),
    ).toEqual({
      accountName: 'appliedciblobdata',
      containerName: 'data',
      blobName: 'ianw/cyber-evals/tests.json',
      sasToken: '?sp=r&sig=abc',
    });
  });

  it('preserves leading and repeated slashes in Azure blob names', () => {
    expect(parseAzureBlobUri('az://account/container//folder//tests.json')).toEqual({
      accountName: 'account',
      containerName: 'container',
      blobName: '/folder//tests.json',
      sasToken: '',
    });
  });

  it('rejects URIs without a blob path', () => {
    expect(() => parseAzureBlobUri('az://account/container')).toThrow('blob path is missing');
  });

  it('redacts SAS query strings while preserving URI fragments in parse errors', () => {
    expect(() => parseAzureBlobUri('az://account/container?sp=r&sig=secret#preview')).toThrow(
      'Invalid Azure Blob Storage URI "az://account/container?<redacted>#preview": blob path is missing.',
    );
  });

  it('uses URI SAS authentication when a query string is present', async () => {
    const result = await readAzureBlobText('az://account/container/path/tests.json?sp=r&sig=abc');

    expect(result).toBe('blob text');
    expect(mocks.blobServiceClient).toHaveBeenCalledWith(
      'https://account.blob.core.windows.net?sp=r&sig=abc',
    );
    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
    expect(mocks.defaultAzureCredential).not.toHaveBeenCalled();
    expect(mocks.getContainerClient).toHaveBeenCalledWith('container');
    expect(mocks.getBlobClient).toHaveBeenCalledWith('path/tests.json');
  });

  it('uses AZURE_STORAGE_CONNECTION_STRING when no SAS query string is present', async () => {
    vi.mocked(getEnvString).mockReturnValue('UseDevelopmentStorage=true');

    const result = await readAzureBlobText('az://account/container/path/tests.json');

    expect(result).toBe('blob text');
    expect(getEnvString).toHaveBeenCalledWith('AZURE_STORAGE_CONNECTION_STRING');
    expect(mocks.fromConnectionString).toHaveBeenCalledWith('UseDevelopmentStorage=true');
    expect(mocks.defaultAzureCredential).not.toHaveBeenCalled();
  });

  it('rejects connection strings that target a different storage account', async () => {
    vi.mocked(getEnvString).mockReturnValue(
      'DefaultEndpointsProtocol=https;AccountName=otheraccount;AccountKey=secret',
    );

    await expect(readAzureBlobText('az://account/container/path/tests.json')).rejects.toThrow(
      'AZURE_STORAGE_CONNECTION_STRING targets storage account "otheraccount", but the az:// URI targets "account".',
    );
    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });

  it('falls back to DefaultAzureCredential when no SAS or connection string is present', async () => {
    const result = await readAzureBlobText('az://account/container/path/tests.json');

    expect(result).toBe('blob text');
    expect(mocks.defaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(mocks.blobServiceClient).toHaveBeenCalledWith('https://account.blob.core.windows.net', {
      credential: 'default',
    });
  });

  it('rejects non-SAS query strings instead of dropping configured credentials', async () => {
    vi.mocked(getEnvString).mockReturnValue(
      'DefaultEndpointsProtocol=https;AccountName=account;AccountKey=secret',
    );

    await expect(
      readAzureBlobText('az://account/container/path/tests.json?snapshot=2026-05-19'),
    ).rejects.toThrow('query string must be a SAS token containing a sig parameter');
    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
    expect(mocks.defaultAzureCredential).not.toHaveBeenCalled();
  });

  it('redacts SAS query strings from read errors', async () => {
    mocks.downloadToBuffer.mockRejectedValueOnce(new Error('boom'));

    await expect(
      readAzureBlobText('az://account/container/path/tests.json?sp=r&sig=secret'),
    ).rejects.toThrow(
      'Failed to read Azure Blob Storage URI "az://account/container/path/tests.json?<redacted>": boom',
    );
  });

  it('redacts SAS query strings repeated in SDK error details', async () => {
    mocks.downloadToBuffer.mockRejectedValueOnce(
      new Error(
        'Request failed for https://account.blob.core.windows.net/container/path/tests.json?sp=r&sig=secret',
      ),
    );

    await expect(
      readAzureBlobText('az://account/container/path/tests.json?sp=r&sig=secret'),
    ).rejects.toThrow(
      'Request failed for https://account.blob.core.windows.net/container/path/tests.json?<redacted>',
    );
  });
});
