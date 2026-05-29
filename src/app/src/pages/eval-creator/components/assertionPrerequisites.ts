import type { AssertionOrSet } from '@promptfoo/types';

const CONTEXT_ASSERTION_TYPES = new Set([
  'context-faithfulness',
  'context-relevance',
  'not-context-faithfulness',
  'not-context-relevance',
]);

function getAtomicAssertions(assertions: unknown[] | undefined): AssertionOrSet[] {
  return (assertions ?? []).flatMap((assertion) => {
    if (!assertion || typeof assertion !== 'object' || !('type' in assertion)) {
      return [];
    }

    const typedAssertion = assertion as AssertionOrSet;
    return typedAssertion.type === 'assert-set' && Array.isArray(typedAssertion.assert)
      ? typedAssertion.assert.filter((nestedAssertion) =>
          Boolean(
            nestedAssertion && typeof nestedAssertion === 'object' && 'type' in nestedAssertion,
          ),
        )
      : [typedAssertion];
  });
}

export function getRequiredAssertionVariables(assertions: unknown[] | undefined): string[] {
  const contextAssertions = getAtomicAssertions(assertions).filter((assertion) =>
    CONTEXT_ASSERTION_TYPES.has(assertion.type),
  );
  if (contextAssertions.length === 0) {
    return [];
  }

  const requiredVariables = ['query'];
  // contextTransform only exists on the regular Assertion variant; getAtomicAssertions
  // unpacks any assert-set wrappers above, so any remaining item with a context type
  // is an Assertion, but TypeScript can't narrow that through Set.has — read defensively.
  if (
    contextAssertions.some((assertion) => {
      const contextTransform = (assertion as { contextTransform?: unknown }).contextTransform;
      return typeof contextTransform !== 'string' || contextTransform.trim() === '';
    })
  ) {
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
  assertions: unknown[] | undefined,
  vars: Record<string, unknown>,
  varsMayComeFromExternalFile = false,
): string[] {
  if (varsMayComeFromExternalFile) {
    return [];
  }

  return getRequiredAssertionVariables(assertions).filter(
    (variable) => !hasUsableVariable(vars[variable]),
  );
}
