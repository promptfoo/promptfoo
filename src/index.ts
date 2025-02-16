import assertions from './assertions';
import * as cache from './cache';
import { evaluate as doEvaluate } from './evaluator';
import guardrails from './guardrails';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { readProviderPromptMap, processPrompts } from './prompts';
import providers, { loadApiProvider } from './providers';
import { loadApiProviders } from './providers';
import { extractEntities } from './redteam/extraction/entities';
import { extractSystemPurpose } from './redteam/extraction/purpose';
import { GRADERS } from './redteam/graders';
import { Plugins } from './redteam/plugins';
import { RedteamPluginBase, RedteamGraderBase } from './redteam/plugins/base';
import { Strategies } from './redteam/strategies';
import { createShareableUrl } from './share';
import telemetry from './telemetry';
import type {
  EvaluateOptions,
  TestSuite,
  EvaluateTestSuite,
  ProviderOptions,
  Scenario,
  UnifiedConfig,
  EvaluateResult,
  TokenUsage,
} from './types';
import type { EvaluateResultWithSharing } from './types/sharing';
import { readFilters, writeMultipleOutputs, writeOutput } from './util';
import invariant from './util/invariant';
import { readTests } from './util/testCaseReader';

export * from './types';
export * from './types/sharing';

export { generateTable } from './table';

/**
 * Check if sharing is enabled in both test suite and unified configuration
 */
function isSharingEnabled(testSuite: EvaluateTestSuite, config: Partial<UnifiedConfig>): boolean {
  return Boolean(testSuite.sharing) && Boolean(config.sharing);
}

/**
 * Generate a shareable URL if sharing is enabled
 */
async function generateShareUrl(
  testSuite: EvaluateTestSuite,
  unifiedConfig: Partial<UnifiedConfig>,
  evalRecord: Eval,
): Promise<string | null> {
  if (!isSharingEnabled(testSuite, unifiedConfig)) {
    return null;
  }

  try {
    return await createShareableUrl(evalRecord);
  } catch (error) {
    console.warn('Failed to generate shareable URL:', error);
    return null;
  }
}

