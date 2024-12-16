import { fetchWithTimeout } from '../fetch';
import { CloudConfig } from '../globalConfig/cloud';

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
