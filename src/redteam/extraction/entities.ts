import dedent from 'dedent';
import logger from '../../logger';
import type { ApiProvider } from '../../types';
import { createRedTeamGenerationProvider } from '../providers/generation';
import { callExtraction, formatPrompts } from './util';

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  try {
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
  } catch (error) {
    // Fallback to Red Team Generation Provider
    logger.warn(
      `Error using main extraction method, falling back to Red Team Generation: ${error}`,
    );
    const redTeamProvider = createRedTeamGenerationProvider({ task: 'entities' });

    const result = await redTeamProvider.callApi('', {
      prompt: { raw: '', label: 'purpose' },
      vars: { prompts },
    });

    if ('error' in result) {
      throw new Error(`Error extracting entities: ${result.error}`);
    }

    return result.output as string[];
  }
}
