import { distance } from 'fastest-levenshtein';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export function handleLevenshtein({
  assertion,
  renderedValue,
  outputString,
}: AssertionParams): GradingResult {
  invariant(
    typeof renderedValue === 'string',
    '"levenshtein" assertion type must have a string value',
  );
  const levDistance = distance(outputString, renderedValue);
  const threshold = assertion.threshold ?? 5;
  const pass = levDistance <= threshold;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Levenshtein distance ${levDistance} is greater than threshold ${threshold}`,
    assertion,
  };
}

export const levenshteinDefinitions = defineAssertions({
  levenshtein: {
    label: 'Levenshtein Distance',
    description: 'Edit distance between output and expected text',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
    handler: handleLevenshtein,
  },
});
