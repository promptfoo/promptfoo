import type { ApiProvider, Assertion } from '../../types';
import { PluginBase } from './base';

export class CustomPlugin extends PluginBase {
  private definition: { generator: string; grader: string };

  constructor(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    modifiers: Record<string, string> = {},
    definition: { generator: string; grader: string },
  ) {
    super(provider, purpose, injectVar, modifiers);
    this.definition = definition;
  }

  protected async getTemplate(): Promise<string> {
    return this.definition.generator;
  }

  protected getAssertions(prompt: string): Assertion[] {
    return [
      {
        type: 'llm-rubric',
        value: this.definition.grader,
      },
    ];
  }
}
