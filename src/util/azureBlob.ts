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

function sanitizeAzureBlobUriForError(uri: string): string {
  const queryStart = uri.indexOf('?');
  if (queryStart < 0) {
    return uri;
  }

  const fragmentStart = uri.indexOf('#', queryStart);
  return fragmentStart >= 0
    ? `${uri.slice(0, queryStart)}?<redacted>${uri.slice(fragmentStart)}`
    : `${uri.slice(0, queryStart)}?<redacted>`;
}

function createAzureBlobUriError(uri: string, detail: string): Error {
  const sanitizedUri = sanitizeAzureBlobUriForError(uri);
  return new Error(
    `Invalid Azure Blob Storage URI "${sanitizedUri}": ${detail}. Expected az://<account>/<container>/<blob>.`,
  );
}

function formatAzureBlobReadError(uri: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Failed to read Azure Blob Storage URI "${sanitizeAzureBlobUriForError(uri)}": ${detail}`,
  );
}

function decodeAzureBlobPathComponent(component: string, uri: string): string {
  try {
    return decodeURIComponent(component);
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

  const pathWithoutLeadingSlash = parsed.pathname.startsWith('/')
    ? parsed.pathname.slice(1)
    : parsed.pathname;
  const containerSeparatorIndex = pathWithoutLeadingSlash.indexOf('/');
  if (containerSeparatorIndex < 0) {
    throw createAzureBlobUriError(uri, 'blob path is missing');
  }

  const rawContainerName = pathWithoutLeadingSlash.slice(0, containerSeparatorIndex);
  const rawBlobName = pathWithoutLeadingSlash.slice(containerSeparatorIndex + 1);
  if (!rawContainerName) {
    throw createAzureBlobUriError(uri, 'container name is missing');
  }
  if (!rawBlobName) {
    throw createAzureBlobUriError(uri, 'blob path is missing');
  }

  return {
    accountName,
    containerName: decodeAzureBlobPathComponent(rawContainerName, uri),
    blobName: decodeAzureBlobPathComponent(rawBlobName, uri),
    sasToken: parsed.search,
  };
}

function isAzureBlobSasToken(queryString: string): boolean {
  const searchParams = new URLSearchParams(
    queryString.startsWith('?') ? queryString.slice(1) : queryString,
  );
  return searchParams.has('sig');
}

function getConnectionStringAccountName(connectionString: string): string | undefined {
  for (const segment of connectionString.split(';')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim().toLowerCase();
    if (key === 'accountname') {
      const accountName = segment.slice(separatorIndex + 1).trim();
      return accountName || undefined;
    }
  }

  return undefined;
}

function assertConnectionStringMatchesUriAccount(
  uri: string,
  parts: AzureBlobUriParts,
  connectionString: string,
): void {
  const connectionStringAccountName = getConnectionStringAccountName(connectionString);
  if (
    connectionStringAccountName &&
    connectionStringAccountName.toLowerCase() !== parts.accountName.toLowerCase()
  ) {
    throw formatAzureBlobReadError(
      uri,
      new Error(
        `AZURE_STORAGE_CONNECTION_STRING targets storage account "${connectionStringAccountName}", but the az:// URI targets "${parts.accountName}".`,
      ),
    );
  }
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
    if (!isAzureBlobSasToken(parts.sasToken)) {
      throw createAzureBlobUriError(
        uri,
        'query string must be a SAS token containing a sig parameter',
      );
    }
    return new BlobServiceClient(accountUrl);
  }

  const connectionString = getEnvString('AZURE_STORAGE_CONNECTION_STRING');
  if (connectionString) {
    assertConnectionStringMatchesUriAccount(uri, parts, connectionString);
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
