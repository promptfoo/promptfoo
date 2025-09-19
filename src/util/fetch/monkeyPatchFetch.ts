import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

/**
 * Enhanced fetch wrapper that adds logging, authentication, and error handling
 */
// biome-ignore lint/style/noRestrictedGlobals: we need raw fetch here
export async function monkeyPatchFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const [url, options] = args;
  const NO_LOG_URLS = [R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];
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
    // biome-ignore lint/style/noRestrictedGlobals: we need raw fetch here
    const response = await fetch(url, opts);

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
