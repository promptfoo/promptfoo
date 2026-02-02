import fs from 'fs';
import path from 'path';

import async from 'async';
import yaml from 'js-yaml';
import cliState from '../cliState';
import { getEnvInt } from '../envars';
import { handleConversationRelevance } from '../external/assertions/deepeval';
import { matchesConversationRelevance } from '../external/matchers/deepeval';
import logger from '../logger';
import {
  matchesAnswerRelevance,
  matchesClassification,
  matchesClosedQa,
  matchesContextFaithfulness,
  matchesContextRecall,
  matchesContextRelevance,
  matchesFactuality,
  matchesLlmRubric,
  matchesModeration,
  matchesSelectBest,
  matchesSimilarity,
} from '../matchers';
import { isPackagePath, loadFromPackage } from '../providers/packageParser';
import { runPython } from '../python/pythonUtils';
import { generateSpanId, generateTraceparent } from '../tracing/evaluatorTracing';
import { getTraceStore } from '../tracing/store';
import {
  type ApiProvider,
  type Assertion,
  type AssertionType,
  type AssertionValue,
  type AtomicTestCase,
  type CallApiContextParams,
  type CombinatorAssertion,
  type GradingResult,
  type VarValue,
} from '../types/index';
import { isJavascriptFile } from '../util/fileExtensions';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { transform } from '../util/transform';
import { handleAnswerRelevance } from './answerRelevance';
import { AssertionsResult } from './assertionsResult';
import { handleBleuScore } from './bleu';
import { handleClassifier } from './classifier';
import { handleCombinator, setRunAssertionFn } from './combinator';
import {
  handleContains,
  handleContainsAll,
  handleContainsAny,
  handleIContains,
  handleIContainsAll,
  handleIContainsAny,
} from './contains';
import { handleContextFaithfulness } from './contextFaithfulness';
import { handleContextRecall } from './contextRecall';
import { handleContextRelevance } from './contextRelevance';
import { handleCost } from './cost';
import { handleEquals } from './equals';
import { handleFactuality } from './factuality';
import { handleFinishReason } from './finishReason';
import { handleIsValidFunctionCall } from './functionToolCall';
import { handleGEval } from './geval';
import { handleGleuScore } from './gleu';
import { handleGuardrails } from './guardrails';
import { handleContainsHtml, handleIsHtml } from './html';
import { handleJavascript } from './javascript';
import { handleContainsJson, handleIsJson } from './json';
import { handleLatency } from './latency';
import { handleLevenshtein } from './levenshtein';
import { handleLlmRubric } from './llmRubric';
import { handleModelGradedClosedQa } from './modelGradedClosedQa';
import { handleModeration } from './moderation';
import { handleIsValidOpenAiToolsCall } from './openai';
import { handlePerplexity, handlePerplexityScore } from './perplexity';
import { handlePiScorer } from './pi';
import { handlePython } from './python';
import { handleRedteam } from './redteam';
import { handleIsRefusal } from './refusal';
import { handleRegex } from './regex';
import { handleRougeScore } from './rouge';
import { handleRuby } from './ruby';
import { handleSearchRubric } from './searchRubric';
import { handleSimilar } from './similar';
import { handleContainsSql, handleIsSql } from './sql';
import { handleStartsWith } from './startsWith';
import { handleToolCallF1 } from './toolCallF1';
import { handleTraceErrorSpans } from './traceErrorSpans';
import { handleTraceSpanCount } from './traceSpanCount';
import { handleTraceSpanDuration } from './traceSpanDuration';
import { coerceString, getFinalTest, loadFromJavaScriptFile, processFileReference } from './utils';
import { handleWebhook } from './webhook';
import { handleWordCount } from './wordCount';
import { handleIsXml } from './xml';

import type {
  AssertionParams,
  AssertionValueFunctionContext,
  BaseAssertionTypes,
  ProviderResponse,
  ScoringFunction,
} from '../types/index';

const ASSERTIONS_MAX_CONCURRENCY = getEnvInt('PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY', 3);

export const MODEL_GRADED_ASSERTION_TYPES = new Set<AssertionType>([
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'factuality',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'search-rubric',
]);

const ASSERTION_HANDLERS: Record<
  BaseAssertionTypes,
  (params: AssertionParams) => GradingResult | Promise<GradingResult>
