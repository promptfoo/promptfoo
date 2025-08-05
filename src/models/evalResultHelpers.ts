import { ResultFailureReason } from '../types';
import type { EvaluateResult } from '../types';

/**
 * Validates and normalizes an EvaluateResult from import data.
 * Throws if required fields are missing.
 */
export function normalizeEvaluateResult(result: any): EvaluateResult {
  // Validate required fields exist
  if (!result.prompt || typeof result.prompt !== 'object') {
    throw new Error('Invalid result: missing required field "prompt"');
  }
  if (!result.provider || typeof result.provider !== 'object') {
    throw new Error('Invalid result: missing required field "provider"');
  }
  if (!result.testCase || typeof result.testCase !== 'object') {
    throw new Error('Invalid result: missing required field "testCase"');
  }
  if (typeof result.promptIdx !== 'number') {
    throw new Error('Invalid result: promptIdx must be a number');
  }
  if (typeof result.testIdx !== 'number') {
    throw new Error('Invalid result: testIdx must be a number');
  }

  // Build normalized result with validated data
  const normalized: EvaluateResult = {
    prompt: result.prompt,
    promptId: result.promptId || '',
    provider: result.provider,
    testCase: result.testCase,
    promptIdx: result.promptIdx,
    testIdx: result.testIdx,
    vars: result.vars || {},
    response: result.response,
    error: result.error,
    success: result.success ?? false,
    score: typeof result.score === 'number' ? result.score : 0,
    latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : 0,
    gradingResult: result.gradingResult || null,
    namedScores: result.namedScores || {},
    cost: typeof result.cost === 'number' ? result.cost : 0,
    metadata: result.metadata || {},
    failureReason: result.failureReason ?? ResultFailureReason.NONE,
  };

  return normalized;
}

/**
 * Type guard to check if prompts have provider field
 */
export function hasProvider<T extends { provider?: string }>(
  prompt: T,
): prompt is T & { provider: string } {
  return typeof prompt.provider === 'string' && prompt.provider.length > 0;
}
