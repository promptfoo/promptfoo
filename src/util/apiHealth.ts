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
  logger.debug(
    `[CheckRemoteHealth] Checking API health: ${JSON.stringify({
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

// Cache of already checked healthy endpoints
const healthyEndpoints = new Map<string, boolean>();

/**
 * Checks the health of all required endpoints for generation.
 * Maintains a cache to avoid redundant checks of the same endpoint.
 * Throws an error if any required endpoint is unhealthy.
 *
 * @param endpoints - Array of objects containing URL and endpoint type
 */
export async function checkRequiredEndpoints(
  endpoints: Array<{ url: string | null; type: string }>,
): Promise<void> {
  // Filter out null URLs and deduplicate
  const urlsToCheck = endpoints
    .filter(({ url }) => url !== null)
    .filter(({ url }, index, self) => index === self.findIndex((e) => e.url === url));

  for (const { url, type } of urlsToCheck) {
    if (!url) continue; // Skip null/undefined URLs

    // Skip if already verified as healthy
    if (healthyEndpoints.has(url)) {
      logger.debug(`Already verified health of ${type} endpoint at ${url}, skipping check`);
      continue;
    }

    try {
      logger.debug(`Checking health of ${type} endpoint at ${url}`);
      const healthResult = await checkRemoteHealth(url);

      if (healthResult.status === 'OK') {
        logger.debug(`${type} API health check passed: ${healthResult.message}`);
        // Cache successful health check
        healthyEndpoints.set(url, true);
      } else {
        throw new Error(`${type} API health check failed: ${healthResult.message}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${type} API is not available: ${errorMessage}\n${type} generation cannot proceed. Consider using --verbose for more details.`,
      );
    }
  }
}