> = {
  'answer-relevance': handleAnswerRelevance,
  bleu: handleBleuScore,
  classifier: handleClassifier,
  contains: handleContains,
  'contains-all': handleContainsAll,
  'contains-any': handleContainsAny,
  'contains-html': handleContainsHtml,
  'contains-json': handleContainsJson,
  'contains-sql': handleContainsSql,
  'contains-xml': handleIsXml,
  'context-faithfulness': handleContextFaithfulness,
  'context-recall': handleContextRecall,
  'context-relevance': handleContextRelevance,
  'conversation-relevance': handleConversationRelevance,
  cost: handleCost,
  equals: handleEquals,
  factuality: handleFactuality,
  'finish-reason': handleFinishReason,
  'g-eval': handleGEval,
  gleu: handleGleuScore,
  guardrails: handleGuardrails,
  icontains: handleIContains,
  'icontains-all': handleIContainsAll,
  'icontains-any': handleIContainsAny,
  'is-html': handleIsHtml,
  'is-json': handleIsJson,
  'is-refusal': handleIsRefusal,
  'is-sql': handleIsSql,
  'is-valid-function-call': handleIsValidFunctionCall,
  'is-valid-openai-function-call': handleIsValidFunctionCall,
  'is-valid-openai-tools-call': handleIsValidOpenAiToolsCall,
  'is-xml': handleIsXml,
  javascript: handleJavascript,
  latency: handleLatency,
  levenshtein: handleLevenshtein,
  'llm-rubric': handleLlmRubric,
  meteor: async (params: AssertionParams) => {
    try {
      const { handleMeteorAssertion } = await import('./meteor.js');
      return handleMeteorAssertion(params);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Cannot find module') ||
          error.message.includes('natural" package is required'))
      ) {
        return {
          pass: false,
          score: 0,
          reason:
            'METEOR assertion requires the natural package. Please install it using: npm install natural@^8.1.0',
          assertion: params.assertion,
        };
      }
      throw error;
    }
  },
  'model-graded-closedqa': handleModelGradedClosedQa,
  'model-graded-factuality': handleFactuality,
  moderation: handleModeration,
  perplexity: handlePerplexity,
  'perplexity-score': handlePerplexityScore,
  pi: handlePiScorer,
  python: handlePython,
  regex: handleRegex,
  ruby: handleRuby,
  'rouge-n': handleRougeScore,
  'search-rubric': handleSearchRubric,
  similar: handleSimilar,
  'similar:cosine': handleSimilar,
  'similar:dot': handleSimilar,
  'similar:euclidean': handleSimilar,
  'starts-with': handleStartsWith,
  'tool-call-f1': handleToolCallF1,
  'trace-error-spans': handleTraceErrorSpans,
  'trace-span-count': handleTraceSpanCount,
  'trace-span-duration': handleTraceSpanDuration,
  webhook: handleWebhook,
  'word-count': handleWordCount,
};

const nunjucks = getNunjucksEngine();

/**
 * Renders a metric name template with test variables.
 * @param metric - The metric name, possibly containing Nunjucks template syntax
 * @param vars - The test variables to use for rendering
 * @returns The rendered metric name, or the original if rendering fails
 */
export function renderMetricName(
  metric: string | undefined,
  vars: Record<string, unknown>,
): string | undefined {
  if (!metric) {
    return metric;
  }
  try {
    const rendered = nunjucks.renderString(metric, vars);
    if (rendered === '' && metric !== '') {
      logger.debug(`Metric template "${metric}" rendered to empty string`);
    }
    return rendered;
  } catch (error) {
    logger.warn(
      `Failed to render metric template "${metric}": ${error instanceof Error ? error.message : error}`,
    );
    return metric;
  }
}

/**
 * Tests whether an assertion is inverse e.g. "not-equals" is inverse of "equals"
 * or "not-contains" is inverse of "contains".
 * @param assertion - The assertion to test
 * @returns true if the assertion is inverse, false otherwise
 */
export function isAssertionInverse(assertion: Assertion): boolean {
  return assertion.type.startsWith('not-');
}

/**
 * Returns the base type of an assertion i.e. "not-equals" returns "equals"
 * and "equals" returns "equals".
 * @param assertion - The assertion to get the base type.
 * @returns The base type of the assertion.
 */