async function evaluate(
  testSuite: EvaluateTestSuite,
  options: EvaluateOptions = {},
): Promise<EvaluateResultWithSharing> {
  if (testSuite.writeLatestResults) {
    await runDbMigrations();
  }

  const constructedTestSuite: TestSuite = {
    ...testSuite,
    scenarios: testSuite.scenarios as Scenario[],
    providers: await loadApiProviders(testSuite.providers, {
      env: testSuite.env,
    }),
    tests: await readTests(testSuite.tests),

    nunjucksFilters: await readFilters(testSuite.nunjucksFilters || {}),

    // Full prompts expected (not filepaths)
    prompts: await processPrompts(testSuite.prompts),
  };

  // Resolve nested providers
  if (constructedTestSuite.defaultTest?.options?.provider) {
    if (typeof constructedTestSuite.defaultTest.options.provider === 'function') {
      constructedTestSuite.defaultTest.options.provider = await loadApiProvider(
        constructedTestSuite.defaultTest.options.provider,
      );
    } else if (typeof constructedTestSuite.defaultTest.options.provider === 'object') {
      const casted = constructedTestSuite.defaultTest.options.provider as ProviderOptions;
      invariant(casted.id, 'Provider object must have an id');
      constructedTestSuite.defaultTest.options.provider = await loadApiProvider(casted.id, {
        options: casted,
      });
    }
  }

  for (const test of constructedTestSuite.tests || []) {
    if (test.options?.provider && typeof test.options.provider === 'function') {
      test.options.provider = await loadApiProvider(test.options.provider);
    } else if (test.options?.provider && typeof test.options.provider === 'object') {
      const casted = test.options.provider as ProviderOptions;
      invariant(casted.id, 'Provider object must have an id');
      test.options.provider = await loadApiProvider(casted.id, { options: casted });
    }
    if (test.assert) {
      for (const assertion of test.assert) {
        if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
          continue;
        }

        if (assertion.provider) {
          if (typeof assertion.provider === 'object') {
            const casted = assertion.provider as ProviderOptions;
            invariant(casted.id, 'Provider object must have an id');
            assertion.provider = await loadApiProvider(casted.id, { options: casted });
          } else if (typeof assertion.provider === 'string') {
            assertion.provider = await loadApiProvider(assertion.provider);
          } else {
            throw new Error('Invalid provider type');
          }
        }
      }
    }
  }

  // Other settings
  if (options.cache === false || (options.repeat && options.repeat > 1)) {
    cache.disableCache();
  }

  const parsedProviderPromptMap = readProviderPromptMap(testSuite, constructedTestSuite.prompts);
  const unifiedConfig = { ...testSuite, prompts: constructedTestSuite.prompts };
  const evalRecord = testSuite.writeLatestResults
    ? await Eval.create(unifiedConfig, constructedTestSuite.prompts)
    : new Eval(unifiedConfig);

  // Run the eval!
  const ret = await doEvaluate(
    {
      ...constructedTestSuite,
      providerPromptMap: parsedProviderPromptMap,
    },
    evalRecord,
    {
      eventSource: 'library',
      ...options,
    },
  );

  // Generate shareable URL if sharing is enabled
  const shareUrl = await generateShareUrl(testSuite, unifiedConfig, evalRecord);

  // Handle outputs after evaluation but before telemetry
  if (testSuite.outputPath) {
    if (typeof testSuite.outputPath === 'string') {
      await writeOutput(testSuite.outputPath, evalRecord, shareUrl);
    } else if (Array.isArray(testSuite.outputPath)) {
      await writeMultipleOutputs(testSuite.outputPath, evalRecord, shareUrl);
    }
  }

  await telemetry.send();

  // Default values for result mapping
  const defaultValues = {
    id: '',
    provider: {
      id: '',
      label: undefined,
    },
    failureReason: 0,
    success: false,
    score: 0,
    latencyMs: 0,
    namedScores: {},
    metadata: {},
  };

  // Convert EvalResult[] to EvaluateResult[]
  const evaluateResults = ret.results.map(
    (result) =>
      ({
        ...defaultValues,
        ...result,
        description: result.description === null ? undefined : result.description,
        promptId: result.prompt.id || '',
        provider: {
          id: result.provider?.id || '',
          label: result.provider?.label,
        },
        vars: result.testCase.vars || {},
        error: result.error || undefined,
        tokenUsage: result.response?.tokenUsage
          ? {
              ...result.response.tokenUsage,
              numRequests: 1,
              completionDetails: {
                reasoning: 0,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }
          : undefined,
      }) as EvaluateResult,
  );

  // Calculate total token usage with a single reduce operation
  const totalTokenUsage = evaluateResults.reduce(
    (acc, result) => {
      const tokenUsage = result.response?.tokenUsage;
      if (!tokenUsage) {
        return acc;
      }

      // Update base token counts
      acc.total += tokenUsage.total || 0;
      acc.prompt += tokenUsage.prompt || 0;
      acc.completion += tokenUsage.completion || 0;
      acc.cached += tokenUsage.cached || 0;
      acc.numRequests += 1;

      // Update completion details if present
      const responseDetails = tokenUsage.completionDetails;
      if (responseDetails && acc.completionDetails) {
        // Initialize if not already set
        if (!acc.completionDetails.reasoning) {
          acc.completionDetails.reasoning = 0;
        }
        if (!acc.completionDetails.acceptedPrediction) {
          acc.completionDetails.acceptedPrediction = 0;
        }
        if (!acc.completionDetails.rejectedPrediction) {
          acc.completionDetails.rejectedPrediction = 0;
        }

        acc.completionDetails.reasoning += responseDetails.reasoning || 0;
        acc.completionDetails.acceptedPrediction += responseDetails.acceptedPrediction || 0;
        acc.completionDetails.rejectedPrediction += responseDetails.rejectedPrediction || 0;
      }

      return acc;
    },
    {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    } as Required<TokenUsage>,
  );

  // Calculate stats using array methods
  const stats = {
    successes: evaluateResults.filter((r) => r.success).length,
    failures: evaluateResults.filter((r) => !r.success).length,
    errors: evaluateResults.filter((r) => r.error).length,
    tokenUsage: totalTokenUsage,
  };

  return {
    version: 3,
    timestamp: new Date().toISOString(),
    results: evaluateResults,
    prompts: ret.prompts || [],
    stats,
    shareUrl,
  };
}

const redteam = {
  Extractors: {
    extractEntities,
    extractSystemPurpose,
  },
  Graders: GRADERS,
  Plugins,
  Strategies,
  Base: {
    Plugin: RedteamPluginBase,
    Grader: RedteamGraderBase,
  },
};

export { assertions, cache, evaluate, providers, redteam, guardrails };

export default {
  assertions,
  cache,
  evaluate,
  providers,
  redteam,
  guardrails,
};
