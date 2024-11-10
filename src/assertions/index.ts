import async from 'async';
import fs from 'fs';
import * as rouge from 'js-rouge';
import yaml from 'js-yaml';
import path from 'path';
import invariant from 'tiny-invariant';
import cliState from '../cliState';
import { getEnvInt } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import {
  matchesSimilarity,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesClassification,
  matchesAnswerRelevance,
  matchesContextRecall,
  matchesContextRelevance,
  matchesContextFaithfulness,
  matchesSelectBest,
  matchesModeration,
} from '../matchers';
import { isPackagePath, loadFromPackage } from '../providers/packageParser';
import { runPython } from '../python/pythonUtils';
import telemetry from '../telemetry';
import type { AssertionValue, AssertionValueFunctionContext, ProviderResponse } from '../types';
import {
  type ApiProvider,
  type Assertion,
  type AssertionType,
  type AtomicTestCase,
  type GradingResult,
} from '../types';
import { isJavascriptFile } from '../util/file';
import { getNunjucksEngine } from '../util/templates';
import { transform } from '../util/transform';
import { AssertionsResult } from './AssertionsResult';
import { handleAnswerRelevance } from './answerRelevance';
import { handleBleuScore } from './bleu';
import { handleClassifier } from './classifier';
import {
  handleContains,
  handleIContains,
  handleContainsAny,
  handleIContainsAny,
  handleContainsAll,
  handleIContainsAll,
} from './contains';
import { handleContextFaithfulness } from './contextFaithfulness';
import { handleContextRecall } from './contextRecall';
import { handleContextRelevance } from './contextRelevance';
import { handleCost } from './cost';
import { handleEquals } from './equals';
import { handleFactuality } from './factuality';
import { handleJavascript } from './javascript';
import { handleContainsJson, handleIsJson } from './json';
import { handleLevenshtein } from './levenshtein';
import { handleLlmRubric } from './llmRubric';
import { handleModelGradedClosedQa } from './modelGradedClosedQa';
import { handleModeration } from './moderation';
import { handleIsValidOpenAiFunctionCall, handleIsValidOpenAiToolsCall } from './openai';
import { handlePerplexity, handlePerplexityScore } from './perplexity';
import { handlePython } from './python';
import { handleRedteam } from './redteam';
import { handleRegex } from './regex';
import { handleSimilar } from './similar';
import { handleContainsSql, handleIsSql } from './sql';
import { handleStartsWith } from './startsWith';
import { getFinalTest, processFileReference } from './utils';
import { handleWebhook } from './webhook';
import { handleIsXml } from './xml';

const ASSERTIONS_MAX_CONCURRENCY = getEnvInt('PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY', 3);

export const MODEL_GRADED_ASSERTION_TYPES = new Set<AssertionType>([
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'llm-rubric',
  'model-graded-closedqa',
  'factuality',
  'model-graded-factuality',
]);

const nunjucks = getNunjucksEngine();

function coerceString(value: string | object): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function handleRougeScore(
  baseType: 'rouge-n',
  assertion: Assertion,
  expected: AssertionValue | undefined,
  output: string,
  inverted: boolean,
): GradingResult {
  invariant(typeof expected === 'string', '"rouge" assertion type must be a string value');
  const fnName = baseType[baseType.length - 1] as 'n' | 'l' | 's';
  const rougeMethod = rouge[fnName];
  const score = rougeMethod(output, expected, {});
  const pass = score >= (assertion.threshold || 0.75) != inverted;

  return {
    pass,
    score: inverted ? 1 - score : score,
    reason: pass
      ? `${baseType.toUpperCase()} score ${score.toFixed(
          2,
        )} is greater than or equal to threshold ${assertion.threshold || 0.75}`
      : `${baseType.toUpperCase()} score ${score.toFixed(2)} is less than threshold ${
          assertion.threshold || 0.75
        }`,
    assertion,
  };
}

