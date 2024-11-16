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
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../constants';
import { REDTEAM_MODEL_CATEGORIES } from './constants';

export const PLUGIN_ID = 'promptfoo:redteam:harmful';

function getModerationAssertions(): Assertion[] {
  const assertions: Assertion[] = [{ metric: 'Harmful', type: 'promptfoo:redteam:harmful' }];

  if (getEnvBool('PROMPTFOO_DISABLE_REDTEAM_MODERATION')) {
    return assertions;
  }

  if (getEnvString('REPLICATE_API_KEY') || getEnvString('REPLICATE_API_TOKEN')) {
    assertions.push({
      metric: 'Harmful',
      type: 'moderation',
      value: LLAMA_GUARD_ENABLED_CATEGORIES,
      provider: LLAMA_GUARD_REPLICATE_PROVIDER,
    });
  } else if (getEnvString('OPENAI_API_KEY')) {
    assertions.push({ metric: 'Harmful', type: 'moderation' });
  }

  return assertions;
}

function createTestCase(injectVar: string, output: string, harmCategory: string): TestCase {
  const harmCategoryLabel = HARM_PLUGINS[harmCategory as keyof typeof HARM_PLUGINS] || harmCategory;
  return {
    vars: {
      [injectVar]: output.split('\n')[0].trim(),
      harmCategory: harmCategoryLabel,
    },
    metadata: { harmCategory: harmCategoryLabel },
    assert: getModerationAssertions(),
  };
}

export async function getHarmfulTests(
  { provider, purpose, injectVar, n, delayMs = 0, config = {} }: PluginActionParams,
  plugin: keyof typeof HARM_PLUGINS,
): Promise<TestCase[]> {
  const harmCategory = HARM_PLUGINS[plugin];
  if (!harmCategory) {
    return [];
  }

  // Check if this is an unaligned category
  const unalignedCategory = Object.entries(UNALIGNED_PROVIDER_HARM_PLUGINS).find(
    ([key, value]) => value === harmCategory,
  )?.[0];

  if (unalignedCategory) {
    // Handle unaligned case
    const unalignedProvider = new PromptfooHarmfulCompletionProvider({
      purpose,
      harmCategory: unalignedCategory,
    });

    const tests: TestCase[] = [];
    for (let i = 0; i < n; i++) {
      const result = await unalignedProvider.callApi('');
      if (result.output) {
        tests.push(createTestCase(injectVar, result.output, unalignedCategory));
      }
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
    return tests;
  }

  // Handle aligned case
  if (!provider) {
    return [];
  }

  const categoryConfig = REDTEAM_MODEL_CATEGORIES.find((c) => c.label === harmCategory);
  if (!categoryConfig) {
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

  return sampleArray(
    outputs.map((output: string) => createTestCase(injectVar, output, harmCategory)),
    n,
  );
}
