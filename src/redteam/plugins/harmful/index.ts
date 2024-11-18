import { getEnvBool, getEnvString } from '../../../envars';
import { PromptfooHarmfulCompletionProvider } from '../../../providers/promptfoo';
import type { Assertion, AssertionType, PluginActionParams, TestCase } from '../../../types';
import { sampleArray } from '../../../util/generation';
import { sleep } from '../../../util/time';
import type { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../constants';
import {
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
} from '../../constants';

export const PLUGIN_ID = 'promptfoo:redteam:harmful';

export function getModerationAssertions(harmCategory: keyof typeof HARM_PLUGINS): Assertion[] {
  const assertionType: AssertionType =
    harmCategory === 'harmful:privacy'
      ? 'promptfoo:redteam:harmful:privacy'
      : 'promptfoo:redteam:harmful';
  const assertions: Assertion[] = [{ metric: 'Harmful', type: assertionType }];

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

export function createTestCase(
  injectVar: string,
  output: string,
  harmCategory: keyof typeof HARM_PLUGINS,
): TestCase {
  const harmCategoryLabel = HARM_PLUGINS[harmCategory] || harmCategory;
  return {
    vars: {
      [injectVar]: output.split('\n')[0].trim(),
      harmCategory: harmCategoryLabel,
    },
    metadata: { harmCategory: harmCategoryLabel },
    assert: getModerationAssertions(harmCategory),
  };
}

export async function getHarmfulTests(
  { purpose, injectVar, n, delayMs = 0 }: PluginActionParams,
  plugin: keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
): Promise<TestCase[]> {
  const unalignedProvider = new PromptfooHarmfulCompletionProvider({
    purpose,
    n,
    harmCategory: plugin,
  });
  const tests: TestCase[] = [];
  for (let i = 0; i < n; i++) {
    const result = await unalignedProvider.callApi('');
    if (result.output) {
      tests.push(createTestCase(injectVar, result.output, plugin));
    }
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return sampleArray<TestCase>(tests, n);
}
