import { getEnvString } from '../envars';

type AzureBlobServiceClient = {
  getContainerClient(containerName: string): {
    getBlobClient(blobName: string): {
      downloadToBuffer(): Promise<Buffer>;
    };
  };
};

export type AzureBlobUriParts = {
  accountName: string;
  containerName: string;
  blobName: string;
  sasToken: string;
};

function createAzureBlobUriError(uri: string, detail: string): Error {
  return new Error(
    `Invalid Azure Blob Storage URI "${uri}": ${detail}. Expected az://<account>/<container>/<blob>.`,
  );
}

function formatAzureBlobReadError(uri: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to read Azure Blob Storage URI "${uri}": ${detail}`);
}

function decodeAzureBlobPathSegment(segment: string, uri: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw createAzureBlobUriError(uri, 'path contains invalid percent-encoding');
  }
}

export function parseAzureBlobUri(uri: string): AzureBlobUriParts {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw createAzureBlobUriError(uri, 'URI could not be parsed');
  }

  if (parsed.protocol !== 'az:') {
    throw createAzureBlobUriError(uri, 'URI must use the az:// scheme');
  }

  const accountName = parsed.hostname.trim();
  if (!accountName) {
    throw createAzureBlobUriError(uri, 'storage account is missing');
  }

  const pathSegments = parsed.pathname
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeAzureBlobPathSegment(segment, uri));

  const [containerName, ...blobPathSegments] = pathSegments;
  if (!containerName) {
    throw createAzureBlobUriError(uri, 'container name is missing');
  }
  if (blobPathSegments.length === 0) {
    throw createAzureBlobUriError(uri, 'blob path is missing');
  }

  return {
    accountName,
    containerName,
    blobName: blobPathSegments.join('/'),
    sasToken: parsed.search,
  };
}

async function loadAzureStorageBlobPackage(uri: string) {
  try {
    return await import('@azure/storage-blob');
  } catch (error) {
    throw formatAzureBlobReadError(
      uri,
      new Error(
        `@azure/storage-blob is required for az:// test references. Install optional dependencies or add @azure/storage-blob to your project. ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
}

async function createAzureBlobServiceClient(
  uri: string,
  parts: AzureBlobUriParts,
): Promise<AzureBlobServiceClient> {
  const { BlobServiceClient } = await loadAzureStorageBlobPackage(uri);
  const accountUrl = `https://${parts.accountName}.blob.core.windows.net${parts.sasToken}`;

  if (parts.sasToken) {
    return new BlobServiceClient(accountUrl);
  }

  const connectionString = getEnvString('AZURE_STORAGE_CONNECTION_STRING');
  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString);
  }

  try {
    const { DefaultAzureCredential } = await import('@azure/identity');
    return new BlobServiceClient(accountUrl, new DefaultAzureCredential());
  } catch (error) {
    throw formatAzureBlobReadError(
      uri,
      new Error(
        `Default Azure credentials are unavailable. Set AZURE_STORAGE_CONNECTION_STRING, append a SAS query string to the az:// URI, or configure @azure/identity credentials. ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
}

/**
 * Reads a UTF-8 Azure Blob Storage object for test-set parsing.
 *
 * Accepted URI form: az://<account>/<container>/<blob>
 */
export async function readAzureBlobText(uri: string): Promise<string> {
  const parts = parseAzureBlobUri(uri);

  try {
    const blobServiceClient = await createAzureBlobServiceClient(uri, parts);
    const blobClient = blobServiceClient
      .getContainerClient(parts.containerName)
      .getBlobClient(parts.blobName);
    const content = await blobClient.downloadToBuffer();
    return content.toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to read Azure Blob Storage')) {
      throw error;
    }
    throw formatAzureBlobReadError(uri, error);
  }
}
