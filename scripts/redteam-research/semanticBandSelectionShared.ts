export function selectGreedyPortfolio<T>(
  candidates: readonly T[],
  count: number,
  scoreCandidate: (candidate: T, selected: readonly T[]) => number,
): T[] {
  const selected: T[] = [];
  const remaining = [...candidates];

  while (selected.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const score = scoreCandidate(candidate, selected);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}
