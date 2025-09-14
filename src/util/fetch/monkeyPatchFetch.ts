import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, KA_ENDPOINT, R_ENDPOINT } from '../../constants.js';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud.js';
import logger, { logRequestResponse } from '../../logger.js';

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

const originalFetch = global.fetch;

/**
 * Enhanced fetch wrapper that adds logging, authentication, and error handling
 */
export async function monkeyPatchFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const [url, options] = args;
  const NO_LOG_URLS = [KA_ENDPOINT, R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];
  const logEnabled = !NO_LOG_URLS.some((logUrl) => url.toString().startsWith(logUrl));

  const opts = {
    ...options,
  };

  if (
    (typeof url === 'string' && url.startsWith(CLOUD_API_HOST)) ||
    (url instanceof URL && url.host === CLOUD_API_HOST.replace(/^https?:\/\//, ''))
  ) {
    const token = cloudConfig.getApiKey();
    opts.headers = {
      ...(options?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }
  try {
    const response = await originalFetch(url, opts);

    if (logEnabled) {
      logRequestResponse({
        url: url.toString(),
        requestBody: opts.body,
        requestMethod: opts.method || 'GET',
        response,
      });
    }

    return response;
  } catch (e) {
    if (logEnabled) {
      logRequestResponse({
        url: url.toString(),
        requestBody: opts.body,
        requestMethod: opts.method || 'GET',
        response: null,
        error: true,
      });
      if (isConnectionError(e as Error)) {
        logger.error(
          `Connection error, please check your network connectivity to the host: ${url} ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? `or Proxy: ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY}` : ''}`,
        );
        throw e;
      }
      logger.error(
        `Error in fetch: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)} ${e instanceof Error ? e.stack : ''}`,
      );
    }
    throw e;
  }
}
