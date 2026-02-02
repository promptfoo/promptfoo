import logger from '../logger';
import invariant from '../util/invariant';
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
let runAssertionFn: ((params: {
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion;
  test: AtomicTestCase;
  vars?: Record<string, VarValue>;
  providerResponse: ProviderResponse;
  latencyMs?: number;
  traceId?: string;
}) => Promise<GradingResult>) | null = null;

/**
 * Set the runAssertion function reference to avoid circular imports.
 * This is called from index.ts during module initialization.
 */
export function setRunAssertionFn(
  fn: NonNullable<typeof runAssertionFn>,
): void {
  runAssertionFn = fn;
}

/**
 * Accumulate token usage from a result into a running total.
 */
function accumulateTokens(total: TokenUsage, result: GradingResult): void {
  if (result.tokensUsed) {
    total.total = (total.total ?? 0) + (result.tokensUsed.total ?? 0);
    total.prompt = (total.prompt ?? 0) + (result.tokensUsed.prompt ?? 0);
    total.completion = (total.completion ?? 0) + (result.tokensUsed.completion ?? 0);
    total.cached = (total.cached ?? 0) + (result.tokensUsed.cached ?? 0);
    total.numRequests = (total.numRequests ?? 0) + (result.tokensUsed.numRequests ?? 0);
  }
}

/**
 * Execute a single sub-assertion within a combinator.
 * Handles both regular assertions and nested combinators.
 */
async function executeSubAssertion(
  subAssertion: Assertion | AssertionSet | CombinatorAssertion,
  context: CombinatorContext,
): Promise<GradingResult> {
  // Handle nested combinator assertions
  if (subAssertion.type === 'and' || subAssertion.type === 'or') {
    return handleCombinator(subAssertion as CombinatorAssertion, context);
  }

  // Handle assert-set by recursively processing as a mini-combinator (AND logic)
  if (subAssertion.type === 'assert-set') {
    const assertSet = subAssertion as AssertionSet;
    const results: GradingResult[] = [];
    let tokensUsed: TokenUsage = { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 };

    for (const innerAssertion of assertSet.assert) {
      const result = await executeSubAssertion(innerAssertion, context);
      results.push(result);
      accumulateTokens(tokensUsed, result);
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
    if (assertSet.threshold !== undefined) {
      pass = avgScore >= assertSet.threshold;
    }

    return {
      pass,
      score: avgScore,
      reason: pass
        ? `Assert-set passed: ${results.filter((r) => r.pass).length}/${results.length} assertions passed`
        : `Assert-set failed: ${results.filter((r) => !r.pass).length} assertion(s) failed`,
      componentResults: results,
      tokensUsed,
    };
  }

  // Regular assertion - use runAssertion
  invariant(
    runAssertionFn,
    'Combinator handler not initialized. This is a bug - setRunAssertionFn must be called before using combinators.',
  );
  return runAssertionFn({
    prompt: context.prompt,
    provider: context.provider,
    assertion: subAssertion as Assertion,
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
  const { type, assert: assertions, shortCircuit = true, threshold } = combinator;

  // Guard against empty assertions (should be caught by validation, but be defensive)
  if (!assertions || assertions.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: `${type.toUpperCase()} combinator has no assertions`,
    };
  }

  const results: GradingResult[] = [];
  const skippedIndices: number[] = [];
  const tokensUsed: TokenUsage = { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 };

  for (let i = 0; i < assertions.length; i++) {
    const subAssertion = assertions[i];

    // Execute the sub-assertion
    const result = await executeSubAssertion(subAssertion, context);
    results.push(result);
    accumulateTokens(tokensUsed, result);

    // Short-circuit evaluation
    if (shortCircuit) {
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
  return computeCombinatorResult(type, results, skippedIndices, combinator, tokensUsed);
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
): GradingResult {
  const { threshold } = combinator;

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

    return {
      pass,
      score: maxScore,
      reason,
      componentResults: results,
      tokensUsed,
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

  return {
    pass,
    score: avgScore,
    reason,
    componentResults: results,
    tokensUsed,
    metadata: {
      combinatorType: 'and',
      executedCount: results.length,
      skippedCount: skippedIndices.length,
      skippedIndices,
      failedCount: results.filter((r) => !r.pass).length,
    },
  };
}
