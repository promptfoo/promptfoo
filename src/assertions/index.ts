import async from 'async';
import { distance as levenshtein } from 'fastest-levenshtein';
import fs from 'fs';
import * as rouge from 'js-rouge';
import yaml from 'js-yaml';
import path from 'path';
import invariant from 'tiny-invariant';
import cliState from '../cliState';
import { getEnvInt } from '../envars';
import { importModule } from '../esm';
import { fetchWithRetries } from '../fetch';
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
import type { OpenAiChatCompletionProvider } from '../providers/openai';
import { validateFunctionCall } from '../providers/openaiUtil';
import { isPackagePath, loadFromPackage } from '../providers/packageParser';
import { parseChatPrompt } from '../providers/shared';
import { runPython } from '../python/pythonUtils';
import { getGraderById } from '../redteam/graders';
import telemetry from '../telemetry';
import type { AssertionValueFunctionContext, ProviderResponse } from '../types';
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
import { handleBleuScore } from './bleu';
import {
  handleContains,
  handleIContains,
  handleContainsAny,
  handleIContainsAny,
  handleContainsAll,
  handleIContainsAll,
} from './contains';
import { handleEquals } from './equals';
import { handleJavascript } from './javascript';
import { handleContainsJson, handleIsJson } from './json';
import { handleLlmRubric } from './llmRubric';
import { handlePerplexity, handlePerplexityScore } from './perplexity';
import { handlePython } from './python';
import { handleRegex } from './regex';
import { handleSimilar } from './similar';
import { handleContainsSql, handleIsSql } from './sql';
import { getFinalTest, processFileReference } from './utils';
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
  expected: string,
  output: string,
  inverted: boolean,
): GradingResult {
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
  let score: number = 0.0;

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
    return handleEquals(assertion, outputString, renderedValue, inverse);
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
    return handleIsSql(assertion, outputString, renderedValue, inverse);
  }

  if (baseType === 'contains-sql') {
    return handleContainsSql(outputString, renderedValue, inverse, assertion);
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
    invariant(renderedValue, '"starts-with" assertion type must have a string value');
    invariant(
      typeof renderedValue === 'string',
      '"starts-with" assertion type must have a string value',
    );
    pass = outputString.startsWith(String(renderedValue)) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}start with "${renderedValue}"`,
      assertion,
    };
  }

  if (baseType === 'is-valid-openai-tools-call') {
    const toolsOutput = output as {
      type: 'function';
      function: { arguments: string; name: string };
    }[];
    if (
      !Array.isArray(toolsOutput) ||
      toolsOutput.length === 0 ||
      typeof toolsOutput[0].function.name !== 'string' ||
      typeof toolsOutput[0].function.arguments !== 'string'
    ) {
      return {
        pass: false,
        score: 0,
        reason: `OpenAI did not return a valid-looking tools response: ${JSON.stringify(
          toolsOutput,
        )}`,
        assertion,
      };
    }

    try {
      toolsOutput.forEach((toolOutput) =>
        validateFunctionCall(
          toolOutput.function,
          (provider as OpenAiChatCompletionProvider).config.tools?.map((tool) => tool.function),
          test.vars,
        ),
      );
      return {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: (err as Error).message,
        assertion,
      };
    }
  }

  if (baseType === 'is-valid-openai-function-call') {
    const functionOutput = output as { arguments: string; name: string };
    if (
      typeof functionOutput !== 'object' ||
      typeof functionOutput.name !== 'string' ||
      typeof functionOutput.arguments !== 'string'
    ) {
      return {
        pass: false,
        score: 0,
        reason: `OpenAI did not return a valid-looking function call: ${JSON.stringify(
          functionOutput,
        )}`,
        assertion,
      };
    }
    try {
      validateFunctionCall(
        functionOutput,
        (provider as OpenAiChatCompletionProvider).config.functions,
        test.vars,
      );
      return {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: (err as Error).message,
        assertion,
      };
    }
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
    invariant(
      typeof renderedValue === 'string',
      'factuality assertion type must have a string value',
    );
    invariant(prompt, 'factuality assertion type must have a prompt');

    if (test.options?.rubricPrompt) {
      // Substitute vars in prompt
      invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
      test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
    }

    return {
      assertion,
      ...(await matchesFactuality(prompt, renderedValue, outputString, test.options, test.vars)),
    };
  }

  if (baseType === 'model-graded-closedqa') {
    invariant(
      typeof renderedValue === 'string',
      'model-graded-closedqa assertion type must have a string value',
    );
    invariant(prompt, 'model-graded-closedqa assertion type must have a prompt');

    if (test.options?.rubricPrompt) {
      // Substitute vars in prompt
      invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
      test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
    }

    return {
      assertion,
      ...(await matchesClosedQa(prompt, renderedValue, outputString, test.options, test.vars)),
    };
  }

  if (baseType === 'answer-relevance') {
    invariant(
      typeof output === 'string',
      'answer-relevance assertion type must evaluate a string output',
    );
    invariant(prompt, 'answer-relevance assertion type must have a prompt');

    const input = typeof test.vars?.query === 'string' ? test.vars.query : prompt;
    return {
      assertion,
      ...(await matchesAnswerRelevance(input, output, assertion.threshold || 0, test.options)),
    };
  }

  if (baseType === 'context-recall') {
    invariant(
      typeof renderedValue === 'string',
      'context-recall assertion type must have a string value',
    );
    invariant(prompt, 'context-recall assertion type must have a prompt');

    return {
      assertion,
      ...(await matchesContextRecall(
        typeof test.vars?.context === 'string' ? test.vars.context : prompt,
        renderedValue,
        assertion.threshold || 0,
        test.options,
        test.vars,
      )),
    };
  }

  if (baseType === 'context-relevance') {
    invariant(test.vars, 'context-relevance assertion type must have a vars object');
    invariant(
      typeof test.vars.query === 'string',
      'context-relevance assertion type must have a query var',
    );
    invariant(
      typeof test.vars.context === 'string',
      'context-relevance assertion type must have a context var',
    );

    return {
      assertion,
      ...(await matchesContextRelevance(
        test.vars.query,
        test.vars.context,
        assertion.threshold || 0,
        test.options,
      )),
    };
  }

  if (baseType === 'context-faithfulness') {
    invariant(test.vars, 'context-faithfulness assertion type must have a vars object');
    invariant(
      typeof test.vars.query === 'string',
      'context-faithfulness assertion type must have a query var',
    );
    invariant(
      typeof test.vars.context === 'string',
      'context-faithfulness assertion type must have a context var',
    );
    invariant(
      typeof output === 'string',
      'context-faithfulness assertion type must have a string output',
    );

    return {
      assertion,
      ...(await matchesContextFaithfulness(
        test.vars.query,
        output,
        test.vars.context,
        assertion.threshold || 0,
        test.options,
      )),
    };
  }

  if (baseType === 'moderation') {
    // Some redteam techniques override the actual prompt that is used, so we need to assess that prompt for moderation.
    const promptToModerate = providerResponse.metadata?.redteamFinalPrompt || prompt;
    const outputString = typeof output === 'string' ? output : JSON.stringify(output);
    invariant(promptToModerate, 'moderation assertion type must have a prompt');
    invariant(
      !assertion.value ||
        (Array.isArray(assertion.value) && typeof assertion.value[0] === 'string'),
      'moderation assertion value must be a string array if set',
    );

    if (promptToModerate[0] === '[' || promptToModerate[0] === '{') {
      // Try to extract the last user message from OpenAI-style prompts.
      try {
        const parsedPrompt = parseChatPrompt<null | { role: string; content: string }[]>(
          promptToModerate,
          null,
        );
        if (parsedPrompt && parsedPrompt.length > 0) {
          prompt = parsedPrompt[parsedPrompt.length - 1].content;
        }
      } catch {
        // Ignore error
      }
    }

    const moderationResult = await matchesModeration(
      {
        userPrompt: promptToModerate,
        assistantResponse: outputString,
        categories: Array.isArray(assertion.value) ? assertion.value : [],
      },
      test.options,
    );

    pass = moderationResult.pass;
    return {
      pass,
      score: moderationResult.score,
      reason: moderationResult.reason,
      assertion,
    };
  }

  if (baseType === 'webhook') {
    invariant(renderedValue, '"webhook" assertion type must have a URL value');
    invariant(typeof renderedValue === 'string', '"webhook" assertion type must have a URL value');

    try {
      const context = {
        prompt,
        vars: test.vars || {},
      };
      const response = await fetchWithRetries(
        renderedValue,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ output, context }),
        },
        getEnvInt('WEBHOOK_TIMEOUT', 5000),
      );

      if (!response.ok) {
        throw new Error(`Webhook response status: ${response.status}`);
      }

      const jsonResponse = await response.json();
      pass = jsonResponse.pass !== inverse;
      score =
        typeof jsonResponse.score === 'undefined'
          ? pass
            ? 1
            : 0
          : inverse
            ? 1 - jsonResponse.score
            : jsonResponse.score;

      const reason =
        jsonResponse.reason ||
        (pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`);

      return {
        pass,
        score,
        reason,
        assertion,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Webhook error: ${(err as Error).message}`,
        assertion,
      };
    }
  }

  if (baseType === 'rouge-n') {
    invariant(typeof renderedValue === 'string', '"rouge" assertion type must be a string value');
    return handleRougeScore(baseType, assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'bleu') {
    invariant(
      typeof renderedValue === 'string' ||
        (Array.isArray(renderedValue) && renderedValue.every((v) => typeof v === 'string')),
      '"bleu" assertion type must have a string or array of strings value',
    );
    return handleBleuScore(assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'levenshtein') {
    invariant(
      typeof renderedValue === 'string',
      '"levenshtein" assertion type must have a string value',
    );
    const levDistance = levenshtein(outputString, renderedValue);
    pass = levDistance <= (assertion.threshold || 5);
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Levenshtein distance ${levDistance} is greater than threshold ${
            assertion.threshold || 5
          }`,
      assertion,
    };
  }

  if (baseType === 'classifier') {
    invariant(
      typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
      '"classifier" assertion type must have a string value or be undefined',
    );

    // Assertion provider overrides test provider
    const classificationResult = await matchesClassification(
      renderedValue,
      outputString,
      assertion.threshold ?? 1,
      test.options,
    );

    if (inverse) {
      classificationResult.pass = !classificationResult.pass;
      classificationResult.score = 1 - classificationResult.score;
    }

    return {
      assertion,
      ...classificationResult,
    };
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
    if (!assertion.threshold) {
      throw new Error('Cost assertion must have a threshold');
    }
    if (typeof cost === 'undefined') {
      throw new Error('Cost assertion does not support providers that do not return cost');
    }

    pass = cost <= assertion.threshold;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Cost ${cost.toPrecision(2)} is greater than threshold ${assertion.threshold}`,
      assertion,
    };
  }

  if (baseType.startsWith('promptfoo:redteam:')) {
    const grader = getGraderById(baseType);
    invariant(grader, `Unknown promptfoo grader: ${baseType}`);
    invariant(prompt, `Promptfoo grader ${baseType} must have a prompt`);
    const { grade, rubric, suggestions } = await grader.getResult(
      prompt,
      outputString,
      test,
      provider,
      renderedValue,
    );
    return {
      assertion: {
        ...assertion,
        value: rubric,
      },
      ...grade,
      suggestions,
      metadata: {
        // Pass through all test metadata for redteam
        ...test.metadata,
        ...grade.metadata,
      },
    };
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
