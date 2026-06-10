import type { GradingResult, TokenUsage } from '../types/index';

/**
 * Placeholder substituted for an evaluated output when the output text *is* the
 * raw image data (base64 / data URI). The real image is attached to the grading
 * prompt separately, so this keeps multi-megabyte base64 out of the grader's
 * text channel while still signalling that an image is present.
 *
 * Shared by `llmGrading.ts` and the redteam `goat` provider so the grader-facing
 * wording stays in sync.
 */
export const ATTACHED_IMAGE_OUTPUT_PLACEHOLDER =
  '[Image output attached. Inspect the attached image directly for visual grading.]';

/**
 * Instruction prepended to a grading prompt when image outputs are attached. It
 * steers the grader to judge the visual content rather than any base64/data URI
 * text in the output or the originating prompt.
 */
export const MULTIMODAL_GRADING_INSTRUCTION =
  'The evaluated output includes the attached image(s). Treat the attached image(s) as primary evidence in <Output>. Inspect the visual content directly, and do not infer visual traits, demographics, safety issues, or rubric failures from the user prompt or from any base64/data URI text.';

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
