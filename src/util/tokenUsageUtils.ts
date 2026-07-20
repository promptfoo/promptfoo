import {
  BaseTokenUsageSchema,
  type CompletionTokenDetails,
  type TokenUsage,
} from '../types/shared';

/**
 * Safely extract token usage carried by a thrown value.
 */
export function getErrorTokenUsage(error: unknown): TokenUsage | undefined {
  if (!error || typeof error !== 'object' || !('tokenUsage' in error)) {
    return undefined;
  }

  const parsedTokenUsage = BaseTokenUsageSchema.safeParse(error.tokenUsage);
  return parsedTokenUsage.success ? parsedTokenUsage.data : undefined;
}

/**
 * Helper to create empty completion details
 */
export function createEmptyCompletionDetails(): Required<CompletionTokenDetails> {
  return {
    reasoning: 0,
    acceptedPrediction: 0,
    rejectedPrediction: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
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
    cacheReadInputTokens: addNumbers(target?.cacheReadInputTokens, update.cacheReadInputTokens),
    cacheCreationInputTokens: addNumbers(
      target?.cacheCreationInputTokens,
      update.cacheCreationInputTokens,
    ),
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
 * Accumulate usage while treating missing token counts on a counted request as unknown.
 *
 * Unlike {@link accumulateTokenUsage}, this helper does not turn an omitted count into zero.
 * Once any counted request has an unknown count, that aggregate count remains unknown.
 */
export function accumulateTokenUsagePreservingUnknown(
  target: TokenUsage,
  update: Partial<TokenUsage> | undefined,
  incrementRequests = false,
): void {
  if (!update) {
    return;
  }

  const priorRequests = target.numRequests ?? 0;
  const updateRequests = update.numRequests ?? (incrementRequests ? 1 : 0);
  const priorCompletionDetails = target.completionDetails;
  const priorCounts = {
    prompt: target.prompt,
    completion: target.completion,
    cached: target.cached,
    total: target.total,
  };

  accumulateTokenUsage(target, update, incrementRequests);

  if (updateRequests > 0) {
    for (const field of ['prompt', 'completion', 'cached', 'total'] as const) {
      const priorCount = priorCounts[field];
      const updateCount = update[field];
      if (priorRequests === 0) {
        if (updateCount === undefined) {
          delete target[field];
        } else {
          target[field] = updateCount;
        }
      } else if (priorCount === undefined || updateCount === undefined) {
        delete target[field];
      } else {
        target[field] = priorCount + updateCount;
      }
    }

    if (
      update.prompt === undefined &&
      update.completion === undefined &&
      update.cached === undefined &&
      update.total === undefined
    ) {
      delete target.completionDetails;
    } else if (priorRequests > 0 && priorCompletionDetails === undefined) {
      delete target.completionDetails;
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
 * Account for a single grading (assertion) request: every grading call counts as one
 * assertion request, and its token usage is folded in when the grader reported any.
 * Shared by the live grading path and the EvalResult -> EvaluateResult reconstruction so
 * the two stay in sync. Mutates {@code assertions}.
 */
export function accumulateGradingRequest(
  assertions: NonNullable<TokenUsage['assertions']>,
  tokensUsed: Partial<TokenUsage> | undefined,
): void {
  assertions.numRequests = (assertions.numRequests ?? 0) + 1;
  if (tokensUsed) {
    accumulateAssertionTokenUsage(assertions, tokensUsed);
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
  options?: { countAsRequest?: boolean },
): void {
  const countAsRequest = options?.countAsRequest ?? true;

  if (response?.tokenUsage) {
    if (countAsRequest) {
      accumulateTokenUsage(target, response.tokenUsage);
      // Increment numRequests if not already present in tokenUsage
      if (response.tokenUsage.numRequests === undefined) {
        target.numRequests = (target.numRequests ?? 0) + 1;
      }
    } else {
      // Preserve token totals while explicitly excluding request counting.
      const tokenUsageWithoutRequests: Partial<TokenUsage> = {
        ...response.tokenUsage,
        numRequests: undefined,
      };
      accumulateTokenUsage(target, tokenUsageWithoutRequests);
    }
  } else if (response && countAsRequest) {
    // Only increment numRequests if we got a response but no token usage
    target.numRequests = (target.numRequests ?? 0) + 1;
  }
}

/**
 * Response-accounting counterpart to {@link accumulateTokenUsagePreservingUnknown}.
 */
export function accumulateResponseTokenUsagePreservingUnknown(
  target: TokenUsage,
  response: { tokenUsage?: Partial<TokenUsage> } | undefined,
  options?: { countAsRequest?: boolean },
): void {
  const countAsRequest = options?.countAsRequest ?? true;

  if (response?.tokenUsage) {
    if (countAsRequest) {
      accumulateTokenUsagePreservingUnknown(
        target,
        response.tokenUsage,
        response.tokenUsage.numRequests === undefined,
      );
    } else {
      accumulateTokenUsagePreservingUnknown(target, {
        ...response.tokenUsage,
        numRequests: undefined,
      });
    }
  } else if (response && countAsRequest) {
    accumulateTokenUsagePreservingUnknown(target, { numRequests: 1 });
  }
}

/**
 * Fold generation-time provider tokens into evaluation totals without treating
 * internal generation calls as target probes. Returns whether the payload was valid.
 */
export function accumulateGenerationTokenUsage(target: TokenUsage, update: unknown): boolean {
  const parsed = BaseTokenUsageSchema.safeParse(update);
  if (!parsed.success) {
    return false;
  }

  const { assertions: _assertions, numRequests: _numRequests, ...tokenTotals } = parsed.data;
  const hasTokenTotals =
    Object.values(tokenTotals).some((value) => typeof value === 'number' && value !== 0) ||
    Object.values(tokenTotals.completionDetails ?? {}).some((value) => value !== 0);
  if (!hasTokenTotals) {
    return false;
  }
  accumulateTokenUsage(target, tokenTotals);
  return true;
}

/**
 * Normalize token usage from a provider response into a standard TokenUsage object.
 * Provides default values for all fields if not present in the response.
 * @param tokenUsage Token usage from provider response (may be partial or undefined)
 * @returns Fully populated TokenUsage object with defaults
 */
export function normalizeTokenUsage(
  tokenUsage: Partial<TokenUsage> | undefined,
): Required<TokenUsage> {
  return {
    total: tokenUsage?.total || 0,
    prompt: tokenUsage?.prompt || 0,
    completion: tokenUsage?.completion || 0,
    cached: tokenUsage?.cached || 0,
    numRequests: tokenUsage?.numRequests || 0,
    completionDetails: tokenUsage?.completionDetails || createEmptyCompletionDetails(),
    assertions: tokenUsage?.assertions || createEmptyAssertions(),
  };
}
