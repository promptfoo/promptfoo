import { matchesNoiseSensitivity, type ContextChunk } from '../matchers';
import invariant from '../util/invariant';
import { resolveContext } from './contextUtils';

import type { AssertionParams, GradingResult } from '../types';

/**
 * Handles noise-sensitivity assertions by evaluating how robust the LLM's response
 * is to noisy or irrelevant context. Based on RAGAS noise sensitivity metric.
 * 
 * Lower scores indicate better robustness (fewer incorrect claims from noise).
 *
 * @param params - Assertion parameters including test case, output, and configuration
 * @returns Promise resolving to grading result with pass/fail and score
 */
export async function handleNoiseSensitivity({
  assertion,
  test,
  output,
  prompt,
  providerResponse,
}: AssertionParams): Promise<GradingResult> {
  invariant(test.vars, 'noise-sensitivity assertion requires a test with variables');
  invariant(
    typeof test.vars.query === 'string',
    'noise-sensitivity assertion requires a "query" variable with the user question',
  );
  invariant(
    typeof output === 'string',
    'noise-sensitivity assertion requires string output from the provider',
  );

  // Require ground truth for noise sensitivity
  const groundTruth = assertion.value;
  invariant(
    typeof groundTruth === 'string',
    'noise-sensitivity assertion requires a ground truth value to compare against',
  );

  const context = await resolveContext(
    assertion,
    test,
    output,
    prompt,
    undefined,
    providerResponse,
  );

  // Get configuration
  const mode = assertion.config?.mode || 'relevant';
  
  // Support new chunk-based format or legacy string format
  let contextChunks: ContextChunk[] | string;
  
  if (assertion.config?.contextChunks && Array.isArray(assertion.config.contextChunks)) {
    // New format: array of labeled chunks
    contextChunks = assertion.config.contextChunks as ContextChunk[];
  } else if (test.vars.contextChunks && Array.isArray(test.vars.contextChunks)) {
    // Support chunks from test vars
    contextChunks = test.vars.contextChunks as ContextChunk[];
  } else {
    // Legacy format: treat context as string
    const noiseContext = assertion.config?.noiseContext;
    contextChunks = noiseContext ? `${context}\n\n${noiseContext}` : context;
  }

  const result = await matchesNoiseSensitivity(
    test.vars.query,
    output,
    groundTruth,
    contextChunks,
    mode as 'relevant' | 'irrelevant',
    assertion.threshold ?? 0.2, // Default: max 20% incorrect claims
    assertion.config?.grading,
    test.vars,
  );

  return {
    assertion,
    ...result,
    metadata: {
      context: typeof contextChunks === 'string' ? contextChunks : contextChunks.map(c => c.text).join(' '),
      mode,
      contextChunks: typeof contextChunks !== 'string' ? contextChunks : undefined,
      ...result.metadata,
    },
  };
}