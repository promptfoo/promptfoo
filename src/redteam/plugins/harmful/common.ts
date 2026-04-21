import { getEnvBool, getEnvString } from '../../../envars';
import {
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
} from '../../constants';
import { categoryAliases } from '../../constants/metadata';
import { getShortPluginId } from '../../util';

import type { Assertion, AssertionType, TestCase } from '../../../types/index';

export function getHarmfulAssertions(harmCategory: keyof typeof HARM_PLUGINS): Assertion[] {
  const assertionType: AssertionType = `promptfoo:redteam:${harmCategory}`;
  // Use the specific subcategory as the metric name to show granular metrics
  const metricName = categoryAliases[harmCategory] || harmCategory;
  const assertions: Assertion[] = [{ metric: metricName, type: assertionType }];

  if (getEnvBool('PROMPTFOO_DISABLE_REDTEAM_MODERATION', true)) {
    return assertions;
  }

  if (getEnvString('REPLICATE_API_KEY') || getEnvString('REPLICATE_API_TOKEN')) {
    assertions.push({
      metric: metricName,
      type: 'moderation',
      value: LLAMA_GUARD_ENABLED_CATEGORIES,
      provider: LLAMA_GUARD_REPLICATE_PROVIDER,
    });
  } else if (getEnvString('OPENAI_API_KEY')) {
    assertions.push({
      metric: metricName,
      type: 'moderation',
    });
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
    },
    metadata: {
      harmCategory: harmCategoryLabel,
      pluginId: getShortPluginId(harmCategory),
    },
    assert: getHarmfulAssertions(harmCategory),
  };
}
