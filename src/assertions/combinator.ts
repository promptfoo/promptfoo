/**
 * Combinator Assertions - AND/OR logical operators for assertions
 *
 * This module implements 'and' and 'or' combinator assertions that allow
 * grouping multiple assertions with logical operators.
 *
 * ## Design Decisions
 *
 * ### 1. Config Inheritance (child wins)
 * Combinator-level config is merged into sub-assertions, but the child
 * assertion's own config takes precedence. This allows setting defaults
 * at the combinator level while permitting overrides:
 *
 *   - type: and
 *     config: { temperature: 0.5 }  # default for all
 *     assert:
 *       - type: llm-rubric
 *         config: { temperature: 0.1 }  # overrides parent
 *
 * ### 2. Short-Circuit vs Threshold
 * When a threshold is set, short-circuit evaluation is automatically
 * disabled. This is because:
 * - OR with threshold: stopping on first pass might miss a higher score
 * - AND with threshold: early fail ignores that average might meet threshold
 * Without threshold, short-circuit is enabled by default for efficiency.
 *
 * ### 3. namedScores Propagation
 * Named scores from nested assertions are collected and propagated up
 * to the combinator's result. This allows tracking metrics from
 * individual assertions within a combinator group.
 *
 * ### 4. Blocked Assertion Types
 * select-best and max-score assertions cannot be used inside combinators
 * (including within assert-sets nested inside combinators). These assertions
 * have special evaluation semantics incompatible with combinator logic.
 *
 * ### 5. Token Usage Aggregation
 * Token usage from all executed sub-assertions is accumulated and
 * reported in the combinator's result.
 */

import { getEnvBool } from '../envars';
import logger from '../logger';
import invariant from '../util/invariant';
import { GUARDRAIL_BLOCKED_REASON } from './assertionsResult';
import { renderMetricName } from './metricUtils';

import type {
  ApiProvider,
  Assertion,
  AssertionSet,
  AtomicTestCase,
  CombinatorAssertion,
  GradingResult,
  ProviderResponse,
  TokenUsage,
  VarValue,
} from '../types/index';

interface CombinatorContext {
  prompt?: string;
  provider?: ApiProvider;
  providerResponse: ProviderResponse;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  latencyMs?: number;
  traceId?: string;
}

// Forward declaration - will be set by index.ts to avoid circular dependency
let runAssertionFn:
  | ((params: {
      prompt?: string;
      provider?: ApiProvider;
      assertion: Assertion;
      test: AtomicTestCase;
      vars?: Record<string, VarValue>;
      providerResponse: ProviderResponse;
      latencyMs?: number;
      traceId?: string;
    }) => Promise<GradingResult>)
  | null = null;

/**
 * Set the runAssertion function reference to avoid circular imports.
 * This is called from index.ts during module initialization.
 */
export function setRunAssertionFn(fn: NonNullable<typeof runAssertionFn>): void {
  runAssertionFn = fn;
}

/**
 * Get the current runAssertion function reference.
 * Used by tests to save/restore the function when overriding it.
 */
export function getRunAssertionFn(): typeof runAssertionFn {
  return runAssertionFn;
}

/**
 * Accumulate token usage from a result into a running total.
 * Includes all fields: total, prompt, completion, cached, numRequests,
 * assertions (for model-graded), and completionDetails.
 */
