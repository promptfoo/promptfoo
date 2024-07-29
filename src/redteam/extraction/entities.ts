import dedent from 'dedent';
import logger from '../../logger';
import { ApiProvider } from '../../types';
import { callExtraction, formatPrompts } from './util';

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  const prompt = dedent`
    Extract persons, brands, or organizations from the following prompts and return them as a list:

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
