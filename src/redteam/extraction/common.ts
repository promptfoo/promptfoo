import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';

export const REMOTE_GENERATION_URL = 'https://functions.promptfoo.dev';

export const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
});

export type RedTeamTask = 'purpose' | 'entities';

export async function fetchRemoteGeneration(
  task: RedTeamTask,
  prompts: string[],
): Promise<string | string[]> {
  try {
    const body = {
      task,
      prompts,
    };

    const response = await fetchWithCache(
      REMOTE_GENERATION_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      REQUEST_TIMEOUT_MS,
      'json',
    );

    const parsedResponse = RedTeamGenerationResponse.parse(response.data);
    return parsedResponse.result;
  } catch (error) {
    logger.warn(`Error using remote generation for task '${task}': ${error}`);
    throw error;
  }
}
