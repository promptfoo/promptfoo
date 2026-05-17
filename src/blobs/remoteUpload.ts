import { getEnvBool } from '../envars';
import { isLoggedIntoCloud } from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

import type { BlobStoreResult } from './types';

interface RemoteBlobUploadTarget {
  url: string;
  apiKey: string;
}

function buildRemoteUploadTarget(): RemoteBlobUploadTarget | null {
  if (getEnvBool('PROMPTFOO_DISABLE_SHARING')) {
    return null;
  }

  const baseUrl = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();

  if (!baseUrl || !apiKey || !isLoggedIntoCloud()) {
    return null;
  }

  try {
    const url = new URL('/api/blobs', baseUrl);
    return { url: url.toString(), apiKey };
  } catch (error) {
    logger.debug('[RemoteBlob] Invalid remote blob URL', {
      error: error instanceof Error ? error.message : String(error),
      baseUrl,
    });
    return null;
  }
}

export function shouldAttemptRemoteBlobUpload(): boolean {
  return buildRemoteUploadTarget() !== null;
}

export async function uploadBlobRemote(
  buffer: Buffer,
  mimeType: string,
  context?: {
    evalId?: string;
    testIdx?: number;
    promptIdx?: number;
    location?: string;
    kind?: string;
  },
): Promise<BlobStoreResult | null> {
  const target = buildRemoteUploadTarget();
  if (!target) {
    return null;
  }

  try {
    const { fetchWithProxy } = await import('../util/fetch');
    const response = await fetchWithProxy(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.apiKey}`,
      },
      body: JSON.stringify({
        data: buffer.toString('base64'),
        mimeType,
        context,
      }),
    });

    if (response.status === 404 || response.status === 400) {
      logger.debug('[RemoteBlob] Remote blob upload unavailable', { status: response.status });
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      logger.debug('[RemoteBlob] Failed to upload blob', {
        status: response.status,
        statusText: response.statusText,
        body: text,
      });
      return null;
    }

    const data = (await response.json()) as BlobStoreResult;
    if (!data?.ref?.hash) {
      logger.debug('[RemoteBlob] Remote upload returned malformed response');
      return null;
    }
    return data;
  } catch (error) {
    logger.debug('[RemoteBlob] Error uploading blob', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
