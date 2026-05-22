import type { AssertionOrSet } from '@promptfoo/types';

const CONTEXT_ASSERTION_TYPES = new Set([
  'context-faithfulness',
  'context-relevance',
  'not-context-faithfulness',
  'not-context-relevance',
]);

function getAtomicAssertions(assertions: AssertionOrSet[] | undefined) {
  return (assertions ?? []).flatMap((assertion) =>
    assertion.type === 'assert-set' ? assertion.assert : [assertion],
  );
}

export function getRequiredAssertionVariables(assertions: AssertionOrSet[] | undefined): string[] {
  const contextAssertions = getAtomicAssertions(assertions).filter((assertion) =>
    CONTEXT_ASSERTION_TYPES.has(assertion.type),
  );
  if (contextAssertions.length === 0) {
    return [];
  }

  const requiredVariables = ['query'];
  if (contextAssertions.some((assertion) => assertion.contextTransform === undefined)) {
    requiredVariables.push('context');
  }
  return requiredVariables;
}

function hasUsableVariable(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'string' && entry.trim() !== '')
  );
}

export function getMissingAssertionVariables(
  assertions: AssertionOrSet[] | undefined,
  vars: Record<string, unknown>,
): string[] {
  return getRequiredAssertionVariables(assertions).filter(
    (variable) => !hasUsableVariable(vars[variable]),
  );
}
