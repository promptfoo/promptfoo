import type { CompletionTokenDetails } from '../../types/shared';
import type { GenerationTokenUsage } from '../types';

function addTokenCounts(left: number | undefined, right: number | undefined): number {
  return (left ?? 0) + (right ?? 0);
}

function accumulateCompletionDetails(
  target: CompletionTokenDetails | undefined,
  update: CompletionTokenDetails | undefined,
): CompletionTokenDetails | undefined {
  if (!update) {
    return target;
  }

  return {
    reasoning: addTokenCounts(target?.reasoning, update.reasoning),
    acceptedPrediction: addTokenCounts(target?.acceptedPrediction, update.acceptedPrediction),
    rejectedPrediction: addTokenCounts(target?.rejectedPrediction, update.rejectedPrediction),
    cacheReadInputTokens: addTokenCounts(target?.cacheReadInputTokens, update.cacheReadInputTokens),
    cacheCreationInputTokens: addTokenCounts(
      target?.cacheCreationInputTokens,
      update.cacheCreationInputTokens,
    ),
  };
}

export function accumulateGenerationTokenUsage(
  target: GenerationTokenUsage,
  update: Partial<GenerationTokenUsage> | undefined,
): void {
  if (!update) {
    return;
  }

  target.prompt = addTokenCounts(target.prompt, update.prompt);
  target.completion = addTokenCounts(target.completion, update.completion);
  target.cached = addTokenCounts(target.cached, update.cached);
  target.total = addTokenCounts(target.total, update.total);
  target.numRequests = addTokenCounts(target.numRequests, update.numRequests);
  target.completionDetails = accumulateCompletionDetails(
    target.completionDetails,
    update.completionDetails,
  );
}

export function accumulateGenerationResponseTokenUsage(
  target: GenerationTokenUsage,
  response: { tokenUsage?: Partial<GenerationTokenUsage> } | undefined,
): void {
  if (response?.tokenUsage) {
    accumulateGenerationTokenUsage(target, response.tokenUsage);
    if (response.tokenUsage.numRequests === undefined) {
      target.numRequests = (target.numRequests ?? 0) + 1;
    }
  } else if (response) {
    target.numRequests = (target.numRequests ?? 0) + 1;
  }
}
