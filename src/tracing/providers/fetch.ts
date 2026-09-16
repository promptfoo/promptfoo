import { TRACE_CREDENTIAL_PATH_SEGMENT } from '../../contracts/traceProviderEndpoint';
import logger from '../../logger';
import { TraceProviderError } from './types';

export { fetchWithProxy } from '../../util/fetch/index';

export const MAX_TRACE_RESPONSE_BYTES = 10 * 1024 * 1024;

export function validateTraceProviderEndpoint(endpoint: string, providerName: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`${providerName} provider endpoint must be a valid HTTP or HTTPS URL`);
  }

  const hasCredentialPath = url.pathname.split('/').some((segment) => {
    try {
      return TRACE_CREDENTIAL_PATH_SEGMENT.test(decodeURIComponent(segment));
    } catch {
      return true;
    }
  });
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hasCredentialPath
  ) {
    throw new Error(
      `${providerName} provider endpoint must be an HTTP or HTTPS URL without credentials, query parameters, or fragments`,
    );
  }
}

export async function releaseResponse(response: Response, providerName: string): Promise<void> {
  try {
    await response.body?.cancel();
  } catch (error) {
    logger.debug(`[${providerName}Provider] Failed to release response body: ${error}`);
  }
}

export async function readLimitedResponse(
  response: Response,
  providerName: string,
  maxResponseBytes = MAX_TRACE_RESPONSE_BYTES,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return body + decoder.decode();
    }

    byteLength += value.byteLength;
    if (byteLength > maxResponseBytes) {
      await reader.cancel();
      throw new TraceProviderError(`${providerName} trace exceeds the maximum response size`);
    }
    body += decoder.decode(value, { stream: true });
  }
}
