import type { Assertion, AssertionOrSet, AssertionSet, GradingResult } from '../types/index';

export function hasFallback(assertion: Assertion): boolean {
  return assertion.fallback === 'next' || assertion.fallback === true;
}

export function isSpecialCompareAssertion(assertion: Assertion): boolean {
  return assertion.type.startsWith('select-') || assertion.type === 'max-score';
}

function isAssertionSet(assertion: AssertionOrSet): assertion is AssertionSet {
  return assertion.type === 'assert-set';
}

function isRedteamGuardrail(assertion: Assertion): boolean {
  return assertion.type === 'guardrails' && assertion.config?.purpose === 'redteam';
}

export function isRedteamGuardrailFailure(result: GradingResult): boolean {
  return result.assertion !== undefined && isRedteamGuardrail(result.assertion) && !result.pass;
}

export function isAssertionExecutionFailure(result: GradingResult): boolean {
  return result.metadata?.assertionError === true;
}

/**
 * Validates that fallback-bearing assertions are configured correctly.
 *
 * Runs before assertion-set flattening so that fallback chains cannot bridge
 * across an assert-set boundary. The `path` argument carries dotted-index
 * breadcrumbs (e.g. `assert[2].assert[0]`) into recursive calls so users with
 * nested assert-sets can localize a validation failure.
 */
export function validateFallbackChains(assertions: AssertionOrSet[], path = 'assert'): void {
  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const here = `${path}[${i}]`;

    if (isAssertionSet(assertion)) {
      validateFallbackChains(assertion.assert, `${here}.assert`);
      continue;
    }

    if (!hasFallback(assertion)) {
      continue;
    }

    if (isSpecialCompareAssertion(assertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): ${assertion.type} assertions cannot be fallback chain sources`,
      );
    }

    if (isRedteamGuardrail(assertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): redteam guardrail assertions cannot be fallback chain sources`,
      );
    }

    if (i === assertions.length - 1) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): has fallback but no next assertion to fall through to`,
      );
    }

    const nextAssertion = assertions[i + 1];

    if (isAssertionSet(nextAssertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): next assertion is assert-set (not supported as fallback target)`,
      );
    }

    if (isSpecialCompareAssertion(nextAssertion)) {
      throw new Error(
        `Fallback chain misconfigured at ${here} (type: ${assertion.type}): next assertion is ${nextAssertion.type} (not supported as fallback target)`,
      );
    }
  }
}
