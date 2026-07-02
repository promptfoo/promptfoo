import dedent from 'dedent';
import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import { describeFetchError } from '../../util/fetch/errors';
import invariant from '../../util/invariant';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from '../remoteGeneration';
import { remoteGenerationContextPayload } from '../remoteGenerationContext';

import type { ApiProvider, RemoteGenerationContext } from '../../types/index';

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
 * @param generationContext - Resolved target context for routing the remote task.
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
  generationContext?: RemoteGenerationContext,
): Promise<string | string[]> {
  invariant(
    !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION'),
    'fetchRemoteGeneration should never be called when remote generation is disabled',
  );
  try {
    const body = {
      task,
      prompts,
      version: VERSION,
      email: getUserEmail(),
      ...remoteGenerationContextPayload(generationContext),
    };

    const response = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: getRemoteGenerationHeaders(),
        body: JSON.stringify(body),
      },
      getRequestTimeoutMs(),
      'json',
    );

    const parsedResponse = RedTeamGenerationResponse.parse(response.data);
    return parsedResponse.result;
  } catch (error) {
    logger.warn(`Error using remote generation for task '${task}': ${describeFetchError(error)}`);
    throw error;
  }
}

export async function callExtraction<T>(
  provider: ApiProvider,
  prompt: string,
  processOutput: (output: string) => T,
): Promise<T> {
  const { output, error } = await provider.callApi(
    JSON.stringify([{ role: 'user', content: prompt }]),
  );

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
