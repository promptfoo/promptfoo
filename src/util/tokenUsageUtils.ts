import {
  BaseTokenUsageSchema,
  type CompletionTokenDetails,
  type NormalizedTokenUsage,
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
export function createEmptyTokenUsage(): NormalizedTokenUsage {
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

/** Copy a usage breakdown without allowing the incurred view to recurse. */
export function cloneTokenUsageBreakdown(
  usage: Partial<TokenUsage>,
): NonNullable<TokenUsage['incurredTokenUsage']> {
  const { incurredTokenUsage: _incurredTokenUsage, ...breakdown } = usage;
  return {
    ...breakdown,
    ...(breakdown.completionDetails && {
      completionDetails: { ...breakdown.completionDetails },
    }),
    ...(breakdown.attacker && {
      attacker: {
        ...breakdown.attacker,
        ...(breakdown.attacker.completionDetails && {
          completionDetails: { ...breakdown.attacker.completionDetails },
        }),
      },
    }),
    ...(breakdown.assertions && {
      assertions: {
        ...breakdown.assertions,
        ...(breakdown.assertions.completionDetails && {
          completionDetails: { ...breakdown.assertions.completionDetails },
        }),
      },
    }),
    ...(breakdown.generation && {
      generation: {
        ...breakdown.generation,
        ...(breakdown.generation.completionDetails && {
          completionDetails: { ...breakdown.generation.completionDetails },
        }),
      },
    }),
  };
}

/** Derive omitted totals without turning a response-cache replay into fresh usage. */
function getAccumulatedTokenTotal(usage: Partial<TokenUsage>): number {
  if (usage.total !== undefined) {
    return usage.total;
  }

  const componentTotal = (usage.prompt ?? 0) + (usage.completion ?? 0);
  const cachedTotal = usage.cached ?? 0;
  if (usage.numRequests === 0 && cachedTotal > 0 && componentTotal <= cachedTotal) {
    return 0;
  }

  return componentTotal;
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

  // Existing legacy usage predates dual accounting. When the first response with
  // provenance arrives, retain that earlier work as incurred rather than losing it.
  const trackIncurredUsage = Boolean(target.incurredTokenUsage || update.incurredTokenUsage);
  if (trackIncurredUsage && !target.incurredTokenUsage) {
    target.incurredTokenUsage = cloneTokenUsageBreakdown(target);
  }

  // Accumulate basic fields
  target.prompt = addNumbers(target.prompt, update.prompt);
  target.completion = addNumbers(target.completion, update.completion);
  target.cached = addNumbers(target.cached, update.cached);
  target.total = addNumbers(target.total, getAccumulatedTokenTotal(update));

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

    target.assertions.total = addNumbers(
      target.assertions.total,
      getAccumulatedTokenTotal(update.assertions),
    );
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

  if (update.attacker) {
    target.attacker ??= createEmptyAssertions();
    accumulateTokenUsage(target.attacker, update.attacker);
  }

  if (update.generation) {
    target.generation ??= createEmptyAssertions();
    accumulateTokenUsage(target.generation, update.generation);
  }

  if (trackIncurredUsage && target.incurredTokenUsage) {
    accumulateTokenUsage(
      target.incurredTokenUsage,
      update.incurredTokenUsage ?? cloneTokenUsageBreakdown(update),
      incrementRequests,
    );
  }
}

/** Record attacker-model usage separately without inflating target tokens or probes. */
export function accumulateAttackerTokenUsage(
  target: TokenUsage,
  response: { cached?: boolean; tokenUsage?: Partial<TokenUsage> } | undefined,
): void {
  if (!response) {
    return;
  }

  const {
    assertions,
    incurredTokenUsage: reportedIncurredTokenUsage,
    ...attackerUsage
  } = response.tokenUsage ?? {};
  const incurredTokenUsage = response.cached ? undefined : reportedIncurredTokenUsage;
  const attackerAccounting = createEmptyTokenUsage();
  accumulateResponseTokenUsage(attackerAccounting, {
    cached: response.cached,
    tokenUsage: {
      ...attackerUsage,
      ...(incurredTokenUsage && {
        incurredTokenUsage: {
          ...incurredTokenUsage,
          assertions: undefined,
        },
      }),
    },
  });

  const {
    assertions: _unusedAssertions,
    incurredTokenUsage: incurredAttacker,
    ...logicalAttacker
  } = attackerAccounting;
  const actualAttacker = cloneTokenUsageBreakdown(incurredAttacker ?? logicalAttacker);
  delete actualAttacker.assertions;
  const actualAssertions =
    incurredTokenUsage?.assertions ?? (response.cached ? undefined : assertions);
  const trackIncurredUsage = Boolean(
    target.incurredTokenUsage || incurredTokenUsage || response.cached,
  );

  accumulateTokenUsage(target, {
    attacker: logicalAttacker,
    ...(assertions && { assertions }),
    ...(trackIncurredUsage && {
      incurredTokenUsage: {
        attacker: actualAttacker,
        ...(actualAssertions && { assertions: actualAssertions }),
      },
    }),
  });
}

/** Record one strategy grading task while retaining all model usage reported for that task. */
export function accumulateGradingResponseTokenUsage(
  target: TokenUsage,
  response: { cached?: boolean; tokenUsage?: Partial<TokenUsage> } | undefined,
): void {
  if (!response) {
    return;
  }

  const reportedTotal =
    response.tokenUsage?.total ??
    (response.tokenUsage?.prompt ?? 0) + (response.tokenUsage?.completion ?? 0);
  const cachedTokens = response.tokenUsage?.cached ?? 0;
  const cachedResponse =
    response.cached === true ||
    (response.tokenUsage?.numRequests === 0 && reportedTotal <= cachedTokens);

  const logicalUsage = {
    ...response.tokenUsage,
    ...(cachedResponse && reportedTotal === 0 && cachedTokens > 0 && { total: cachedTokens }),
    ...(cachedResponse && { cached: Math.max(cachedTokens, reportedTotal) }),
    numRequests: 1,
  };
  const incurredUsage = cachedResponse
    ? createEmptyAssertions()
    : {
        ...(response.tokenUsage?.incurredTokenUsage ?? response.tokenUsage),
        numRequests: 1,
      };

  accumulateTokenUsage(target, {
    assertions: logicalUsage,
    ...((target.incurredTokenUsage ||
      response.tokenUsage?.incurredTokenUsage ||
      cachedResponse) && {
      incurredTokenUsage: { assertions: incurredUsage },
    }),
  });
}

/** Record logical grading alongside the subset of grading work executed during this run. */
export function accumulateGradingTokenUsage(
  target: TokenUsage,
  tokensUsed: Partial<TokenUsage> | undefined,
  options?: { cached?: boolean; fresh?: boolean },
): void {
  const reportedTotal =
    tokensUsed?.total ?? (tokensUsed?.prompt ?? 0) + (tokensUsed?.completion ?? 0);
  const cachedTokens = tokensUsed?.cached ?? 0;
  const cachedResponse =
    options?.cached === true ||
    (options?.cached === undefined &&
      tokensUsed?.numRequests === 0 &&
      cachedTokens > 0 &&
      reportedTotal <= cachedTokens);

  const logicalAssertions = createEmptyAssertions();
  const logicalTokensUsed =
    cachedResponse && reportedTotal === 0 && cachedTokens > 0
      ? { ...tokensUsed, total: cachedTokens }
      : tokensUsed;
  accumulateGradingRequest(logicalAssertions, logicalTokensUsed, {
    ...options,
    cached: cachedResponse ? false : options?.cached,
    fresh: cachedResponse || options?.fresh,
  });

  const incurredAssertions = createEmptyAssertions();
  if (!cachedResponse) {
    accumulateGradingRequest(
      incurredAssertions,
      tokensUsed?.incurredTokenUsage ?? tokensUsed,
      options,
    );
  }

  accumulateTokenUsage(target, {
    assertions: logicalAssertions,
    ...((target.incurredTokenUsage || tokensUsed?.incurredTokenUsage || cachedResponse) && {
      incurredTokenUsage: { assertions: incurredAssertions },
    }),
  });
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
  target.total = addNumbers(target.total, getAccumulatedTokenTotal(update));
  target.prompt = addNumbers(target.prompt, update.prompt);
  target.completion = addNumbers(target.completion, update.completion);
  target.cached = addNumbers(target.cached, update.cached);
  target.numRequests = addNumbers(target.numRequests, update.numRequests);

  // Handle completion details
  if (update.completionDetails) {
    target.completionDetails = accumulateCompletionDetails(
      target.completionDetails,
      update.completionDetails,
    );
  }
}

/**
 * Account for reported grading usage, preserving cumulative request counts and cached
 * responses and deterministic assertions that represent zero new requests. Legacy
 * usage without a request count and confirmed fresh grading calls each count once.
 * Explicit cache provenance takes precedence over cached-token heuristics because an
 * aggregate can contain both avoided cached usage and a smaller fresh grading call.
 * Shared by the live grading path and the EvalResult -> EvaluateResult reconstruction so
 * the two stay in sync. Mutates {@code assertions}.
 */
export function accumulateGradingRequest(
  assertions: NonNullable<TokenUsage['assertions']>,
  tokensUsed: Partial<TokenUsage> | undefined,
  options?: { cached?: boolean; fresh?: boolean },
): void {
  if (!tokensUsed) {
    if (!options?.cached) {
      assertions.numRequests = (assertions.numRequests ?? 0) + 1;
    }
    return;
  }

  const reportedTotal = tokensUsed.total ?? (tokensUsed.prompt ?? 0) + (tokensUsed.completion ?? 0);
  const cachedTokens = tokensUsed.cached ?? 0;
  const inferredCachedResponse =
    options?.cached === undefined &&
    tokensUsed.numRequests === 0 &&
    cachedTokens > 0 &&
    reportedTotal <= cachedTokens;
  const cachedResponse = options?.cached === true || inferredCachedResponse;
  const hasFreshUsage = options?.fresh === true || reportedTotal > 0;

  let numRequests: number;
  if (cachedResponse) {
    numRequests = 0;
  } else if (tokensUsed.numRequests === 0) {
    numRequests = hasFreshUsage ? 1 : 0;
  } else {
    numRequests = tokensUsed.numRequests ?? 1;
  }

  accumulateAssertionTokenUsage(assertions, {
    ...tokensUsed,
    numRequests,
  });
}

/**
 * Accumulate token usage from a response, handling the common pattern of
 * incrementing numRequests when no token usage is provided.
 * @param target Object to update
 * @param response Response that may contain token usage
 */
export function accumulateResponseTokenUsage(
  target: TokenUsage,
  response: { cached?: boolean; tokenUsage?: Partial<TokenUsage> } | undefined,
  options?: { countAsRequest?: boolean; countCachedAsRequest?: boolean },
): void {
  if (!response) {
    return;
  }

  const countAsRequest = options?.countAsRequest ?? true;
  const reportedUsage = response.tokenUsage ?? {};
  const reportedTotal =
    reportedUsage.total ?? (reportedUsage.prompt ?? 0) + (reportedUsage.completion ?? 0);
  const logicalRequests = countAsRequest
    ? response.cached
      ? Math.max(reportedUsage.numRequests ?? 0, 1)
      : (reportedUsage.numRequests ?? 1)
    : 0;

  const logicalUsage: Partial<TokenUsage> = {
    ...reportedUsage,
    ...(response.cached &&
      reportedTotal === 0 &&
      (reportedUsage.cached ?? 0) > 0 && {
        total: reportedUsage.cached,
      }),
    ...(response.cached && { cached: Math.max(reportedUsage.cached ?? 0, reportedTotal) }),
    numRequests: logicalRequests,
  };

  const incurredUsage = reportedUsage.incurredTokenUsage
    ? cloneTokenUsageBreakdown(reportedUsage.incurredTokenUsage)
    : response.cached
      ? {
          ...(reportedUsage.attacker && { attacker: reportedUsage.attacker }),
          ...(reportedUsage.assertions && { assertions: reportedUsage.assertions }),
          ...(reportedUsage.generation && { generation: reportedUsage.generation }),
          numRequests: 0,
        }
      : cloneTokenUsageBreakdown(logicalUsage);

  if (!countAsRequest) {
    incurredUsage.numRequests = 0;
  }

  accumulateTokenUsage(target, {
    ...logicalUsage,
    ...((target.incurredTokenUsage || reportedUsage.incurredTokenUsage || response.cached) && {
      incurredTokenUsage: incurredUsage,
    }),
  });
}

/**
 * Record generation-time provider tokens separately from target usage and probes.
 * Returns whether the payload contained observable generation usage.
 */
export function accumulateGenerationTokenUsage(target: TokenUsage, update: unknown): boolean {
  const parsed = BaseTokenUsageSchema.safeParse(update);
  if (!parsed.success) {
    return false;
  }

  const {
    attacker: _attacker,
    assertions: _assertions,
    generation: _generation,
    incurredTokenUsage,
    ...generationUsage
  } = parsed.data;
  const hasUsage =
    Object.values(generationUsage).some((value) => typeof value === 'number' && value !== 0) ||
    Object.values(generationUsage.completionDetails ?? {}).some((value) => value !== 0);
  if (!hasUsage) {
    return false;
  }
  accumulateTokenUsage(target, {
    generation: generationUsage,
    ...((target.incurredTokenUsage || incurredTokenUsage) && {
      incurredTokenUsage: { generation: incurredTokenUsage ?? generationUsage },
    }),
  });
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
): NormalizedTokenUsage {
  return {
    total: tokenUsage?.total || 0,
    prompt: tokenUsage?.prompt || 0,
    completion: tokenUsage?.completion || 0,
    cached: tokenUsage?.cached || 0,
    numRequests: tokenUsage?.numRequests || 0,
    completionDetails: tokenUsage?.completionDetails || createEmptyCompletionDetails(),
    assertions: tokenUsage?.assertions || createEmptyAssertions(),
    ...(tokenUsage?.attacker ? { attacker: tokenUsage.attacker } : {}),
    ...(tokenUsage?.generation ? { generation: tokenUsage.generation } : {}),
    ...(tokenUsage?.incurredTokenUsage
      ? { incurredTokenUsage: tokenUsage.incurredTokenUsage }
      : {}),
  };
}
