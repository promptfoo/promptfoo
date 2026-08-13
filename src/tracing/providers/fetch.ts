import logger from '../../logger';
import { TraceProviderError } from './types';

export { fetchWithProxy } from '../../util/fetch/index';

export const MAX_TRACE_RESPONSE_BYTES = 10 * 1024 * 1024;

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
    if (byteLength > MAX_TRACE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new TraceProviderError(`${providerName} trace exceeds the maximum response size`);
    }
    body += decoder.decode(value, { stream: true });
  }
}
