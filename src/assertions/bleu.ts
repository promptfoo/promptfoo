function getNGrams(words: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function calculateBrevityPenalty(candidateLength: number, referenceLength: number): number {
  if (candidateLength > referenceLength) {
    return 1;
  }
  return Math.exp(1 - candidateLength / referenceLength);
}

export function calculateBleuScore(
  candidate: string,
  references: string[],
  weights: number[] = [0.25, 0.25, 0.25, 0.25],
): number {
  if (!candidate || references.length === 0 || weights.length !== 4) {
    throw new Error('Invalid inputs');
  }
  if (Math.abs(weights.reduce((a, b) => a + b) - 1) > 1e-4) {
    throw new Error('Weights must sum to 1');
  }

  const candidateWords = candidate.toLowerCase().trim().split(/\s+/);

  // Find reference with closest length to candidate
  const refLengths = references.map((ref) => ref.toLowerCase().trim().split(/\s+/).length);
  const closestRefLength = refLengths.reduce((prev, curr) =>
    Math.abs(curr - candidateWords.length) < Math.abs(prev - candidateWords.length) ? curr : prev,
  );

  const maxN = 4;
  const precisions: number[] = [];

  for (let n = 1; n <= maxN; n++) {
    const candidateNGrams = getNGrams(candidateWords, n);
    let maxClippedCount = 0;
    const totalCount = candidateNGrams.length;

    // Calculate n-gram matches against each reference
    for (const reference of references) {
      const referenceWords = reference.toLowerCase().trim().split(/\s+/);
      const referenceNGrams = getNGrams(referenceWords, n);

      const candidateNGramCounts = new Map<string, number>();
      const referenceNGramCounts = new Map<string, number>();

      for (const gram of referenceNGrams) {
        referenceNGramCounts.set(gram, (referenceNGramCounts.get(gram) || 0) + 1);
      }

      for (const gram of candidateNGrams) {
        candidateNGramCounts.set(gram, (candidateNGramCounts.get(gram) || 0) + 1);
      }

      let clippedCount = 0;

      for (const [gram, count] of candidateNGramCounts.entries()) {
        const refCount = referenceNGramCounts.get(gram) || 0;
        clippedCount += Math.min(count, refCount);
      }

      // Take the maximum clipped count across all references
      maxClippedCount = Math.max(maxClippedCount, clippedCount);
    }

    const precision = totalCount > 0 ? maxClippedCount / totalCount : 0;
    precisions.push(precision);
  }

  const bp = calculateBrevityPenalty(candidateWords.length, closestRefLength);

  // Apply weights and calculate final score
  const weightedScore = precisions.reduce((acc, p, i) => {
    const smoothedP = p === 0 ? 1e-7 : p; // smoothing
    return acc + weights[i] * Math.log(smoothedP);
  }, 0);

  return bp * Math.exp(weightedScore);
}
