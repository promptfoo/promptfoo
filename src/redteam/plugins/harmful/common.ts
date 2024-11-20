import { getEnvBool, getEnvString } from '../../../envars';
import type { Assertion, AssertionType, TestCase } from '../../../types';
import {
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
} from '../../constants';

export function getHarmfulAssertions(harmCategory: keyof typeof HARM_PLUGINS): Assertion[] {
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
      [injectVar]: output.trim(),
      harmCategory: harmCategoryLabel,
    },
    metadata: { harmCategory: harmCategoryLabel },
    assert: getHarmfulAssertions(harmCategory),
  };
}
