import type { ApiProvider, Assertion } from '../../types';
import { RedteamPluginBase } from './base';

export class CustomPlugin extends RedteamPluginBase {
  private definition: { generator: string; grader: string };

  constructor(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    definition: { generator: string; grader: string },
  ) {
    super(provider, purpose, injectVar);
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
