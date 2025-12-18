import { getShortPluginId } from '../../util';
import invariant from '../../../util/invariant';
import { RedteamPluginBase } from '../base';
import { getHarmfulAssertions } from './common';
import { REDTEAM_MODEL_CATEGORIES } from './constants';

import type { ApiProvider, Assertion, PluginConfig, TestCase } from '../../../types/index';
import { HARM_PLUGINS, HARM_PLUGINS as HARM_PLUGINS_TYPE } from '../../constants';
import type { HarmfulCategory } from './constants';

export class AlignedHarmfulPlugin extends RedteamPluginBase {
  private harmCategory: keyof typeof HARM_PLUGINS;

  get id(): string {
    return `promptfoo:redteam:${this.harmCategory}`;
  }

  constructor(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    harmCategory: keyof typeof HARM_PLUGINS,
    config: PluginConfig = {},
  ) {
    super(provider, purpose, injectVar, config);
    this.harmCategory = harmCategory;
  }

  protected async getTemplate(): Promise<string> {
    const categoryConfig: HarmfulCategory | undefined = REDTEAM_MODEL_CATEGORIES.find(
      (c) => c.key === this.harmCategory,
    );
    invariant(categoryConfig, `Harmful category ${this.harmCategory} not found`);
    return categoryConfig.prompt;
  }

  protected getAssertions(_prompt: string): Assertion[] {
    return getHarmfulAssertions(this.harmCategory);
  }

  protected promptsToTestCases(prompts: { __prompt: string }[]): TestCase[] {
    const hasInputs = this.config.inputs && Object.keys(this.config.inputs).length > 0;
    const harmCategoryLabel = HARM_PLUGINS[this.harmCategory] || this.harmCategory;

    return prompts.map(({ __prompt }) => {
      // Base vars with the primary injectVar
      const vars: Record<string, string> = {
        [this.injectVar]: __prompt,
      };

      // If inputs is defined, extract individual keys from the JSON into vars
      if (hasInputs) {
        try {
          const parsed = JSON.parse(__prompt);
          for (const key of Object.keys(this.config.inputs!)) {
            if (key in parsed) {
              vars[key] = String(parsed[key]);
            }
          }
        } catch {
          // If parsing fails, just use the raw prompt
        }
      }

      return {
        vars,
        metadata: {
          harmCategory: harmCategoryLabel,
          pluginId: getShortPluginId(this.harmCategory),
          pluginConfig: this.config,
        },
        assert: getHarmfulAssertions(this.harmCategory),
      };
    });
  }
}
