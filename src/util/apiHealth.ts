import { fetchWithTimeout } from '../fetch';
import { CloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

export interface HealthResponse {
  status: string;
  message: string;
}

/**
 * Checks the health of the remote API.
 * @param url - The URL to check.
 * @returns A promise that resolves to the health check response.
 */
export async function checkRemoteHealth(url: string): Promise<HealthResponse> {
  logger.debug('[CheckRemoteHealth] Checking API health', {
    url,
    // Log environment variables that might affect network requests
    env: {
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
      allProxy: process.env.ALL_PROXY || process.env.all_proxy,
      noProxy: process.env.NO_PROXY || process.env.no_proxy,
      nodeExtra: process.env.NODE_EXTRA_CA_CERTS,
      nodeTls: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    },
  });

  try {
    const cloudConfig = new CloudConfig();
    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    logger.debug('[CheckRemoteHealth] Making fetch request', {
      requestOptions,
      timeout: 5000,
      nodeVersion: process.version,
    });

    const response = await fetchWithTimeout(url, requestOptions, 5000);

    if (!response.ok) {
      logger.debug('[CheckRemoteHealth] API health check failed with non-OK response', {
        status: response.status,
        statusText: response.statusText,
      });
      return {
        status: 'ERROR',
        message: `Failed to connect: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    logger.debug('[CheckRemoteHealth] API health check response', { data });

    if (data.status === 'OK') {
      return {
        status: 'OK',
        message: cloudConfig.isEnabled()
          ? 'Cloud API is healthy (using custom endpoint)'
          : 'Cloud API is healthy',
      };
    }

    if (data.status === 'DISABLED') {
      return {
        status: 'DISABLED',
        message: 'remote generation and grading are disabled',
      };
    }

    return {
      status: 'ERROR',
      message: data.message || 'Unknown error',
    };
  } catch (err) {
    // If it's a timeout error, return a softer message
    if (err instanceof Error && err.name === 'TimeoutError') {
      return {
        status: 'OK',
        message: 'API health check timed out, proceeding anyway',
      };
    }

    // Handle certificate errors specifically
    if (err instanceof Error && err.message.includes('certificate')) {
      return {
        status: 'ERROR',
        message: `Network error: SSL/Certificate issue detected - ${err.message}`,
      };
    }

    // For other network errors, include more details including the cause if available
    const errorMessage = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && 'cause' in err ? ` (Cause: ${err.cause})` : '';
    const code = err instanceof Error && 'code' in err ? ` [${err['code']}]` : '';

    logger.debug('[CheckRemoteHealth] API health check failed', {
      error: err,
      url,
      errorMessage,
      cause: err instanceof Error && 'cause' in err ? err.cause : undefined,
      code: err instanceof Error && 'code' in err ? err['code'] : undefined,
    });

    return {
      status: 'ERROR',
      message: `Network error${code}: ${errorMessage}${cause}\nURL: ${url}`,
    };
  }
}
