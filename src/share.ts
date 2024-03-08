import { fetchWithProxy } from './fetch';
import { REMOTE_API_BASE_URL, REMOTE_APP_BASE_URL } from './constants';

import type { EvaluateSummary, SharedResults, UnifiedConfig } from './types';

export async function createShareableUrl(
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
): Promise<string> {
  const sharedResults: SharedResults = {
    data: {
      version: 2,
      // TODO(ian): Take date from results, if applicable.
      createdAt: new Date().toISOString(),
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

  const { id } = (await response.json()) as { id: string };
  const appBaseUrl =
    typeof config.sharing === 'object' ? config.sharing.appBaseUrl : REMOTE_APP_BASE_URL;
  return `${REMOTE_APP_BASE_URL}/eval/${id}`;
}
