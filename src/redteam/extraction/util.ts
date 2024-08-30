import dedent from 'dedent';
import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { ApiProvider } from '../../types';

export const REMOTE_GENERATION_URL = 'https://api.promptfoo.dev/v1/generate';

export const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
});

export type RedTeamTask = 'purpose' | 'entities';

/**
 * Fetches remote generation results for a given task and prompts.
 *
 * @param task - The type of task to perform ('purpose' or 'entities').
 * @param prompts - An array of prompts to process.
 * @returns A Promise that resolves to either a string or an array of strings, depending on the task.
 * @throws Will throw an error if the remote generation fails.
 *
 * @example
 * ```typescript
 * const result = await fetchRemoteGeneration('purpose', ['What is the purpose of this app?']);
 * console.log(result); // Outputs the generated purpose as a string
 * ```
 */
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

export async function callExtraction<T>(
  provider: ApiProvider,
  prompt: string,
  processOutput: (output: string) => T,
): Promise<T> {
  const { output, error } = await provider.callApi(prompt);

  if (error) {
    logger.error(`Error in extraction: ${error}`);
    throw new Error(`Failed to perform extraction: ${error}`);
  }

  if (typeof output !== 'string') {
    logger.error(`Invalid output from extraction. Got: ${output}`);
    throw new Error(`Invalid extraction output: expected string, got: ${output}`);
  }

  return processOutput(output);
}

export function formatPrompts(prompts: string[]): string {
  return prompts
    .map(
      (prompt) => dedent`
    <Prompt>
    ${prompt}
    </Prompt>`,
    )
    .join('\n');
}
