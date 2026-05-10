import dedent from 'dedent';
import { z } from 'zod';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl } from '../remoteGeneration';

import type { ApiProvider, TokenUsage } from '../../types/index';

export const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
  tokenUsage: z.custom<TokenUsage>().optional(),
});

export type RedTeamTask = 'purpose' | 'entities';
export type ExtractionResult<T> = {
  result: T;
  tokenUsage?: TokenUsage;
};

class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly tokenUsage?: TokenUsage,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

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
  return (await fetchRemoteGenerationWithMetadata(task, prompts)).result;
}

export async function fetchRemoteGenerationWithMetadata(
  task: RedTeamTask,
  prompts: string[],
): Promise<ExtractionResult<string | string[]>> {
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
    };

    const response = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      getRequestTimeoutMs(),
      'json',
    );

    const parsedResponse = RedTeamGenerationResponse.parse(response.data);
    return {
      result: parsedResponse.result,
      ...(parsedResponse.tokenUsage ? { tokenUsage: parsedResponse.tokenUsage } : {}),
    };
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
  return (await callExtractionWithMetadata(provider, prompt, processOutput)).result;
}

export async function callExtractionWithMetadata<T>(
  provider: ApiProvider,
  prompt: string,
  processOutput: (output: string) => T,
): Promise<ExtractionResult<T>> {
  const { output, error, tokenUsage } = await provider.callApi(
    JSON.stringify([{ role: 'user', content: prompt }]),
  );
  const normalizedTokenUsage = tokenUsage
    ? {
        ...tokenUsage,
        ...(tokenUsage.numRequests === undefined ? { numRequests: 1 } : {}),
      }
    : { numRequests: 1 };

  if (error) {
    logger.error(`Error in extraction: ${error}`);
    throw new ExtractionError(`Failed to perform extraction: ${error}`, normalizedTokenUsage);
  }

  if (typeof output !== 'string') {
    logger.error(`Invalid output from extraction. Got: ${output}`);
    throw new ExtractionError(
      `Invalid extraction output: expected string, got: ${output}`,
      normalizedTokenUsage,
    );
  }

  return {
    result: processOutput(output),
    tokenUsage: normalizedTokenUsage,
  };
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
