import type { GradingResult, TokenUsage } from '../types/index';

/**
 * Normalize token usage for matcher results. Unlike the evaluator-level
 * normalizeTokenUsage, this excludes the `assertions` field and preserves
 * the existing completionDetails shape (passing through whatever the
 * provider returned, or undefined if not present).
 */
export function normalizeMatcherTokenUsage(
  tokenUsage: Partial<TokenUsage> | undefined,
): TokenUsage {
  return {
    total: tokenUsage?.total || 0,
    prompt: tokenUsage?.prompt || 0,
    completion: tokenUsage?.completion || 0,
    cached: tokenUsage?.cached || 0,
    numRequests: tokenUsage?.numRequests || 0,
    completionDetails: tokenUsage?.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };
}

export function fail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: normalizeMatcherTokenUsage(tokensUsed),
  };
}

/**
 * Same shape as `fail`, but tagged with `metadata.graderError` so inverse-aware
 * callers (e.g. `not-llm-rubric`, `not-g-eval`, `not-trajectory:goal-success`)
 * propagate the failure verbatim rather than flipping a transport/parse error
 * into a spurious pass.
 */
export function graderFail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    ...fail(reason, tokensUsed),
    metadata: { graderError: true },
  };
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (vecAMagnitude === 0 || vecBMagnitude === 0) {
    return 0;
  }
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

export function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  return vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
}

export function euclideanDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const sumSquaredDiff = vecA.reduce((acc, val, idx) => {
    const diff = val - vecB[idx];
    return acc + diff * diff;
  }, 0);
  return Math.sqrt(sumSquaredDiff);
}

export function tryParse(content: string) {
  try {
    return JSON.parse(content);
  } catch {}
  return content;
}

export function splitIntoSentences(text: string) {
  return text.split('\n').filter((sentence) => sentence.trim() !== '');
}

/**
 * How {@link splitTextIntoSentences} should segment text.
 *
 * - `lines`: split on newlines. The text is already segmented one unit per line.
 * - `prose`: split on sentence boundaries (`.`, `!`, `?` followed by whitespace).
 */
export type SentenceSegmentMode = 'lines' | 'prose';

/**
 * Decide how to segment text for sentence-level metrics.
 *
 * Text that spans **two or more** non-empty lines is treated as already
 * segmented (`lines`) — line-formatted LLM grader output, or a context passed one
 * chunk/sentence per line. Anything else (a single line, possibly carrying an
 * incidental leading/trailing newline) is a single prose block (`prose`).
 *
 * The "two or more lines" threshold is deliberate: keying off the mere *presence*
 * of a newline would misclassify a prose paragraph with a single trailing newline
 * (extremely common when a context is loaded from a file, a template, or a YAML
 * block scalar) as pre-segmented, collapsing it to one unit.
 */
export function detectSentenceSegmentMode(text: string): SentenceSegmentMode {
  let nonEmptyLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() !== '' && ++nonEmptyLines > 1) {
      return 'lines';
    }
  }
  return 'prose';
}

/**
 * Segments text into units for sentence-level metrics (e.g. RAGAS context
 * relevance).
 *
 * `mode` defaults to {@link detectSentenceSegmentMode}. Pass an explicit mode to
 * segment two related texts (e.g. a context and the grader's extracted sentences)
 * the same way, so a ratio between them uses consistent units.
 *
 * - `lines` preserves pre-segmented input and avoids mis-splitting abbreviations
 *   (e.g. "i.e.", "U.S.") in already-formatted text.
 * - `prose` segments a single block on sentence boundaries. This is the important
 *   case: {@link splitIntoSentences} splits on newlines only, so a prose passage
 *   with no newlines collapses to a single unit, forcing sentence-level
 *   denominators to 1. Incidental leading/trailing newlines are tolerated — the
 *   sentence boundary regex consumes them and the trim/filter drops the remnants.
 *
 * Note: the sentence split is a lightweight heuristic and does not handle every
 * edge case (e.g. decimals like "3.14", abbreviations); full segmentation would
 * need an NLP tokenizer. It is a substantial improvement over newline-only
 * splitting for the common prose case.
 */
export function splitTextIntoSentences(
  text: string,
  mode: SentenceSegmentMode = detectSentenceSegmentMode(text),
): string[] {
  const segments = mode === 'lines' ? text.split('\n') : text.split(/(?<=[.!?])\s+/);
  return segments.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}