export function getAssertionBaseType(assertion: Assertion): AssertionType {
  const inverse = isAssertionInverse(assertion);
  return inverse ? (assertion.type.slice(4) as AssertionType) : (assertion.type as AssertionType);
}

export async function runAssertion({
  prompt,
  provider,
  assertion,
  test,
  vars,
  latencyMs,
  providerResponse,
  traceId,
}: {
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion | CombinatorAssertion;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  providerResponse: ProviderResponse;
  latencyMs?: number;
  assertIndex?: number;
  traceId?: string;
}): Promise<GradingResult> {
  // Use resolved vars if provided, otherwise fall back to test.vars
  const resolvedVars = vars || test.vars || {};

  const { cost, logProbs, output: originalOutput } = providerResponse;
  let output = originalOutput;

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  // Handle combinator assertions (and/or) by delegating to combinator handler
  if (assertion.type === 'and' || assertion.type === 'or') {
    return handleCombinator(assertion as CombinatorAssertion, {
      prompt,
      provider,
      providerResponse,
      test,
      vars: resolvedVars,
      latencyMs,
      traceId,
    });
  }

  // At this point, assertion is definitely a regular Assertion (not a combinator)
  const regularAssertion = assertion as Assertion;

  if (regularAssertion.transform) {
    output = await transform(regularAssertion.transform, output, {
      vars: resolvedVars,
      prompt: { label: prompt },
      ...(providerResponse && providerResponse.metadata && { metadata: providerResponse.metadata }),
    });
  }

  const context: AssertionValueFunctionContext = {
    prompt,
    vars: resolvedVars,
    test,
    logProbs,
    provider,
    providerResponse,
    ...(regularAssertion.config ? { config: structuredClone(regularAssertion.config) } : {}),
  };

  // Add trace data if traceId is available
  if (traceId) {
    try {
      const traceStore = getTraceStore();
      const traceData = await traceStore.getTrace(traceId);
      if (traceData) {
        context.trace = {
          traceId: traceData.traceId,
          evaluationId: traceData.evaluationId,
          testCaseId: traceData.testCaseId,
          metadata: traceData.metadata,
          spans: traceData.spans || [],
        };
      }
    } catch (error) {
      logger.debug(`Failed to fetch trace data for assertion: ${error}`);
    }
  }

  // Render assertion values
  type ValueFromScriptType = string | boolean | number | GradingResult | object | undefined;
  let renderedValue = regularAssertion.value;
  let valueFromScript: ValueFromScriptType;
  if (typeof renderedValue === 'string') {
    if (renderedValue.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const fileRef = renderedValue.slice('file://'.length);
      let filePath = fileRef;
      let functionName: string | undefined;

      if (fileRef.includes(':')) {
        const [pathPart, funcPart] = fileRef.split(':');
        filePath = pathPart;
        functionName = funcPart;
      }

      filePath = path.resolve(basePath, filePath);

      if (isJavascriptFile(filePath)) {
        valueFromScript = await loadFromJavaScriptFile(filePath, functionName, [output, context]);
        logger.debug(`Javascript script ${filePath} output: ${valueFromScript}`);
      } else if (filePath.endsWith('.py')) {
        try {
          const pythonScriptOutput = await runPython<ValueFromScriptType>(
            filePath,
            functionName || 'get_assert',
            [output, context],
          );
          valueFromScript = pythonScriptOutput;
          logger.debug(`Python script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            pass: false,
            score: 0,
            reason: (error as Error).message,
            assertion: regularAssertion,
          };
        }
      } else if (filePath.endsWith('.rb')) {
        try {
          const { runRuby } = await import('../ruby/rubyUtils.js');
          const rubyScriptOutput = await runRuby<ValueFromScriptType>(
            filePath,
            functionName || 'get_assert',
            [output, context],
          );
          valueFromScript = rubyScriptOutput;
          logger.debug(`Ruby script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            pass: false,
            score: 0,
            reason: (error as Error).message,
            assertion: regularAssertion,
          };
        }
      } else {
        renderedValue = processFileReference(renderedValue);
      }
    } else if (isPackagePath(renderedValue)) {
      const basePath = cliState.basePath || '';
      const requiredModule = await loadFromPackage(renderedValue, basePath);
      if (typeof requiredModule !== 'function') {
        throw new Error(
          `Assertion malformed: ${renderedValue} must be a function. Received: ${typeof requiredModule}`,
        );
      }

      valueFromScript = await Promise.resolve(requiredModule(output, context));
    } else {
      // It's a normal string value
      renderedValue = nunjucks.renderString(renderedValue, resolvedVars);
    }
  } else if (renderedValue && Array.isArray(renderedValue)) {
    // Process each element in the array
    renderedValue = renderedValue.map((v) => {
      if (typeof v === 'string') {
        if (v.startsWith('file://')) {
          return processFileReference(v);
        }
        return nunjucks.renderString(v, resolvedVars);
      }
      return v;
    });
  }

  // Centralized script output resolution
  // Script assertion types (javascript, python, ruby) interpret renderedValue as code to execute
  // All other types should use the script output as the comparison value
  const SCRIPT_RESULT_ASSERTIONS = new Set(['javascript', 'python', 'ruby']);
  const baseType = getAssertionBaseType(regularAssertion);

  if (valueFromScript !== undefined && !SCRIPT_RESULT_ASSERTIONS.has(baseType)) {
    // Validate the script result type - only javascript/python/ruby can return functions
    if (typeof valueFromScript === 'function') {
      throw new Error(
        `Script for "${regularAssertion.type}" assertion returned a function. ` +
          `Only javascript/python/ruby assertion types can return functions. ` +
          `For other assertion types, return the expected value (string, number, array, or object).`,
      );
    }

    // Validate the script didn't return boolean or GradingResult
    // These are only valid for javascript/python/ruby assertion types
    if (typeof valueFromScript === 'boolean') {
      throw new Error(
        `Script for "${regularAssertion.type}" assertion returned a boolean. ` +
          `Only javascript/python/ruby assertion types can return boolean values. ` +
          `For other assertion types, return the expected value (string, number, array, or object).`,
      );
    }

    // Check if it's a GradingResult object (has 'pass' property)
    if (
      valueFromScript &&
      typeof valueFromScript === 'object' &&
      !Array.isArray(valueFromScript) &&
      'pass' in valueFromScript
    ) {
      throw new Error(
        `Script for "${regularAssertion.type}" assertion returned a GradingResult. ` +
          `Only javascript/python/ruby assertion types can return GradingResult objects. ` +
          `For other assertion types, return the expected value (string, number, array, or object).`,
      );
    }

    // Update renderedValue with the script output
    // Type assertion is now safe because we've validated the type
    renderedValue = valueFromScript as AssertionValue;
  }

  // Construct CallApiContextParams for model-graded assertions that need originalProvider
  // Generate traceparent for grader calls to link them to the main trace
  const graderTraceparent = traceId ? generateTraceparent(traceId, generateSpanId()) : undefined;
  const providerCallContext: CallApiContextParams | undefined = provider
    ? {
        originalProvider: provider,
        prompt: { raw: prompt || '', label: '' },
        vars: resolvedVars,
        ...(graderTraceparent && { traceparent: graderTraceparent }),
      }
    : undefined;

  const assertionParams: AssertionParams = {
    assertion: regularAssertion,
    baseType: getAssertionBaseType(regularAssertion),
    providerCallContext,
    assertionValueContext: context,
    cost,
    inverse: isAssertionInverse(regularAssertion),
    latencyMs,
    logProbs,
    output,
    outputString: coerceString(output),
    prompt,
    provider,
    providerResponse,
    renderedValue,
    test: getFinalTest(test, regularAssertion),
    valueFromScript,
  };

  // Check for redteam assertions first
  if (assertionParams.baseType.startsWith('promptfoo:redteam:')) {
    return handleRedteam(assertionParams);
  }

  const handler = ASSERTION_HANDLERS[assertionParams.baseType as keyof typeof ASSERTION_HANDLERS];
  if (handler) {
    const result = await handler(assertionParams);

    // Store rendered assertion value in metadata if it differs from the original template
    // This allows the UI to display substituted variable values instead of raw templates
    if (
      renderedValue !== undefined &&
      renderedValue !== regularAssertion.value &&
      typeof renderedValue === 'string'
    ) {
      result.metadata = result.metadata || {};
      result.metadata.renderedAssertionValue = renderedValue;
    }

    // If weight is 0, treat this as a metric-only assertion that can't fail
    if (regularAssertion.weight === 0) {
      return {
        ...result,
        pass: true, // Force pass for weight=0 assertions
      };
    }

    return result;
  }

  throw new Error(`Unknown assertion type: ${regularAssertion.type}`);
}