function accumulateTokens(total: TokenUsage, result: GradingResult): void {
  if (result.tokensUsed) {
    total.total = (total.total ?? 0) + (result.tokensUsed.total ?? 0);
    total.prompt = (total.prompt ?? 0) + (result.tokensUsed.prompt ?? 0);
    total.completion = (total.completion ?? 0) + (result.tokensUsed.completion ?? 0);
    total.cached = (total.cached ?? 0) + (result.tokensUsed.cached ?? 0);
    total.numRequests = (total.numRequests ?? 0) + (result.tokensUsed.numRequests ?? 0);

    // Accumulate assertion-specific token usage (model-graded assertions)
    if (result.tokensUsed.assertions) {
      if (!total.assertions) {
        total.assertions = { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 };
      }
      const src = result.tokensUsed.assertions;
      total.assertions.total = (total.assertions.total ?? 0) + (src.total ?? 0);
      total.assertions.prompt = (total.assertions.prompt ?? 0) + (src.prompt ?? 0);
      total.assertions.completion = (total.assertions.completion ?? 0) + (src.completion ?? 0);
      total.assertions.cached = (total.assertions.cached ?? 0) + (src.cached ?? 0);
      total.assertions.numRequests = (total.assertions.numRequests ?? 0) + (src.numRequests ?? 0);
    }

    // Merge completionDetails if present
    if (result.tokensUsed.completionDetails) {
      if (!total.completionDetails) {
        total.completionDetails = {};
      }
      const srcDetails = result.tokensUsed.completionDetails;
      const dstDetails = total.completionDetails;
      if (srcDetails.reasoning !== undefined) {
        dstDetails.reasoning = (dstDetails.reasoning ?? 0) + srcDetails.reasoning;
      }
      if (srcDetails.acceptedPrediction !== undefined) {
        dstDetails.acceptedPrediction =
          (dstDetails.acceptedPrediction ?? 0) + srcDetails.acceptedPrediction;
      }
      if (srcDetails.rejectedPrediction !== undefined) {
        dstDetails.rejectedPrediction =
          (dstDetails.rejectedPrediction ?? 0) + srcDetails.rejectedPrediction;
      }
    }
  }
}

/**
 * Merge namedScores from a result into an accumulator, with optional prefix for namespacing.
 * Also handles the metric field from assertions by adding it to namedScores.
 *
 * DESIGN DECISION: Nested Metric Preservation
 * - namedScores from nested assertions are collected with path-based namespacing
 * - If a nested assertion has a metric field, it's added as a namedScore
 * - Metric templates (e.g., {{category}}_score) are rendered using test variables
 * - Collisions are avoided by prefixing with the assertion index path
 */
function mergeNamedScores(
  target: Record<string, number>,
  result: GradingResult,
  vars: Record<string, unknown>,
  prefix?: string,
): void {
  // Merge namedScores with optional prefix
  if (result.namedScores) {
    for (const [key, value] of Object.entries(result.namedScores)) {
      const prefixedKey = prefix ? `${prefix}.${key}` : key;
      // If key already exists without prefix, use prefixed version to avoid clobbering
      if (key in target && !prefix) {
        target[`nested.${key}`] = value;
      } else {
        target[prefixedKey] = value;
      }
    }
  }

  // If the assertion has a metric field, render template and add the score to namedScores
  // Skip if key already exists (e.g., from namedScores) to avoid overwriting custom values
  if (result.assertion && 'metric' in result.assertion && result.assertion.metric) {
    const rawMetric = result.assertion.metric as string;
    const renderedMetric = renderMetricName(rawMetric, vars) ?? rawMetric;
    const metricKey = prefix ? `${prefix}.${renderedMetric}` : renderedMetric;
    if (!(metricKey in target)) {
      target[metricKey] = result.score;
    }
  }
}

/**
 * Execute a single sub-assertion within a combinator.
 * Handles both regular assertions and nested combinators.
 *
 * DESIGN DECISION: Config inheritance
 * - Combinator-level config is merged into sub-assertions
 * - Child assertion's own config takes precedence (child wins)
 * - This allows setting defaults at combinator level while allowing overrides
 */
