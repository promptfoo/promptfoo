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
  currentPredicates: string[];
  legacyPredicates: string[];
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
  currentPredicates: readonly string[],
  legacyPredicates: readonly string[],
): PredicateSignatureDelta {
  const currentPredicateSet = new Set(currentPredicates);

  return {
    currentPredicates: [...currentPredicates],
    legacyPredicates: [...legacyPredicates],
    lostPredicates: legacyPredicates.filter((predicate) => !currentPredicateSet.has(predicate)),
  };
}