export async function runAssertions({
  assertScoringFunction,
  latencyMs,
  prompt,
  provider,
  providerResponse,
  test,
  vars,
  traceId,
}: {
  assertScoringFunction?: ScoringFunction;
  latencyMs?: number;
  prompt?: string;
  provider?: ApiProvider;
  providerResponse: ProviderResponse;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  traceId?: string;
}): Promise<GradingResult> {
  if (!test.assert || test.assert.length < 1) {
    return AssertionsResult.noAssertsResult();
  }

  const mainAssertResult = new AssertionsResult({
    threshold: test.threshold,
  });
  const subAssertResults: AssertionsResult[] = [];
  const asserts: {
    assertion: Assertion | CombinatorAssertion;
    assertResult: AssertionsResult;
    index: number;
  }[] = test.assert
    .map((assertion, i) => {
      if (assertion.type === 'assert-set') {
        const subAssertResult = new AssertionsResult({
          threshold: assertion.threshold,
          parentAssertionSet: {
            assertionSet: assertion,
            index: i,
          },
        });

        subAssertResults.push(subAssertResult);

        return assertion.assert.map((subAssert, j) => {
          return {
            assertion: subAssert,
            assertResult: subAssertResult,
            index: j,
          };
        });
      }

      return { assertion, assertResult: mainAssertResult, index: i };
    })
    .flat();

  await async.forEachOfLimit(
    asserts,
    ASSERTIONS_MAX_CONCURRENCY,
    async ({ assertion, assertResult, index }) => {
      if (assertion.type.startsWith('select-') || assertion.type === 'max-score') {
        // Select-type and max-score assertions are handled separately because they depend on multiple outputs.
        return;
      }

      const result = await runAssertion({
        prompt,
        provider,
        providerResponse,
        assertion,
        test,
        vars,
        latencyMs,
        assertIndex: index,
        traceId,
      });

      assertResult.addResult({
        index,
        result,
        metric: renderMetricName(assertion.metric, vars || test.vars || {}),
        weight: assertion.weight,
      });
    },
  );

  await async.forEach(subAssertResults, async (subAssertResult) => {
    const result = await subAssertResult.testResult();
    const {
      index,
      assertionSet: { metric, weight },
    } = subAssertResult.parentAssertionSet!;

    mainAssertResult.addResult({
      index,
      result,
      metric: renderMetricName(metric, vars || test.vars || {}),
      weight,
    });
  });

  return mainAssertResult.testResult(assertScoringFunction);
}