async function executeSubAssertion(
  subAssertion: Assertion | AssertionSet | CombinatorAssertion,
  context: CombinatorContext,
  parentConfig?: Record<string, unknown>,
): Promise<GradingResult> {
  // Handle nested combinator assertions - propagate parent config
  if (subAssertion.type === 'and' || subAssertion.type === 'or') {
    const nestedCombinator = subAssertion as CombinatorAssertion;
    // Merge parent config with nested combinator's own config (nested config wins)
    const mergedConfig = parentConfig
      ? { ...parentConfig, ...nestedCombinator.config }
      : nestedCombinator.config;

    // Create a new combinator with merged config
    const combinatorWithConfig: CombinatorAssertion = mergedConfig
      ? { ...nestedCombinator, config: mergedConfig }
      : nestedCombinator;

    return handleCombinator(combinatorWithConfig, context);
  }

  // Handle assert-set by recursively processing as a mini-combinator (AND logic)
  if (subAssertion.type === 'assert-set') {
    const assertSet = subAssertion as AssertionSet;
    const results: GradingResult[] = [];
    const tokensUsed: TokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
    };
    const namedScores: Record<string, number> = {};
    const vars = context.vars || context.test.vars || {};
    let failedContentSafetyChecks = false;

    // Pass parent config through to inner assertions (combinator config inheritance).
    // Note: assert-set.config is NOT merged here because top-level assert-sets also
    // ignore their own config property. Only combinator-level config flows through.
    for (let i = 0; i < assertSet.assert.length; i++) {
      const innerAssertion = assertSet.assert[i];
      const result = await executeSubAssertion(innerAssertion, context, parentConfig);
      results.push(result);
      accumulateTokens(tokensUsed, result);
      // Merge namedScores with index prefix to avoid collisions
      mergeNamedScores(namedScores, result, vars, `assert-set[${i}]`);

      // Detect redteam guardrail failures (matches AssertionsResult behavior)
      if (
        result.assertion?.type === 'guardrails' &&
        result.assertion?.config?.purpose === 'redteam' &&
        !result.pass
      ) {
        failedContentSafetyChecks = true;
      }

      // Respect PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES (matches AssertionsResult behavior)
      if (!result.pass && getEnvBool('PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES')) {
        throw new Error(result.reason);
      }
    }

    // Assert-set uses AND logic with optional threshold
    const allPassed = results.every((r) => r.pass);
    const totalWeight = results.reduce((sum, _, i) => sum + (assertSet.assert[i].weight ?? 1), 0);
    const weightedSum = results.reduce(
      (sum, r, i) => sum + r.score * (assertSet.assert[i].weight ?? 1),
      0,
    );
    const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    let pass = allPassed;
    let reason: string;
    if (assertSet.threshold !== undefined) {
      pass = avgScore >= assertSet.threshold;
    }

    // Guardrail override: if a redteam guardrail was blocked, force pass
    if (failedContentSafetyChecks) {
      pass = true;
      reason = GUARDRAIL_BLOCKED_REASON;
    } else if (assertSet.threshold !== undefined) {
      reason = pass
        ? `Assert-set passed: avg score ${avgScore.toFixed(2)} >= threshold ${assertSet.threshold}`
        : `Assert-set failed: avg score ${avgScore.toFixed(2)} < threshold ${assertSet.threshold}`;
    } else {
      reason = pass
        ? `Assert-set passed: ${results.filter((r) => r.pass).length}/${results.length} assertions passed`
        : `Assert-set failed: ${results.filter((r) => !r.pass).length} assertion(s) failed`;
    }

    // Add assert-set's own metric to namedScores if specified
    if (assertSet.metric) {
      const renderedMetric = renderMetricName(assertSet.metric, vars) ?? assertSet.metric;
      namedScores[renderedMetric] = avgScore;
    }

    return {
      pass,
      score: avgScore,
      reason,
      // biome-ignore lint/suspicious/noExplicitAny: GradingResult.assertion uses any to avoid TS complexity
      assertion: assertSet as any,
      componentResults: results,
      tokensUsed,
      namedScores: Object.keys(namedScores).length > 0 ? namedScores : undefined,
    };
  }

  // Regular assertion - merge parent config (child config wins)
  const assertion = subAssertion as Assertion;
  const mergedAssertion: Assertion = parentConfig
    ? { ...assertion, config: { ...parentConfig, ...assertion.config } }
    : assertion;

  invariant(
    runAssertionFn,
    'Combinator handler not initialized. This is a bug - setRunAssertionFn must be called before using combinators.',
  );
  return runAssertionFn({
    prompt: context.prompt,
    provider: context.provider,
    assertion: mergedAssertion,
    test: context.test,
    vars: context.vars,
    providerResponse: context.providerResponse,
    latencyMs: context.latencyMs,
    traceId: context.traceId,
  });
}

