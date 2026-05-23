export type DriftSeverity =
  | 'benign-rewrite'
  | 'dangerous-feature-loss'
  | 'exact-preserved'
  | 'non-dangerous-truncation';

export type PromptDriftSeverityInput = {
  currentPrompt: string;
  expectedFeatures: readonly string[];
  legacyPrompt: string;
};

export type PredicateSignatureDelta = {
  expectedPredicates: string[];
  observedPredicates: string[];
  lostPredicates: string[];
};

export function classifyPromptDriftSeverity({
  currentPrompt,
  expectedFeatures,
  legacyPrompt,
}: PromptDriftSeverityInput): DriftSeverity {
  if (legacyPrompt === currentPrompt) {
    return 'exact-preserved';
  }

  const retainedFeatureCount = expectedFeatures.filter((feature) =>
    legacyPrompt.includes(feature),
  ).length;
  if (retainedFeatureCount < expectedFeatures.length) {
    return 'dangerous-feature-loss';
  }

  if (legacyPrompt.length < currentPrompt.length && currentPrompt.startsWith(legacyPrompt)) {
    return 'non-dangerous-truncation';
  }

  return 'benign-rewrite';
}

export function diffActivePredicates(
  expectedPredicates: readonly string[],
  observedPredicates: readonly string[],
): PredicateSignatureDelta {
  const observedPredicateSet = new Set(observedPredicates);

  return {
    expectedPredicates: [...expectedPredicates],
    observedPredicates: [...observedPredicates],
    lostPredicates: expectedPredicates.filter((predicate) => !observedPredicateSet.has(predicate)),
  };
}