export async function runCompareAssertion(
  test: AtomicTestCase,
  assertion: Assertion,
  outputs: string[],
  context?: CallApiContextParams,
): Promise<GradingResult[]> {
  invariant(typeof assertion.value === 'string', 'select-best must have a string value');
  test = getFinalTest(test, assertion);
  const comparisonResults = await matchesSelectBest(
    assertion.value,
    outputs,
    test.options,
    test.vars,
    context,
  );
  return comparisonResults.map((result) => ({
    ...result,
    assertion,
  }));
}

export async function readAssertions(filePath: string): Promise<Assertion[]> {
  try {
    const assertions = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Assertion[];
    if (!Array.isArray(assertions) || assertions[0]?.type === undefined) {
      throw new Error('Assertions file must be an array of assertion objects');
    }
    return assertions;
  } catch (err) {
    throw new Error(`Failed to read assertions from ${filePath}:\n${err}`);
  }
}

// Initialize combinator module with runAssertion reference to avoid circular dependency
setRunAssertionFn(runAssertion);

// These exports are used by the node.js package (index.ts)
export default {
  handleCombinator,
  runAssertion,
  runAssertions,
  matchesSimilarity,
  matchesClassification,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesAnswerRelevance,
  matchesContextRecall,
  matchesContextRelevance,
  matchesContextFaithfulness,
  matchesComparisonBoolean: matchesSelectBest,
  matchesModeration,
  matchesConversationRelevance,
};
