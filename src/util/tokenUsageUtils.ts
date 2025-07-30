import type { TokenUsage, CompletionTokenDetails } from '../types/shared';

/**
 * Helper to create empty completion details
 */
export function createEmptyCompletionDetails(): Required<CompletionTokenDetails> {
  return {
    reasoning: 0,
    acceptedPrediction: 0,
    rejectedPrediction: 0,
  };
}

/**
 * Create an empty assertions token usage object.
 */
export function createEmptyAssertions(): NonNullable<TokenUsage['assertions']> {
  return {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: createEmptyCompletionDetails(),
  };
}

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
    completionDetails: createEmptyCompletionDetails(),
    assertions: createEmptyAssertions(),
  };
}

/**
 * Helper to accumulate numeric values
 */
function addNumbers(a: number | undefined, b: number | undefined): number {
  return (a ?? 0) + (b ?? 0);
}

/**
 * Helper to accumulate completion details
 */
function accumulateCompletionDetails(
  target: CompletionTokenDetails | undefined,
  update: CompletionTokenDetails | undefined,
): CompletionTokenDetails | undefined {
  if (!update) {
    return target;
  }

  return {
    reasoning: addNumbers(target?.reasoning, update.reasoning),
    acceptedPrediction: addNumbers(target?.acceptedPrediction, update.acceptedPrediction),
    rejectedPrediction: addNumbers(target?.rejectedPrediction, update.rejectedPrediction),
  };
}

/**
 * Accumulate token usage into a target object. Mutates {@code target}.
 * @param target Object to update
 * @param update Usage to add
 * @param incrementRequests Whether to increment numRequests when update is provided but doesn't specify numRequests
 */
export function accumulateTokenUsage(
  target: TokenUsage,
  update: Partial<TokenUsage> | undefined,
  incrementRequests = false,
): void {
  if (!update) {
    return;
  }

  // Accumulate basic fields
  target.prompt = addNumbers(target.prompt, update.prompt);
  target.completion = addNumbers(target.completion, update.completion);
  target.cached = addNumbers(target.cached, update.cached);
  target.total = addNumbers(target.total, update.total);

  // Handle numRequests
  if (update.numRequests !== undefined) {
    target.numRequests = addNumbers(target.numRequests, update.numRequests);
  } else if (incrementRequests) {
    target.numRequests = (target.numRequests ?? 0) + 1;
  }

  // Handle completion details
  if (update.completionDetails) {
    target.completionDetails = accumulateCompletionDetails(
      target.completionDetails,
      update.completionDetails,
    );
  }

  // Handle assertions
  if (update.assertions) {
    if (!target.assertions) {
      target.assertions = {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
      };
    }

    target.assertions.total = addNumbers(target.assertions.total, update.assertions.total);
    target.assertions.prompt = addNumbers(target.assertions.prompt, update.assertions.prompt);
    target.assertions.completion = addNumbers(
      target.assertions.completion,
      update.assertions.completion,
    );
    target.assertions.cached = addNumbers(target.assertions.cached, update.assertions.cached);
    target.assertions.numRequests = addNumbers(
      target.assertions.numRequests,
      update.assertions.numRequests,
    );

    if (update.assertions.completionDetails) {
      target.assertions.completionDetails = accumulateCompletionDetails(
        target.assertions.completionDetails,
        update.assertions.completionDetails,
      );
    }
  }
}

/**
 * Accumulate token usage specifically for assertions.
 * This function operates directly on an assertions object rather than a full TokenUsage object.
 * @param target Assertions object to update
 * @param update Partial token usage that may contain assertion-related fields
 */
export function accumulateAssertionTokenUsage(
  target: NonNullable<TokenUsage['assertions']>,
  update: Partial<TokenUsage> | undefined,
): void {
  if (!update) {
    return;
  }

  // Accumulate basic token counts
  target.total = addNumbers(target.total, update.total);
  target.prompt = addNumbers(target.prompt, update.prompt);
  target.completion = addNumbers(target.completion, update.completion);
  target.cached = addNumbers(target.cached, update.cached);
  // Note: We don't accumulate numRequests from the update for assertions
  // to maintain separation between provider and assertion request counts

  // Handle completion details
  if (update.completionDetails) {
    target.completionDetails = accumulateCompletionDetails(
      target.completionDetails,
      update.completionDetails,
    );
  }
}

/**
 * Accumulate token usage from a response, handling the common pattern of
 * incrementing numRequests when no token usage is provided.
 * @param target Object to update
 * @param response Response that may contain token usage
 */
export function accumulateResponseTokenUsage(
  target: TokenUsage,
  response: { tokenUsage?: Partial<TokenUsage> } | undefined,
): void {
  if (response?.tokenUsage) {
    accumulateTokenUsage(target, response.tokenUsage);
    // Increment numRequests if not already present in tokenUsage
    if (response.tokenUsage.numRequests === undefined) {
      target.numRequests = (target.numRequests ?? 0) + 1;
    }
  } else if (response) {
    // Only increment numRequests if we got a response but no token usage
    target.numRequests = (target.numRequests ?? 0) + 1;
  }
}

/**
 * Accumulate token usage from a grader result, handling the common pattern of
 * incrementing numRequests when no token usage is provided.
 * @param target Object to update
 * @param graderResult Result that may contain tokensUsed
 */
export function accumulateGraderTokenUsage(
  target: TokenUsage,
  graderResult: { tokensUsed?: Partial<TokenUsage> } | undefined,
): void {
  if (graderResult?.tokensUsed) {
    accumulateTokenUsage(target, graderResult.tokensUsed);
    // Increment numRequests if not already present in tokensUsed
    if (graderResult.tokensUsed.numRequests === undefined) {
      target.numRequests = (target.numRequests ?? 0) + 1;
    }
  } else if (graderResult) {
    // Only increment numRequests if we got a grader result but no token usage
    target.numRequests = (target.numRequests ?? 0) + 1;
  }
}
