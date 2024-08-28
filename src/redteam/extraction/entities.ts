import dedent from 'dedent';
import logger from '../../logger';
import type { ApiProvider } from '../../types';
import { extractJsonObjects } from '../../util/json';
import { callExtraction, formatPrompts } from './util';

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  const prompt = dedent`
    Extract names, brands, organizations, or IDs from the following prompts and return them as a JSON array of strings:

    ${formatPrompts(prompts)}

    Your response should be a valid JSON object with a key "entities" containing an array of the extracted entities.
  `;

  const output = await callExtraction(provider, prompt);
  let entities: string[] = [];
  logger.warn(`Extracted entities: ${output}`);

  try {
    const result = extractJsonObjects(output)[0] as { entities: string[] };
    entities = result?.entities ?? [];
    if (!Array.isArray(entities) || !entities.every((item) => typeof item === 'string')) {
      throw new Error('Invalid JSON format');
    }
  } catch (error) {
    logger.error('Failed to parse entities from JSON:', error);
    throw new Error(`Failed to parse entities from JSON: ${error}`);
  }

  if (entities.length === 0) {
    logger.debug('No entities were extracted from the prompts.');
  }

  return entities;
}
