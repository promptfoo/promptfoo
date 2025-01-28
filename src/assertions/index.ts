import async from 'async';
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import cliState from '../cliState';
import { getEnvInt } from '../envars';
import { importModule } from '../esm';
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
import telemetry from '../telemetry';
import type {
  AssertionParams,
  AssertionValueFunctionContext,
  BaseAssertionTypes,
  ProviderResponse,
} from '../types';
import {
  type ApiProvider,
  type Assertion,
  type AssertionType,
  type AtomicTestCase,
  type GradingResult,
} from '../types';
import { isJavascriptFile } from '../util/file';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { transform } from '../util/transform';
import { AssertionsResult } from './AssertionsResult';
import { handleAnswerRelevance } from './answerRelevance';
import { handleBleuScore } from './bleu';
import { handleClassifier } from './classifier';
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
import { handleGEval } from './geval';
import { handleGuardrails } from './guardrails';
import { handleJavascript } from './javascript';
import { handleContainsJson, handleIsJson } from './json';
import { handleLatency } from './latency';
import { handleLevenshtein } from './levenshtein';
import { handleLlmRubric } from './llmRubric';
import { handleModelGradedClosedQa } from './modelGradedClosedQa';
import { handleModeration } from './moderation';
import { handleIsValidOpenAiFunctionCall, handleIsValidOpenAiToolsCall } from './openai';
import { handlePerplexity, handlePerplexityScore } from './perplexity';
import { handlePython } from './python';
import { handleRedteam } from './redteam';
import { handleIsRefusal } from './refusal';
import { handleRegex } from './regex';
import { handleRougeScore } from './rouge';
import { handleSimilar } from './similar';
import { handleContainsSql, handleIsSql } from './sql';
import { handleStartsWith } from './startsWith';
import { coerceString, getFinalTest, processFileReference } from './utils';
import { handleWebhook } from './webhook';
import { handleIsXml } from './xml';

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
]);

const nunjucks = getNunjucksEngine();

