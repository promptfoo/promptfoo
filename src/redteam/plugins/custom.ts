import dedent from 'dedent';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import logger from '../../logger';
import type { ApiProvider, Assertion } from '../../types';
import { maybeLoadFromExternalFile } from '../../util';
import { getNunjucksEngine } from '../../util/templates';
import { RedteamPluginBase } from './base';

const CustomPluginDefinitionSchema = z
  .object({
    generator: z.string().min(1, 'Generator must not be empty').trim(),
    grader: z.string().min(1, 'Grader must not be empty').trim(),
    id: z.string().optional(),
  })
  .strict();

type CustomPluginDefinition = z.infer<typeof CustomPluginDefinitionSchema>;

export async function loadCustomPluginDefinition(filePath: string): Promise<CustomPluginDefinition> {
  logger.debug(`Loading custom plugin from ${filePath}`);

  const pluginData = await maybeLoadFromExternalFile(filePath);
  const result = CustomPluginDefinitionSchema.safeParse(pluginData);
  if (!result.success) {
    const validationError = fromError(result.error);
    throw new Error(
      '\n' +
        dedent`
    Custom Plugin Schema Validation Error:

      ${validationError.toString()}

    Please review your plugin file ${filePath} configuration.`,
    );
  }
  logger.debug(`Custom plugin definition: ${JSON.stringify(result.data, null, 2)}`);
  return result.data;
}

export class CustomPlugin extends RedteamPluginBase {
  private definition: CustomPluginDefinition;

  get id(): string {
    return this.definition.id || `promptfoo:redteam:custom`;
  }

  private constructor(
    provider: ApiProvider, 
    purpose: string, 
    injectVar: string,
    definition: CustomPluginDefinition
  ) {
    super(provider, purpose, injectVar);
    this.definition = definition;
  }
  
  public static async create(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    filePath: string
  ): Promise<CustomPlugin> {
    const definition = await loadCustomPluginDefinition(filePath);
    return new CustomPlugin(provider, purpose, injectVar, definition);
  }

  protected async getTemplate(): Promise<string> {
    return this.definition.generator;
  }

  protected getAssertions(prompt: string): Assertion[] {
    const nunjucks = getNunjucksEngine();
    const renderedGrader = nunjucks.renderString(this.definition.grader, { purpose: this.purpose });

    return [
      {
        type: 'llm-rubric',
        value: renderedGrader,
      },
    ];
  }
}
