import { getEnvBool, getEnvString } from '../../../envars';
import logger from '../../../logger';
import type {
  ApiProvider,
  Assertion,
  PluginActionParams,
  PluginConfig,
  TestCase,
} from '../../../types';
import { retryWithDeduplication, sampleArray } from '../../../util/generation';
import { getNunjucksEngine } from '../../../util/templates';
import { sleep } from '../../../util/time';
import {
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../constants';
import { PromptfooHarmfulCompletionProvider } from '../../providers/harmful';
import { RedteamPluginBase } from '../base';
import { REDTEAM_MODEL_CATEGORIES } from './constants';
import type { HarmfulCategory } from './constants';
import { sortTestCasesByCategory } from './utils';

export const PLUGIN_ID = 'promptfoo:redteam:harmful';

type GenerateTestsFunction = (
  currentTests: TestCase[],
  params: {
    provider?: ApiProvider;
    purpose: string;
    injectVar: string;
    n: number;
    delayMs: number;
    config: PluginConfig;
    harmCategories: string[];
    isAligned?: boolean;
  },
) => Promise<TestCase[]>;

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
    return [
      {
        metric: 'Harmful',
        type: 'moderation',
      },
    ];
  }

  return [];
}

class HarmfulPlugin extends RedteamPluginBase {
  private category: HarmfulCategory;

  protected async getTemplate(): Promise<string> {
    const nunjucks = getNunjucksEngine();
    return nunjucks.renderString(this.category.prompt, {
      purpose: this.purpose,
      n: this.config?.numExamples || 3,
      examples: this.config?.examples || this.category.examples,
    });
  }

  constructor(
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    categoryLabel: string,
    config?: PluginConfig,
  ) {
    const category = REDTEAM_MODEL_CATEGORIES.find((cat) => cat.label === categoryLabel);
    if (!category) {
      throw new Error(`Category ${categoryLabel} not found`);
    }
    super(provider, purpose, injectVar, config);
    this.category = category;
  }

  protected getAssertions(prompt: string): Assertion[] {
    return [
      {
        type: `promptfoo:redteam:${this.category.key}`,
        metric: 'Harmful',
      },
      ...getModerationAssertions(),
    ];
  }
}

function createTestCase(
  injectVar: string,
  generatedPrompt: string,
  harmCategory: string,
): TestCase {
  const injectValue = generatedPrompt.split('\n')[0].trim();
  const harmCategoryLabel = HARM_PLUGINS[harmCategory as keyof typeof HARM_PLUGINS] || harmCategory;

  return {
    vars: {
      [injectVar]: injectValue,
      harmCategory: harmCategoryLabel,
    },
    metadata: {
      harmCategory: harmCategoryLabel,
    },
    assert: [
      {
        metric: 'Harmful',
        type: 'promptfoo:redteam:harmful',
      },
      ...getModerationAssertions(),
    ],
  };
}

async function generateTestsForCategory(
  injectVar: string,
  provider: ApiProvider | PromptfooHarmfulCompletionProvider | HarmfulPlugin,
  purpose: string,
  harmCategory: string,
  delayMs: number,
  count: number,
  config: PluginConfig,
): Promise<TestCase[]> {
  if (provider instanceof PromptfooHarmfulCompletionProvider) {
    const results = [];
    for (let i = 0; i < count; i++) {
      const result = await provider.callApi('');
      results.push(result);
      if (delayMs > 0) {
        logger.debug(`Delaying for ${delayMs}ms`);
        await sleep(delayMs);
      }
    }
    return results
      .filter((result) => result.output)
      .map((result) => createTestCase(injectVar, result.output!, harmCategory));
  } else if (provider instanceof HarmfulPlugin) {
    return provider.generateTests(count, delayMs);
  } else {
    const plugin = new HarmfulPlugin(provider, purpose, injectVar, harmCategory, config);
    return plugin.generateTests(count, delayMs);
  }
}

async function generateTests(
  currentTests: TestCase[],
  {
    provider,
    purpose,
    injectVar,
    n,
    delayMs,
    config,
    harmCategories,
    isAligned = true,
  }: {
    provider?: ApiProvider;
    purpose: string;
    injectVar: string;
    n: number;
    delayMs: number;
    config: PluginConfig;
    harmCategories: string[];
    isAligned?: boolean;
  },
): Promise<TestCase[]> {
  const remainingCount = n - currentTests.length;
  const newTests: TestCase[] = [];

  for (const harmCategory of harmCategories) {
    const testProvider = isAligned
      ? provider && new HarmfulPlugin(provider, purpose, injectVar, harmCategory, config)
      : new PromptfooHarmfulCompletionProvider({ purpose, harmCategory });

    if (!testProvider) {
      continue;
    }

    const results = await generateTestsForCategory(
      injectVar,
      testProvider,
      purpose,
      harmCategory,
      delayMs,
      remainingCount,
      config,
    );

    for (const result of results) {
      if (result.vars) {
        result.vars.harmCategory = harmCategory;
      }
      result.metadata = {
        ...result.metadata,
        harmCategory,
      };
      newTests.push(result);
    }
  }

  return [...currentTests, ...newTests];
}

async function generateTestsWithRetry<T extends TestCase>(
  generateFn: GenerateTestsFunction,
  params: Parameters<GenerateTestsFunction>[1],
  n: number,
): Promise<T[]> {
  return retryWithDeduplication<T>(
    (currentTests) => generateFn(currentTests, params) as Promise<T[]>,
    n,
  );
}

function categorizeHarmPlugins(harmCategories: string[]) {
  return {
    unaligned: Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS).filter((p) =>
      harmCategories.includes(
        UNALIGNED_PROVIDER_HARM_PLUGINS[p as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS],
      ),
    ),
    aligned: Object.values(REDTEAM_PROVIDER_HARM_PLUGINS).filter((p) => harmCategories.includes(p)),
  };
}

export async function getHarmfulTests(
  { provider, purpose, injectVar, n, delayMs = 0, config = {} }: PluginActionParams,
  plugins: string[],
): Promise<TestCase[]> {
  const harmCategoriesToUse =
    plugins.length > 0
      ? plugins.map((plugin) => HARM_PLUGINS[plugin as keyof typeof HARM_PLUGINS]).filter(Boolean)
      : Object.values(HARM_PLUGINS);

  const { unaligned, aligned } = categorizeHarmPlugins(harmCategoriesToUse);

  const unalignedTests = await generateTestsWithRetry<TestCase>(
    generateTests,
    {
      provider,
      purpose,
      injectVar,
      n,
      delayMs,
      config,
      harmCategories: unaligned,
      isAligned: false,
    },
    n,
  );

  const alignedTests = await generateTestsWithRetry<TestCase>(
    generateTests,
    {
      provider,
      purpose,
      injectVar,
      n,
      delayMs,
      config,
      harmCategories: aligned,
      isAligned: true,
    },
    n,
  );

  return [...sampleArray(unalignedTests, n), ...sampleArray(alignedTests, n)].sort(
    sortTestCasesByCategory,
  );
}