/**
 * Handle 'and' and 'or' combinator assertions.
 *
 * OR combinator:
 * - Pass: if ANY sub-assertion passes
 * - Score: maximum score among all executed assertions
 * - Short-circuit: stops on first passing assertion (if enabled)
 *
 * AND combinator:
 * - Pass: if ALL sub-assertions pass
 * - Score: weighted average of all executed assertion scores
 * - Short-circuit: stops on first failing assertion (if enabled)
 */
export async function handleCombinator(
  combinator: CombinatorAssertion,
  context: CombinatorContext,
): Promise<GradingResult> {
  const { type, assert: assertions, shortCircuit = true, threshold, config } = combinator;

  // Guard against empty assertions (should be caught by validation, but be defensive)
  if (!assertions || assertions.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: `${type.toUpperCase()} combinator has no assertions`,
    };
  }

  // DESIGN DECISION: When threshold is set, we MUST evaluate all assertions to compute
  // the correct score. Short-circuiting would produce incorrect scores:
  // - OR with threshold: stopping on first pass might miss a higher score
  // - AND with threshold: stopping on first fail ignores that avg might meet threshold
  const effectiveShortCircuit = shortCircuit && threshold === undefined;

  const results: GradingResult[] = [];
  const skippedIndices: number[] = [];
  const tokensUsed: TokenUsage = { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 };
  const namedScores: Record<string, number> = {};
  const vars = context.vars || context.test.vars || {};
  let failedContentSafetyChecks = false;

  for (let i = 0; i < assertions.length; i++) {
    const subAssertion = assertions[i];

    // Execute the sub-assertion, passing down combinator-level config (child config wins)
    const result = await executeSubAssertion(subAssertion, context, config);
    results.push(result);
    accumulateTokens(tokensUsed, result);

    // Propagate namedScores from nested assertions with index prefix
    mergeNamedScores(namedScores, result, vars, `${type}[${i}]`);

    // Detect redteam guardrail failures (matches AssertionsResult behavior)
    if (
      result.assertion?.type === 'guardrails' &&
      result.assertion?.config?.purpose === 'redteam' &&
      !result.pass
    ) {
      failedContentSafetyChecks = true;
    }

    // Respect PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES (matches AssertionsResult behavior)
    if (!result.pass && getEnvBool('PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES')) {
      throw new Error(result.reason);
    }

    // Short-circuit evaluation (only when no threshold is set)
    if (effectiveShortCircuit) {
      if (type === 'or' && result.pass) {
        // OR: Found passing assertion, skip remaining
        const remaining = assertions.length - i - 1;
        for (let j = i + 1; j < assertions.length; j++) {
          skippedIndices.push(j);
        }
        if (remaining > 0) {
          logger.debug(
            `[Combinator] OR short-circuit: assertion ${i} passed, skipping ${remaining} remaining`,
          );
        }
        break;
      }

      if (type === 'and' && !result.pass) {
        // AND: Found failing assertion, skip remaining
        const remaining = assertions.length - i - 1;
        for (let j = i + 1; j < assertions.length; j++) {
          skippedIndices.push(j);
        }
        if (remaining > 0) {
          logger.debug(
            `[Combinator] AND short-circuit: assertion ${i} failed, skipping ${remaining} remaining`,
          );
        }
        break;
      }
    }
  }

  // Compute final result based on combinator type
  return computeCombinatorResult(
    type,
    results,
    skippedIndices,
    combinator,
    tokensUsed,
    namedScores,
    vars,
    failedContentSafetyChecks,
  );
}

/**
 * Compute the final GradingResult for a combinator based on its type and sub-results.
 */
