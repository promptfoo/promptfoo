import dedent from 'dedent';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import type { ApiProvider } from '../../types';
import type { RedTeamTask } from './util';
import { callExtraction, fetchRemoteGeneration, formatPrompts } from './util';

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  const useRemoteGeneration = !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION', false);

  if (useRemoteGeneration) {
    try {
      const result = await fetchRemoteGeneration('entities' as RedTeamTask, prompts);
      return result as string[];
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

  return callExtraction(provider, prompt, (output: string) => {
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
