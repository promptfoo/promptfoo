import dedent from 'dedent';
import logger from '../../logger';
import { ApiProvider } from '../../types';
import { ExtractionBase } from './base';

export class EntityExtractor extends ExtractionBase<string[]> {
  protected generatePrompt(prompts: string[]): string {
    return dedent`
      Extract persons, brands, or organizations from the following prompts and return them as a list:

      ${this.formatPrompts(prompts)}

      Each line in your response must begin with the string "Entity:".
    `;
  }

  protected processOutput(output: string): string[] {
    const entities = output
      .split('\n')
      .filter((line) => line.trim().startsWith('Entity:'))
      .map((line) => line.substring(line.indexOf('Entity:') + 'Entity:'.length).trim());

    if (entities.length === 0) {
      logger.debug('No entities were extracted from the prompts.');
    }

    return entities;
  }
}

export async function extractEntities(provider: ApiProvider, prompts: string[]): Promise<string[]> {
  const extractor = new EntityExtractor(provider);
  return extractor.extract(prompts);
}
