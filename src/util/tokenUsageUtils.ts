import type { TokenUsage } from '../types/shared';

/**
 * Create an empty token usage object with all fields initialized to zero.
 */
export function createEmptyTokenUsage(): Required<TokenUsage> {
  return {
    prompt: 0,
    completion: 0,
    cached: 0,
    total: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
    assertions: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  } as Required<TokenUsage>;
}

/**
 * Merge two token usage objects immutably.
 * @param current Existing usage
 * @param update Usage to merge in
 * @returns A new {@link TokenUsage} containing the sum of both usages
 */
export function mergeTokenUsage(
  current: Partial<TokenUsage>,
  update: Partial<TokenUsage>,
): TokenUsage {
  return {
    prompt: (current.prompt ?? 0) + (update.prompt ?? 0),
    completion: (current.completion ?? 0) + (update.completion ?? 0),
    cached: (current.cached ?? 0) + (update.cached ?? 0),
    total: (current.total ?? 0) + (update.total ?? 0),
    numRequests: (current.numRequests ?? 0) + (update.numRequests ?? 0),
    completionDetails: {
      reasoning:
        (current.completionDetails?.reasoning ?? 0) + (update.completionDetails?.reasoning ?? 0),
      acceptedPrediction:
        (current.completionDetails?.acceptedPrediction ?? 0) +
        (update.completionDetails?.acceptedPrediction ?? 0),
      rejectedPrediction:
        (current.completionDetails?.rejectedPrediction ?? 0) +
        (update.completionDetails?.rejectedPrediction ?? 0),
    },
    assertions: {
      total: (current.assertions?.total ?? 0) + (update.assertions?.total ?? 0),
      prompt: (current.assertions?.prompt ?? 0) + (update.assertions?.prompt ?? 0),
      completion: (current.assertions?.completion ?? 0) + (update.assertions?.completion ?? 0),
      cached: (current.assertions?.cached ?? 0) + (update.assertions?.cached ?? 0),
      completionDetails: {
        reasoning:
          (current.assertions?.completionDetails?.reasoning ?? 0) +
          (update.assertions?.completionDetails?.reasoning ?? 0),
        acceptedPrediction:
          (current.assertions?.completionDetails?.acceptedPrediction ?? 0) +
          (update.assertions?.completionDetails?.acceptedPrediction ?? 0),
        rejectedPrediction:
          (current.assertions?.completionDetails?.rejectedPrediction ?? 0) +
          (update.assertions?.completionDetails?.rejectedPrediction ?? 0),
      },
    },
  };
}

/**
 * Accumulate token usage into a target object. Mutates {@code target}.
 * @param target Object to update
 * @param update Usage to add
 */
export function accumulateTokenUsage(
  target: TokenUsage,
  update: Partial<TokenUsage> | undefined,
): void {
  if (!update) {
    return;
  }

  target.prompt = (target.prompt ?? 0) + (update.prompt ?? 0);
  target.completion = (target.completion ?? 0) + (update.completion ?? 0);
  target.cached = (target.cached ?? 0) + (update.cached ?? 0);
  target.total = (target.total ?? 0) + (update.total ?? 0);
  if (update.numRequests !== undefined) {
    target.numRequests = (target.numRequests ?? 0) + update.numRequests;
  } else if (target.numRequests !== undefined) {
    target.numRequests += 1;
  }

  if (update.completionDetails) {
    if (!target.completionDetails) {
      target.completionDetails = { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 };
    }
    target.completionDetails.reasoning =
      (target.completionDetails.reasoning ?? 0) + (update.completionDetails.reasoning ?? 0);
    target.completionDetails.acceptedPrediction =
      (target.completionDetails.acceptedPrediction ?? 0) +
      (update.completionDetails.acceptedPrediction ?? 0);
    target.completionDetails.rejectedPrediction =
      (target.completionDetails.rejectedPrediction ?? 0) +
      (update.completionDetails.rejectedPrediction ?? 0);
  }

  if (update.assertions) {
    if (!target.assertions) {
      target.assertions = {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
      };
    }
    target.assertions.total = (target.assertions.total ?? 0) + (update.assertions.total ?? 0);
    target.assertions.prompt = (target.assertions.prompt ?? 0) + (update.assertions.prompt ?? 0);
    target.assertions.completion =
      (target.assertions.completion ?? 0) + (update.assertions.completion ?? 0);
    target.assertions.cached = (target.assertions.cached ?? 0) + (update.assertions.cached ?? 0);

    if (update.assertions.completionDetails) {
      if (!target.assertions.completionDetails) {
        target.assertions.completionDetails = {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        };
      }
      target.assertions.completionDetails.reasoning =
        (target.assertions.completionDetails.reasoning ?? 0) +
        (update.assertions.completionDetails.reasoning ?? 0);
      target.assertions.completionDetails.acceptedPrediction =
        (target.assertions.completionDetails.acceptedPrediction ?? 0) +
        (update.assertions.completionDetails.acceptedPrediction ?? 0);
      target.assertions.completionDetails.rejectedPrediction =
        (target.assertions.completionDetails.rejectedPrediction ?? 0) +
        (update.assertions.completionDetails.rejectedPrediction ?? 0);
    }
  }
}
