import dedent from 'dedent';
import { fetchWithCache } from '../../cache';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { ApiProvider } from '../../types';
import { RedTeamGenerationResponse, REMOTE_GENERATION_URL } from './common';
import { callExtraction, formatPrompts } from './util';

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  const useRemoteGeneration = !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', false);

  if (useRemoteGeneration) {
    try {
      const body = {
        task: 'entities',
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
      return parsedResponse.result as string[];
    } catch (error) {
      logger.warn(`Error using remote generation, falling back to local extraction: ${error}`);
    }
  }

  // Fallback to local extraction
  const prompt = dedent`
    Extract names, brands, organizations, or IDs from the following prompts and return them as a list:

    ${formatPrompts(prompts)}

    Each line in your response must begin with the string "Entity:".
  `;

  return await callExtraction(provider, prompt, (output: string) => {
    const entities = output
      .split('\n')
      .filter((line) => line.trim().startsWith('Entity:'))
      .map((line) => line.substring(line.indexOf('Entity:') + 'Entity:'.length).trim());

    if (entities.length === 0) {
      logger.debug('No entities were extracted from the prompts.');
    }

    return entities;
  });
}
