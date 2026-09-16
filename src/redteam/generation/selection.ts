import type { AttackCandidate, AttackFamily, AttackPlan } from './types';

export type SemanticBandSelectionConfig = {
  bands: Record<string, readonly string[]>;
  weights: Record<string, number>;
};

export function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(prompt: string): Set<string> {
  return new Set(
    normalizePrompt(prompt)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) {
      intersection += 1;
    }
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function getCoverageCell(candidate: AttackCandidate): string {
  const activePredicates = Object.entries(candidate.signature.predicates)
    .filter(([, enabled]) => enabled)
    .map(([predicate]) => predicate)
    .sort()
    .join(',');
  const attributes = Object.entries(candidate.signature.attributes ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(',');

  return [candidate.pluginId, candidate.familyId, activePredicates, attributes].join('|');
}

function getNoveltyScore(candidate: AttackCandidate, selected: AttackCandidate[]): number {
  if (selected.length === 0) {
    return 1;
  }

  const candidateTokens = tokenize(candidate.prompt);
  const maxSimilarity = Math.max(
    ...selected.map((existing) => jaccardSimilarity(candidateTokens, tokenize(existing.prompt))),
  );

  return 1 - maxSimilarity;
}

function compareCandidates(
  left: AttackCandidate,
  right: AttackCandidate,
  selected: AttackCandidate[],
): number {
  const noveltyDelta = getNoveltyScore(right, selected) - getNoveltyScore(left, selected);
  if (noveltyDelta !== 0) {
    return noveltyDelta;
  }

  return left.prompt.localeCompare(right.prompt);
}

function dedupeCandidatesByPrompt(candidates: readonly AttackCandidate[]): AttackCandidate[] {
  const dedupedByPrompt = new Map<string, AttackCandidate>();
  for (const candidate of candidates) {
    const key = normalizePrompt(candidate.prompt);
    if (!dedupedByPrompt.has(key)) {
      dedupedByPrompt.set(key, candidate);
    }
  }

  return [...dedupedByPrompt.values()];
}

export function buildBalancedAttackPlan(
  families: readonly AttackFamily[],
  requestedCount: number,
): AttackPlan {
  if (requestedCount <= 0 || families.length === 0) {
    return {
      requestedCount,
      families: [],
    };
  }

  const counts = new Map<string, number>();
  for (let index = 0; index < requestedCount; index += 1) {
    const family = families[index % families.length];
    counts.set(family.id, (counts.get(family.id) ?? 0) + 1);
  }

  return {
    requestedCount,
    families: families
      .map((family) => ({
        ...family,
        count: counts.get(family.id) ?? 0,
      }))
      .filter((family) => family.count > 0),
  };
}

function getDeclaredSemanticBandGain(
  family: AttackFamily,
  selectedPredicates: ReadonlySet<string>,
  config: SemanticBandSelectionConfig,
): number {
  const requiredPredicates = new Set(family.requiredPredicates ?? []);

  return Object.entries(config.bands).reduce((score, [bandId, predicates]) => {
    const newlyCoveredPredicates = predicates.filter(
      (predicate) => requiredPredicates.has(predicate) && !selectedPredicates.has(predicate),
    ).length;

    return score + newlyCoveredPredicates * (config.weights[bandId] ?? 1);
  }, 0);
}

export function selectSemanticWarmStartFamilies(
  families: readonly AttackFamily[],
  familyCount: number,
  config: SemanticBandSelectionConfig,
): AttackFamily[] {
  if (familyCount <= 0) {
    return [];
  }

  const remaining = [...families];
  const selected: AttackFamily[] = [];
  const selectedPredicates = new Set<string>();

  while (selected.length < familyCount && remaining.length > 0) {
    remaining.sort((left, right) => {
      const semanticDelta =
        getDeclaredSemanticBandGain(right, selectedPredicates, config) -
        getDeclaredSemanticBandGain(left, selectedPredicates, config);
      if (semanticDelta !== 0) {
        return semanticDelta;
      }

      const requiredPredicateDelta =
        (right.requiredPredicates?.length ?? 0) - (left.requiredPredicates?.length ?? 0);
      if (requiredPredicateDelta !== 0) {
        return requiredPredicateDelta;
      }

      return left.id.localeCompare(right.id);
    });

    const next = remaining.shift();
    if (!next) {
      break;
    }

    selected.push(next);
    for (const predicate of next.requiredPredicates ?? []) {
      selectedPredicates.add(predicate);
    }
  }

  return selected;
}

export function selectCoverageAwareCandidates(
  candidates: readonly AttackCandidate[],
  requestedCount: number,
): AttackCandidate[] {
  if (requestedCount <= 0) {
    return [];
  }

  const deduped = dedupeCandidatesByPrompt(candidates);
  const byCell = new Map<string, AttackCandidate[]>();
  const byFamily = new Map<string, AttackCandidate[]>();
  for (const candidate of deduped) {
    const cell = getCoverageCell(candidate);
    const existing = byCell.get(cell) ?? [];
    existing.push(candidate);
    byCell.set(cell, existing);

    const familyKey = [candidate.pluginId, candidate.familyId].join('|');
    const familyCandidates = byFamily.get(familyKey) ?? [];
    familyCandidates.push(candidate);
    byFamily.set(familyKey, familyCandidates);
  }

  const selected: AttackCandidate[] = [];
  const familyGroups = [...byFamily.entries()].sort(([left], [right]) => left.localeCompare(right));

  for (const [, familyCandidates] of familyGroups) {
    if (selected.length >= requestedCount) {
      break;
    }

    const next = [...familyCandidates].sort((left, right) =>
      compareCandidates(left, right, selected),
    )[0];
    selected.push(next);
  }

  const cells = [...byCell.entries()].sort(([left], [right]) => left.localeCompare(right));

  for (const [, cellCandidates] of cells) {
    if (selected.length >= requestedCount) {
      break;
    }

    const selectedPrompts = new Set(selected.map((candidate) => normalizePrompt(candidate.prompt)));
    const availableCellCandidates = cellCandidates.filter(
      (candidate) => !selectedPrompts.has(normalizePrompt(candidate.prompt)),
    );
    if (availableCellCandidates.length === 0) {
      continue;
    }

    const next = [...availableCellCandidates].sort((left, right) =>
      compareCandidates(left, right, selected),
    )[0];
    selected.push(next);
  }

  const selectedPrompts = new Set(selected.map((candidate) => normalizePrompt(candidate.prompt)));
  const remaining = deduped.filter(
    (candidate) => !selectedPrompts.has(normalizePrompt(candidate.prompt)),
  );

  while (selected.length < requestedCount && remaining.length > 0) {
    remaining.sort((left, right) => compareCandidates(left, right, selected));
    const next = remaining.shift();
    if (!next) {
      break;
    }
    selected.push(next);
  }

  return selected;
}

function getSemanticBandGain(
  candidate: AttackCandidate,
  selectedPredicates: ReadonlySet<string>,
  config: SemanticBandSelectionConfig,
): number {
  return Object.entries(config.bands).reduce((score, [bandId, predicates]) => {
    const newlyCoveredPredicates = predicates.filter(
      (predicate) =>
        candidate.signature.predicates[predicate] === true && !selectedPredicates.has(predicate),
    ).length;

    return score + newlyCoveredPredicates * (config.weights[bandId] ?? 1);
  }, 0);
}

export function selectSemanticBandAwareCandidates(
  candidates: readonly AttackCandidate[],
  requestedCount: number,
  config: SemanticBandSelectionConfig,
): AttackCandidate[] {
  if (requestedCount <= 0) {
    return [];
  }

  const remaining = dedupeCandidatesByPrompt(candidates).map((candidate) => ({
    candidate,
    family: JSON.stringify([candidate.pluginId, candidate.familyId]),
    tokens: tokenize(candidate.prompt),
    maxSimilarity: 0,
  }));
  const selected: AttackCandidate[] = [];
  const selectedPredicates = new Set<string>();
  const selectedFamilies = new Set<string>();

  while (selected.length < requestedCount && remaining.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < remaining.length; index++) {
      const left = remaining[index];
      const right = remaining[bestIndex];
      const rank =
        getSemanticBandGain(right.candidate, selectedPredicates, config) -
          getSemanticBandGain(left.candidate, selectedPredicates, config) ||
        Number(selectedFamilies.has(left.family)) - Number(selectedFamilies.has(right.family)) ||
        left.maxSimilarity - right.maxSimilarity ||
        left.candidate.prompt.localeCompare(right.candidate.prompt);
      if (rank < 0) {
        bestIndex = index;
      }
    }

    const [next] = remaining.splice(bestIndex, 1);
    selected.push(next.candidate);
    selectedFamilies.add(next.family);
    for (const [predicate, enabled] of Object.entries(next.candidate.signature.predicates)) {
      if (enabled) {
        selectedPredicates.add(predicate);
      }
    }
    for (const entry of remaining) {
      entry.maxSimilarity = Math.max(
        entry.maxSimilarity,
        jaccardSimilarity(entry.tokens, next.tokens),
      );
    }
  }

  return selected;
}
