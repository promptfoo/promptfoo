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
  logger.debug('Checking API health', { url });

  try {
    const cloudConfig = new CloudConfig();
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
      5000,
    );

    if (!response.ok) {
      logger.debug('API health check failed with non-OK response', {
        status: response.status,
        statusText: response.statusText,
      });
      return {
        status: 'ERROR',
        message: `Failed to connect: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    logger.debug('API health check response', { data });

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

    logger.debug('API health check failed', {
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
