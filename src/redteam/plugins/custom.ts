import dedent from 'dedent';
import { z } from 'zod';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import { getNunjucksEngine } from '../../util/templates';
import { RedteamPluginBase } from './base';

import type { ApiProvider, Assertion, TestCase } from '../../types/index';

const CustomPluginDefinitionSchema = z.strictObject({
  generator: z.string().min(1, 'Generator must not be empty').trim(),
  grader: z.string().min(1, 'Grader must not be empty').trim(),
  threshold: z.number().optional(),
  metric: z.string().optional(),
  id: z.string().optional(),
});

type CustomPluginDefinition = z.infer<typeof CustomPluginDefinitionSchema>;

export function loadCustomPluginDefinition(filePath: string): CustomPluginDefinition {
  logger.debug(`Loading custom plugin from ${filePath}`);

  const result = CustomPluginDefinitionSchema.safeParse(maybeLoadFromExternalFile(filePath));
  if (!result.success) {
    const validationError = z.prettifyError(result.error);
    throw new Error(
      '\n' +
        dedent`
    Custom Plugin Schema Validation Error:

      ${validationError}

    Please review your plugin file ${filePath} configuration.`,
    );
  }
  logger.debug(`Custom plugin definition: ${JSON.stringify(result.data, null, 2)}`);
  return result.data;
}

export class CustomPlugin extends RedteamPluginBase {
  private definition: CustomPluginDefinition;
  static readonly canGenerateRemote = false;

  get id(): string {
    return this.definition.id || `promptfoo:redteam:custom`;
  }

  constructor(provider: ApiProvider, purpose: string, injectVar: string, filePath: string) {
    super(provider, purpose, injectVar);
    this.definition = loadCustomPluginDefinition(filePath);
  }

  protected async getTemplate(): Promise<string> {
    return this.definition.generator;
  }

  protected getMetricName(): string {
    return this.definition.metric ?? `custom`;
  }

  protected getAssertions(_prompt: string): Assertion[] {
    const nunjucks = getNunjucksEngine();
    const renderedGrader = nunjucks.renderString(this.definition.grader, { purpose: this.purpose });

    const assertion: Assertion = {
      type: 'llm-rubric',
      value: renderedGrader,
      metric: this.getMetricName(),
    };

    if (this.definition.threshold !== undefined) {
      assertion.threshold = this.definition.threshold;
    }

    return [assertion];
  }

  async generateTests(n: number, delayMs: number = 0): Promise<TestCase[]> {
    const tests = await super.generateTests(n, delayMs);
    return tests.map((test) => ({
      ...test,
      metadata: {
        purpose: this.purpose,
        ...(test.metadata ?? {}),
      },
    }));
  }
}