function computeCombinatorResult(
  type: 'and' | 'or',
  results: GradingResult[],
  skippedIndices: number[],
  combinator: CombinatorAssertion,
  tokensUsed: TokenUsage,
  namedScores: Record<string, number>,
  vars: Record<string, unknown>,
  failedContentSafetyChecks: boolean,
): GradingResult {
  const { threshold, metric } = combinator;

  if (type === 'or') {
    // OR: pass if any passed, score = max score
    const anyPassed = results.some((r) => r.pass);
    const maxScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0;

    let pass = anyPassed;
    let reason: string;

    if (threshold !== undefined) {
      pass = maxScore >= threshold;
      reason = pass
        ? `OR combinator passed: best score ${maxScore.toFixed(2)} >= threshold ${threshold}`
        : `OR combinator failed: best score ${maxScore.toFixed(2)} < threshold ${threshold}`;
    } else {
      reason = pass
        ? `OR combinator passed: ${results.filter((r) => r.pass).length}/${results.length} assertion(s) passed`
        : `OR combinator failed: no assertions passed`;
    }

    // Include details about why it failed
    if (!pass && results.length > 0) {
      const failReasons = results
        .filter((r) => !r.pass)
        .map((r) => r.reason)
        .slice(0, 3);
      if (failReasons.length > 0) {
        reason += ` (${failReasons.join('; ')})`;
      }
    }

    // Guardrail override: if a redteam guardrail was blocked, force pass
    if (failedContentSafetyChecks) {
      pass = true;
      reason = GUARDRAIL_BLOCKED_REASON;
    }

    // Add combinator's own metric to namedScores if specified (render template)
    if (metric) {
      const renderedMetric = renderMetricName(metric, vars) ?? metric;
      namedScores[renderedMetric] = maxScore;
    }

    return {
      pass,
      score: maxScore,
      reason,
      assertion: combinator,
      componentResults: results,
      tokensUsed,
      namedScores: Object.keys(namedScores).length > 0 ? namedScores : undefined,
      metadata: {
        combinatorType: 'or',
        executedCount: results.length,
        skippedCount: skippedIndices.length,
        skippedIndices,
      },
    };
  }

  // AND: pass if all passed, score = weighted average
  const allPassed = results.every((r) => r.pass);

  // Calculate weighted average score
  let totalWeight = 0;
  let weightedSum = 0;
  for (let i = 0; i < results.length; i++) {
    const subAssertion = combinator.assert[i];
    const weight = 'weight' in subAssertion ? (subAssertion.weight ?? 1) : 1;
    weightedSum += results[i].score * weight;
    totalWeight += weight;
  }
  const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  let pass = allPassed;
  let reason: string;

  if (threshold !== undefined) {
    pass = avgScore >= threshold;
    reason = pass
      ? `AND combinator passed: avg score ${avgScore.toFixed(2)} >= threshold ${threshold}`
      : `AND combinator failed: avg score ${avgScore.toFixed(2)} < threshold ${threshold}`;
  } else {
    reason = pass
      ? `AND combinator passed: all ${results.length} assertion(s) passed`
      : `AND combinator failed`;
  }

  // Include details about why it failed
  if (!pass) {
    const failedResults = results.filter((r) => !r.pass);
    if (failedResults.length > 0) {
      reason += `: ${failedResults[0].reason}`;
    }
  }

  // Guardrail override: if a redteam guardrail was blocked, force pass
  if (failedContentSafetyChecks) {
    pass = true;
    reason = GUARDRAIL_BLOCKED_REASON;
  }

  // Add combinator's own metric to namedScores if specified (render template)
  if (metric) {
    const renderedMetric = renderMetricName(metric, vars) ?? metric;
    namedScores[renderedMetric] = avgScore;
  }

  return {
    pass,
    score: avgScore,
    reason,
    assertion: combinator,
    componentResults: results,
    tokensUsed,
    namedScores: Object.keys(namedScores).length > 0 ? namedScores : undefined,
    metadata: {
      combinatorType: 'and',
      executedCount: results.length,
      skippedCount: skippedIndices.length,
      skippedIndices,
      failedCount: results.filter((r) => !r.pass).length,
    },
  };
}
