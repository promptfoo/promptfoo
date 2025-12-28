import { matchesClassification } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

export async function handleClassifier({
  assertion,
  renderedValue,
  outputString,
  test,
  inverse,
}: AssertionParams): Promise<GradingResult> {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
    '"classifier" assertion type must have a string value or be undefined',
  );
  // Assertion provider overrides test provider
  const classificationResult = await matchesClassification(
    renderedValue,
    outputString,
    (assertion.threshold as number) ?? 1,
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

export const classifierDefinitions = defineAssertions({
  classifier: {
    label: 'HuggingFace Classifier',
    description: 'Classifies output using HuggingFace models (sentiment, toxicity, etc.)',
    tags: ['ai-evaluation', 'embeddings'],
    valueType: 'string',
    supportsThreshold: true,
    handler: handleClassifier,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/classifier',
  },
});