export async function runAssertion({
  prompt,
  provider,
  assertion,
  test,
  latencyMs,
  providerResponse,
}: {
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion;
  test: AtomicTestCase;
  providerResponse: ProviderResponse;
  latencyMs?: number;
}): Promise<GradingResult> {
  const { cost, logProbs, output: originalOutput } = providerResponse;
  let output = originalOutput;
  let pass: boolean = false;

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  const inverse = assertion.type.startsWith('not-');
  const baseType = inverse ? assertion.type.slice(4) : assertion.type;

  telemetry.record('assertion_used', {
    type: baseType,
  });

  if (assertion.transform) {
    output = await transform(assertion.transform, output, {
      vars: test.vars,
      prompt: { label: prompt },
    });
  }

  const outputString = coerceString(output);

  const context: AssertionValueFunctionContext = {
    prompt,
    vars: test.vars || {},
    test,
    logProbs,
    provider,
    providerResponse,
    ...(assertion.config ? { config: assertion.config } : {}),
  };

  // Render assertion values
  let renderedValue = assertion.value;
  let valueFromScript: string | boolean | number | GradingResult | object | undefined;
  if (typeof renderedValue === 'string') {
    if (renderedValue.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const filePath = path.resolve(basePath, renderedValue.slice('file://'.length));

      if (isJavascriptFile(filePath)) {
        const requiredModule = await importModule(filePath);
        if (typeof requiredModule === 'function') {
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
          const pythonScriptOutput = await runPython(filePath, 'get_assert', [output, context]);
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

  // Transform test
  test = getFinalTest(test, assertion);

  if (baseType === 'equals') {
    return handleEquals(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'is-json') {
    return handleIsJson(assertion, renderedValue, valueFromScript, outputString, inverse);
  }

  if (baseType === 'contains-json') {
    return handleContainsJson(assertion, renderedValue, valueFromScript, outputString, inverse);
  }

  if (baseType === 'is-xml' || baseType === 'contains-xml') {
    return handleIsXml(assertion, baseType, outputString, renderedValue, inverse);
  }

  if (baseType === 'is-sql') {
    return handleIsSql(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'contains-sql') {
    return handleContainsSql(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'contains') {
    return handleContains(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'contains-any') {
    return handleContainsAny(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'icontains') {
    return handleIContains(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'icontains-any') {
    return handleIContainsAny(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'contains-all') {
    return handleContainsAll(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'icontains-all') {
    return handleIContainsAll(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'regex') {
    return handleRegex(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'starts-with') {
    return handleStartsWith(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'is-valid-openai-tools-call') {
    return handleIsValidOpenAiToolsCall(assertion, output, provider, test);
  }

  if (baseType === 'is-valid-openai-function-call') {
    return handleIsValidOpenAiFunctionCall(assertion, output, provider, test);
  }

  if (baseType === 'javascript') {
    return handleJavascript(
      assertion,
      renderedValue,
      valueFromScript,
      outputString,
      context,
      output,
      inverse,
    );
  }

  if (baseType === 'python') {
    return handlePython(
      assertion,
      renderedValue,
      valueFromScript,
      outputString,
      context,
      output,
      inverse,
    );
  }

  if (baseType === 'similar') {
    return handleSimilar(assertion, renderedValue, outputString, inverse, test);
  }

  if (baseType === 'llm-rubric') {
    return handleLlmRubric(assertion, renderedValue, outputString, test);
  }

  if (baseType === 'model-graded-factuality' || baseType === 'factuality') {
    return handleFactuality(assertion, renderedValue, outputString, test, prompt);
  }

  if (baseType === 'model-graded-closedqa') {
    return handleModelGradedClosedQa(assertion, renderedValue, outputString, test, prompt);
  }

  if (baseType === 'answer-relevance') {
    return handleAnswerRelevance(assertion, outputString, prompt, test.options);
  }

  if (baseType === 'context-recall') {
    return handleContextRecall(assertion, renderedValue, prompt, test);
  }

  if (baseType === 'context-relevance') {
    return handleContextRelevance(assertion, test);
  }

  if (baseType === 'context-faithfulness') {
    return handleContextFaithfulness(assertion, test, output);
  }

  if (baseType === 'moderation') {
    return handleModeration(assertion, test, output, providerResponse, prompt);
  }

  if (baseType === 'webhook') {
    return handleWebhook(assertion, renderedValue, test, prompt, output, inverse);
  }

  if (baseType === 'rouge-n') {
    return handleRougeScore(baseType, assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'bleu') {
    return handleBleuScore(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'levenshtein') {
    return handleLevenshtein(assertion, renderedValue, outputString);
  }

  if (baseType === 'classifier') {
    return handleClassifier(assertion, renderedValue, outputString, test, inverse);
  }

  if (baseType === 'latency') {
    if (!assertion.threshold) {
      throw new Error('Latency assertion must have a threshold in milliseconds');
    }
    if (latencyMs === undefined) {
      throw new Error(
        'Latency assertion does not support cached results. Rerun the eval with --no-cache',
      );
    }
    pass = latencyMs <= assertion.threshold;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Latency ${latencyMs}ms is greater than threshold ${assertion.threshold}ms`,
      assertion,
    };
  }

  if (baseType === 'perplexity') {
    return handlePerplexity(logProbs, assertion);
  }

  if (baseType === 'perplexity-score') {
    return handlePerplexityScore(logProbs, assertion);
  }

  if (baseType === 'cost') {
    return handleCost(cost, assertion);
  }

  if (baseType.startsWith('promptfoo:redteam:')) {
    return handleRedteam(assertion, baseType, test, prompt, outputString, provider, renderedValue);
  }

  throw new Error('Unknown assertion type: ' + assertion.type);
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
