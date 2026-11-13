import type { CompletionTokenDetails } from './shared.js';

/** Add the known completion counters without mutating either input. */
export function addCompletionDetails(
  target: CompletionTokenDetails | undefined,
  update: CompletionTokenDetails,
): CompletionTokenDetails {
  const result: Required<CompletionTokenDetails> = {
    reasoning: 0,
    acceptedPrediction: 0,
    rejectedPrediction: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  for (const key of Object.keys(result) as (keyof CompletionTokenDetails)[]) {
    result[key] = (target?.[key] ?? 0) + (update[key] ?? 0);
  }
  return result;
}
