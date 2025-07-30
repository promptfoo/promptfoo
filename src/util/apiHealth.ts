import { getEnvString } from '../envars';
import { fetchWithTimeout } from '../fetch';
import { CloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

interface HealthResponse {
  status: string;
  message: string;
}

/**
 * Checks the health of the remote API.
 * @param url - The URL to check.
 * @returns A promise that resolves to the health check response.
 */
export async function checkRemoteHealth(url: string): Promise<HealthResponse> {
  logger.debug(
    `[CheckRemoteHealth] Checking API health: ${JSON.stringify({
      url,
      // Log environment variables that might affect network requests
      env: {
        httpProxy: getEnvString('HTTP_PROXY') || getEnvString('http_proxy'),
        httpsProxy: getEnvString('HTTPS_PROXY') || getEnvString('https_proxy'),
        allProxy: getEnvString('ALL_PROXY') || getEnvString('all_proxy'),
        noProxy: getEnvString('NO_PROXY') || getEnvString('no_proxy'),
        nodeExtra: getEnvString('NODE_EXTRA_CA_CERTS'),
        nodeTls: getEnvString('NODE_TLS_REJECT_UNAUTHORIZED'),
      },
    })}`,
  );

  try {
    const cloudConfig = new CloudConfig();
    const requestOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    logger.debug(
      `[CheckRemoteHealth] Making fetch request: ${JSON.stringify({
        url,
        options: requestOptions,
        timeout: 5000,
        nodeVersion: process.version,
      })}`,
    );

    const response = await fetchWithTimeout(url, requestOptions, 5000);

    if (!response.ok) {
      logger.debug(
        `[CheckRemoteHealth] API health check failed with non-OK response: ${JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          url,
        })}`,
      );
      return {
        status: 'ERROR',
        message: `Failed to connect: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    logger.debug(`[CheckRemoteHealth] API health check response: ${JSON.stringify({ data })}`);

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
    // Type guard for Error objects
    const error = err instanceof Error ? err : new Error(String(err));

    // If it's a timeout error, return a softer message
    if (error.name === 'TimeoutError') {
      return {
        status: 'OK',
        message: 'API health check timed out, proceeding anyway',
      };
    }

    // Handle certificate errors specifically
    if (error.message.includes('certificate')) {
      return {
        status: 'ERROR',
        message: `Network error: SSL/Certificate issue detected - ${error.message}`,
      };
    }

    // For other network errors, include more details including the cause if available
    const cause = 'cause' in error ? ` (Cause: ${error.cause})` : '';
    const code = 'code' in error ? ` [${error['code']}]` : '';

    logger.debug(
      `[CheckRemoteHealth] API health check failed: ${JSON.stringify({
        error: error.message,
        url,
      })}`,
    );

    return {
      status: 'ERROR',
      message: `Network error${code}: ${error.message}${cause}\nURL: ${url}`,
    };
  }
}
