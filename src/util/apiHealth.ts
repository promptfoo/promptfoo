import { getEnvBool } from '../envars';
import { fetchWithProxy } from '../fetch';
import { CloudConfig } from '../globalConfig/cloud';

export interface HealthResponse {
  status: string;
  message: string;
}

/**
 * Gets the URL for checking remote API health based on configuration.
 * @returns The health check URL, or null if remote generation is disabled.
 */
export function getRemoteHealthUrl(): string | null {
  if (getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION')) {
    return null;
  }

  const customUrl = process.env.PROMPTFOO_REMOTE_GENERATION_URL;
  if (customUrl) {
    return customUrl.replace(/\/task$/, '/health');
  }

  const cloudConfig = new CloudConfig();
  if (cloudConfig.isEnabled()) {
    return `${cloudConfig.getApiHost()}/health`;
  }

  return 'https://api.promptfoo.app/health';
}

/**
 * Checks the health of the remote API.
 * @param url - The URL to check.
 * @returns A promise that resolves to the health check response.
 */
export async function checkRemoteHealth(url: string): Promise<HealthResponse> {
  try {
    const cloudConfig = new CloudConfig();
    const response = await fetchWithProxy(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      // Increased timeout to 5 seconds for first request
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        status: 'ERROR',
        message: `Failed to connect: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
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

    return {
      status: 'ERROR',
      message: `Network error: ${err}`,
    };
  }
}
