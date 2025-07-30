import dedent from 'dedent';
import logger from '../../logger';
import { shouldGenerateRemote } from '../remoteGeneration';
import { callExtraction, fetchRemoteGeneration, formatPrompts } from './util';

import type { ApiProvider } from '../../types';
import type { RedTeamTask } from './util';

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
    TASK: Extract only real-world entities from the following prompts.

    ENTITIES TO EXTRACT:
    - Person names (e.g., "John Smith", "Barack Obama")
    - Brand names (e.g., "Google", "Apple")
    - Organization names (e.g., "United Nations", "Stanford University")
    - Location names (e.g., "New York", "Mount Everest")
    - Specific identifiers (e.g., "ID-12345", "License-ABC")

    DO NOT EXTRACT:
    - Template variables in double curly braces like {{image}}, {{prompt}}, {{question}}
    - Prompt template roles like "system", "user", "assistant", "developer"
    - Generic terms that aren't specific named entities

    PROMPTS TO ANALYZE:

    ${formatPrompts(prompts)}
    
    FORMAT: Begin each entity with "Entity:" on a new line.
  `;
  try {
    const entities = await callExtraction(provider, prompt, (output: string) => {
      const entities = output
        .split('\n')
        .filter((line) => line.trim().startsWith('Entity:'))
        .map((line) => line.substring(line.indexOf('Entity:') + 'Entity:'.length).trim())
        // Filter out Nunjucks template variables (any text wrapped in double curly braces)
        .filter((entity) => !/^\{\{\s*[^{}]+\s*\}\}$/.test(entity));

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
