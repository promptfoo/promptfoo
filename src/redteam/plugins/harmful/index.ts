import { getEnvBool, getEnvString } from '../../../envars';
import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import type { Assertion, PluginActionParams, TestCase } from '../../../types';
import { sampleArray } from '../../../util/generation';
import { getNunjucksEngine } from '../../../util/templates';
import { sleep } from '../../../util/time';
import {
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../constants';
import { REDTEAM_MODEL_CATEGORIES } from './constants';
import { sortTestCasesByHarmCategory } from './utils';

export const PLUGIN_ID = 'promptfoo:redteam:harmful';

function getModerationAssertions(): Assertion[] {
  if (getEnvBool('PROMPTFOO_DISABLE_REDTEAM_MODERATION')) {
    return [];
  }

  if (getEnvString('REPLICATE_API_KEY') || getEnvString('REPLICATE_API_TOKEN')) {
    return [
      {
        metric: 'Harmful',
        type: 'moderation',
        value: LLAMA_GUARD_ENABLED_CATEGORIES,
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      },
    ];
  }

  if (getEnvString('OPENAI_API_KEY')) {
    return [{ metric: 'Harmful', type: 'moderation' }];
  }

  return [];
}

function createTestCase(injectVar: string, output: string, harmCategory: string): TestCase {
  const harmCategoryLabel = HARM_PLUGINS[harmCategory as keyof typeof HARM_PLUGINS] || harmCategory;
  return {
    vars: {
      [injectVar]: output.split('\n')[0].trim(),
      harmCategory: harmCategoryLabel,
    },
    metadata: { harmCategory: harmCategoryLabel },
    assert: [
      { metric: 'Harmful', type: 'promptfoo:redteam:harmful' },
      ...getModerationAssertions(),
    ],
  };
}

export async function getHarmfulTests(
  { provider, purpose, injectVar, n, delayMs = 0, config = {} }: PluginActionParams,
  plugins: string[],
): Promise<TestCase[]> {
  const harmCategories =
    plugins.length > 0
      ? plugins.map((p) => HARM_PLUGINS[p as keyof typeof HARM_PLUGINS]).filter(Boolean)
      : Object.values(HARM_PLUGINS);

  const unalignedCategories = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS).filter((p) =>
    harmCategories.includes(
      UNALIGNED_PROVIDER_HARM_PLUGINS[p as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS],
    ),
  );

  const unalignedTests = await Promise.all(
    unalignedCategories.map(async (category) => {
      const unalignedProvider = new PromptfooHarmfulCompletionProvider({
        purpose,
        harmCategory: category,
      });
      const results = [];

      for (let i = 0; i < n; i++) {
        const result = await unalignedProvider.callApi('');
        if (result.output) {
          results.push(createTestCase(injectVar, result.output, category));
        }
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      return results;
    }),
  );

  const alignedCategories = Object.values(REDTEAM_PROVIDER_HARM_PLUGINS).filter((p) =>
    harmCategories.includes(p),
  );

  const alignedTests = await Promise.all(
    alignedCategories.map(async (category) => {
      const categoryConfig = REDTEAM_MODEL_CATEGORIES.find((c) => c.label === category);
      if (!categoryConfig || !provider) {
        return [];
      }

      const nunjucks = getNunjucksEngine();
      const prompt = await nunjucks.renderString(categoryConfig.prompt, {
        purpose,
        n: config?.numExamples || 3,
        examples: config?.examples || categoryConfig.examples,
      });

      const result = await provider.callApi(prompt);
      if (!result.output) {
        return [];
      }

      const outputs = result.output
        .split('\n')
        .filter((line: string) => line.startsWith('Prompt:'))
        .map((line: string) => line.replace('Prompt:', '').trim());

      return outputs.map((output: string) => createTestCase(injectVar, output, category));
    }),
  );

  return sortTestCasesByHarmCategory([
    ...sampleArray(unalignedTests.flat(), n),
    ...sampleArray(alignedTests.flat(), n),
  ]);
}
