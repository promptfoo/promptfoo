import { URL } from 'url';
import { getAuthor } from './accounts';
import { REMOTE_API_BASE_URL, REMOTE_APP_BASE_URL } from './constants';
import { fetchWithProxy } from './fetch';
import logger from './logger';
import type { EvaluateSummary, SharedResults, UnifiedConfig } from './types';

/**
 * Removes authentication information (username and password) from a URL.
 *
 * This function addresses a security concern raised in GitHub issue #1184,
 * where sensitive authentication information was being displayed in the CLI output.
 * By default, we now strip this information to prevent accidental exposure of credentials.
 *
 * @param urlString - The URL string that may contain authentication information.
 * @returns A new URL string with username and password removed, if present.
 *          If URL parsing fails, it returns the original string.
 */
export function stripAuthFromUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch (error) {
    logger.warn('Failed to parse URL, returning original');
    return urlString;
  }
}

export async function createShareableUrl(
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  showAuth: boolean = false,
): Promise<string> {
  const sharedResults: SharedResults = {
    data: {
      version: 3,
      // TODO(ian): Take date from results, if applicable.
      createdAt: new Date().toISOString(),
      author: getAuthor(),
      results,
      config,
    },
  };

  const apiBaseUrl =
    typeof config.sharing === 'object' ? config.sharing.apiBaseUrl : REMOTE_API_BASE_URL;
  const response = await fetchWithProxy(`${apiBaseUrl}/api/eval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sharedResults),
  });

  const responseJson = (await response.json()) as { id?: string; error?: string };
  if (responseJson.error) {
    throw new Error(`Failed to create shareable URL: ${responseJson.error}`);
  }
  const appBaseUrl =
    typeof config.sharing === 'object' ? config.sharing.appBaseUrl : REMOTE_APP_BASE_URL;
  const fullUrl = `${appBaseUrl}/eval/${responseJson.id}`;

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}
