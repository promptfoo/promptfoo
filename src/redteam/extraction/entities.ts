import dedent from 'dedent';
import logger from '../../logger';
import type { ApiProvider } from '../../types';
import { shouldGenerateRemote } from '../remoteGeneration';
import type { RedTeamTask } from './util';
import { callExtraction, fetchRemoteGeneration, formatPrompts } from './util';

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  if (shouldGenerateRemote()) {
    try {
      const result = await fetchRemoteGeneration('entities' as RedTeamTask, prompts);
      return result as string[];
    } catch (error) {
      logger.warn(
        `[Entity Extraction] Failed, returning 0 entities. Error using remote generation: ${error}`,
      );
      return [];
    }
  }

  // Fallback to local extraction
  const prompt = dedent`
    Extract names, brands, organizations, or IDs from the following prompts and return them as a list:

    ${formatPrompts(prompts)}

    Each line in your response must begin with the string "Entity:".
  `;
  try {
    const entities = await callExtraction(provider, prompt, (output: string) => {
      const entities = output
        .split('\n')
        .filter((line) => line.trim().startsWith('Entity:'))
        .map((line) => line.substring(line.indexOf('Entity:') + 'Entity:'.length).trim());

      if (entities.length === 0) {
        logger.debug('No entities were extracted from the prompts.');
      }

      return entities;
    });

    return entities;
  } catch (error) {
    logger.warn(`Error using local extraction, returning empty list: ${error}`);
    return [];
  }
}
