import fetch from 'node-fetch';

import type { EvaluateSummary, SharedResults, UnifiedConfig } from './types';

export async function createShareableUrl(
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
): Promise<string> {
  const sharedResults: SharedResults = {
    data: {
      version: 1,
      results,
      config,
    },
  };

  const response = await fetch('https://api.promptfoo.dev/eval', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sharedResults),
  });

  const { id } = (await response.json()) as { id: string };
  return `https://app.promptfoo.dev/eval/${id}`;
}