export async function runAssertion({
  prompt,
  provider,
  assertion,
  test,
  latencyMs,
  providerResponse,
  assertIndex,
}: {
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion;
  test: AtomicTestCase;
  providerResponse: ProviderResponse;
  latencyMs?: number;
  assertIndex?: number;
}): Promise<GradingResult> {
  const { cost, logProbs, output: originalOutput } = providerResponse;
  let output = originalOutput;

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  const inverse = assertion.type.startsWith('not-');
  const baseType = inverse
    ? (assertion.type.slice(4) as AssertionType)
    : (assertion.type as AssertionType);

  telemetry.record('assertion_used', {
    type: baseType,
  });

  if (assertion.transform) {
    output = await transform(assertion.transform, output, {
      vars: test.vars,
      prompt: { label: prompt },
    });
  }

  const context: AssertionValueFunctionContext = {
    prompt,
    vars: test.vars || {},
    test,
    logProbs,
    provider,
    providerResponse,
    ...(assertion.config ? { config: structuredClone(assertion.config) } : {}),
  };

  // Render assertion values
  let renderedValue = assertion.value;
  let valueFromScript: string | boolean | number | GradingResult | object | undefined;
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
        const requiredModule = await importModule(filePath, functionName);
        if (functionName && typeof requiredModule[functionName] === 'function') {
          valueFromScript = await Promise.resolve(requiredModule[functionName](output, context));
        } else if (typeof requiredModule === 'function') {
          valueFromScript = await Promise.resolve(requiredModule(output, context));
        } else if (requiredModule.default && typeof requiredModule.default === 'function') {
          valueFromScript = await Promise.resolve(requiredModule.default(output, context));
        } else {
          throw new Error(
            `Assertion malformed: ${filePath} must export a function or have a default export as a function`,
          );
        }
        logger.debug(`Javascript script ${filePath} output: ${valueFromScript}`);
      } else if (filePath.endsWith('.py')) {
        try {
          const pythonScriptOutput = await runPython(filePath, functionName || 'get_assert', [
            output,
            context,
          ]);
          valueFromScript = pythonScriptOutput;
          logger.debug(`Python script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            pass: false,
            score: 0,
            reason: (error as Error).message,
            assertion,
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
      renderedValue = nunjucks.renderString(renderedValue, test.vars || {});
    }
  } else if (renderedValue && Array.isArray(renderedValue)) {
    // Process each element in the array
    renderedValue = renderedValue.map((v) => {
      if (typeof v === 'string') {
        if (v.startsWith('file://')) {
          return processFileReference(v);
        }
        return nunjucks.renderString(v, test.vars || {});
      }
      return v;
    });
  }

  const assertionParams: AssertionParams = {
    assertion,
    baseType,
    context,
    cost,
    inverse,
    latencyMs,
    logProbs,
    output,
    outputString: coerceString(output),
    prompt,
    provider,
    providerResponse,
    renderedValue,
    test: getFinalTest(test, assertion),
    valueFromScript,
  };

  const assertionHandlers: Record<
    BaseAssertionTypes,
    (params: AssertionParams) => GradingResult | Promise<GradingResult>
  > = {
    'answer-relevance': handleAnswerRelevance,
    bleu: handleBleuScore,
    classifier: handleClassifier,
    contains: handleContains,
    'contains-all': handleContainsAll,
    'contains-any': handleContainsAny,
    'contains-json': handleContainsJson,
    'contains-sql': handleContainsSql,
    'contains-xml': handleIsXml,
    'context-faithfulness': handleContextFaithfulness,
    'context-recall': handleContextRecall,
    'context-relevance': handleContextRelevance,
    cost: handleCost,
    equals: handleEquals,
    factuality: handleFactuality,
    guardrails: handleGuardrails,
    'g-eval': handleGEval,
    icontains: handleIContains,
    'icontains-all': handleIContainsAll,
    'icontains-any': handleIContainsAny,
    'is-json': handleIsJson,
    'is-refusal': handleIsRefusal,
    'is-sql': handleIsSql,
    'is-valid-openai-function-call': handleIsValidOpenAiFunctionCall,
    'is-valid-openai-tools-call': handleIsValidOpenAiToolsCall,
    'is-xml': handleIsXml,
    javascript: handleJavascript,
    latency: handleLatency,
    levenshtein: handleLevenshtein,
    'llm-rubric': handleLlmRubric,
    'model-graded-closedqa': handleModelGradedClosedQa,
    'model-graded-factuality': handleFactuality,
    moderation: handleModeration,
    perplexity: handlePerplexity,
    'perplexity-score': handlePerplexityScore,
    python: handlePython,
    regex: handleRegex,
    'rouge-n': handleRougeScore,
    similar: handleSimilar,
    'starts-with': handleStartsWith,
    webhook: handleWebhook,
  };

  const handler = assertionHandlers[baseType as keyof typeof assertionHandlers];
  if (handler) {
    const result = await handler(assertionParams);

    // If weight is 0, treat this as a metric-only assertion that can't fail
    if (assertion.weight === 0) {
      return {
        ...result,
        pass: true, // Force pass for weight=0 assertions
      };
    }

    return result;
  }

  if (baseType.startsWith('promptfoo:redteam:')) {
    return handleRedteam(assertionParams);
  }
  throw new Error(`Unknown assertion type: ${assertion.type}`);
}

export async function runAssertions({
  prompt,
  provider,
  providerResponse,
  test,
  latencyMs,
}: {
  prompt?: string;
  provider?: ApiProvider;
  providerResponse: ProviderResponse;
  test: AtomicTestCase;
  latencyMs?: number;
}): Promise<GradingResult> {
  if (!test.assert || test.assert.length < 1) {
    return AssertionsResult.noAssertsResult();
  }

  const mainAssertResult = new AssertionsResult({
    threshold: test.threshold,
  });
  const subAssertResults: AssertionsResult[] = [];
  const asserts: {
    assertion: Assertion;
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
      if (assertion.type.startsWith('select-')) {
        // Select-type assertions are handled separately because they depend on multiple outputs.
        return;
      }

      const result = await runAssertion({
        prompt,
        provider,
        providerResponse,
        assertion,
        test,
        latencyMs,
        assertIndex: index,
      });

      assertResult.addResult({
        index,
        result,
        metric: assertion.metric,
        weight: assertion.weight,
      });
    },
  );

  subAssertResults.forEach((subAssertResult) => {
    const result = subAssertResult.testResult();
    const {
      index,
      assertionSet: { metric, weight },
    } = subAssertResult.parentAssertionSet!;

    mainAssertResult.addResult({
      index,
      result,
      metric,
      weight,
    });
  });

  return mainAssertResult.testResult();
}

export async function runCompareAssertion(
  test: AtomicTestCase,
  assertion: Assertion,
  outputs: string[],
): Promise<GradingResult[]> {
  invariant(typeof assertion.value === 'string', 'select-best must have a string value');
  test = getFinalTest(test, assertion);
  const comparisonResults = await matchesSelectBest(
    assertion.value,
    outputs,
    test.options,
    test.vars,
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

// These exports are used by the node.js package (index.ts)
export default {
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
};
