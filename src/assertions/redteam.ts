import logger from '../logger';
import { MULTI_INPUT_VAR } from '../redteam/constants';
import { getGraderById } from '../redteam/graders';
import {
  getGradingInputHash,
  getTargetConversation,
  withGradingUsage,
} from '../redteam/grading/storedResult';
import { isAttackProvider } from '../redteam/shared/attackProviders';
import { checkExfilTracking } from '../redteam/strategies/indirectWebPwn';
import { isApiProvider, isProviderOptions } from '../types/providers';
import invariant from '../util/invariant';
import { accumulateTokenUsage, cloneTokenUsageBreakdown } from '../util/tokenUsageUtils';
import { summarizeTrajectoryForJudge } from './trajectoryUtils';

import type { RedteamGradingContext } from '../redteam/grading/types';
import type {
  ApiProvider,
  Assertion,
  AssertionParams,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../types/index';

/**
 * Analyzes grader errors in the redteam history.
 * Returns whether some (but not all) turns have grader errors.
 * If ALL turns have errors, we should still ERROR. If only SOME have errors, we can be more lenient.
 */
function analyzeGraderErrors(redteamHistory: Array<{ graderError?: string }> | undefined): {
  hasAnyErrors: boolean;
  allTurnsHaveErrors: boolean;
} {
  if (!redteamHistory || !Array.isArray(redteamHistory) || redteamHistory.length === 0) {
    return { hasAnyErrors: false, allTurnsHaveErrors: false };
  }

  const turnsWithErrors = redteamHistory.filter(
    (turn) => turn.graderError && turn.graderError.length > 0,
  );
  const hasAnyErrors = turnsWithErrors.length > 0;
  const allTurnsHaveErrors = turnsWithErrors.length === redteamHistory.length;

  return { hasAnyErrors, allTurnsHaveErrors };
}

function matchesStoredGraderResult(
  assertion: Assertion,
  storedResult: GradingResult,
  test: AtomicTestCase,
  provider: ApiProvider | undefined,
): boolean {
  const pluginId = test.metadata?.pluginId;
  const configuredProvider = test.provider ?? provider;
  const providerId =
    typeof configuredProvider === 'string'
      ? configuredProvider
      : isApiProvider(configuredProvider)
        ? configuredProvider.id()
        : isProviderOptions(configuredProvider)
          ? configuredProvider.id
          : undefined;

  // A target can return arbitrary metadata. Only the configured attack executor
  // may supply a reusable grade; a marker in the response is not provenance.
  if (
    !pluginId ||
    !test.metadata?.strategyId ||
    !providerId?.startsWith('promptfoo:redteam:') ||
    !isAttackProvider(providerId) ||
    typeof storedResult.metadata?.redteamGradingInputHash !== 'string'
  ) {
    return false;
  }
  const pluginAssertionType = `promptfoo:redteam:${pluginId}`;
  if (
    assertion.type !== pluginAssertionType &&
    assertion.type !== getGraderById(pluginAssertionType)?.id
  ) {
    return false;
  }

  // Strategies preserve the assertion they actually graded. Plugin IDs can name a
  // subcategory (pii:social) while its assertion names a shared grader (pii).
  if (storedResult.assertion?.type) {
    return (
      storedResult.assertion.type === assertion.type &&
      (storedResult.assertion.metric === undefined ||
        storedResult.assertion.metric === assertion.metric)
    );
  }

  // Without a recorded assertion, the grade cannot be associated with this check.
  return false;
}

function getRedteamPrompt(
  prompt: string | undefined,
  test: AtomicTestCase,
  providerResponse: ProviderResponse,
  lastUserPrompt?: string,
): string | undefined {
  const finalPrompt = providerResponse.metadata?.redteamFinalPrompt;
  if (typeof finalPrompt === 'string' && finalPrompt.trim()) {
    return finalPrompt;
  }

  // Providers can report input they generated dynamically. Strategy transforms
  // can still supersede that input, so redteamFinalPrompt takes precedence.
  if (typeof providerResponse.prompt === 'string' && providerResponse.prompt.trim()) {
    return providerResponse.prompt;
  }

  if (lastUserPrompt) {
    return lastUserPrompt;
  }

  if (prompt) {
    return prompt;
  }

  if (typeof test.vars?.[MULTI_INPUT_VAR] === 'string') {
    return test.vars[MULTI_INPUT_VAR];
  }

  if (typeof test.vars?.prompt === 'string') {
    return test.vars.prompt;
  }

  return undefined;
}

function createInitialGradingContext({
  assertionValueContext,
  providerResponse,
  conversationTranscript,
}: Pick<AssertionParams, 'assertionValueContext' | 'providerResponse'> & {
  conversationTranscript?: string;
}): RedteamGradingContext {
  const gradingContext: RedteamGradingContext = {
    providerResponse,
    ...(conversationTranscript === undefined ? {} : { conversationTranscript }),
  };

  if (assertionValueContext.trace) {
    gradingContext.traceData = assertionValueContext.trace;
    gradingContext.traceSummary = summarizeTrajectoryForJudge(assertionValueContext.trace);
  }

  return gradingContext;
}

/**
 * As the name implies, this function "handles" redteam assertions by either calling the
 * grader or preferably returning a `storedGraderResult` if it exists on the provider response.
 */
export const handleRedteam = async ({
  assertion,
  baseType,
  test,
  prompt,
  outputString,
  provider,
  renderedValue,
  providerResponse,
  assertionValueContext,
}: AssertionParams): Promise<GradingResult> => {
  // Skip grading if stored result exists from strategy execution for this specific assertion
  const savedConversation = getTargetConversation(providerResponse.metadata?.messages);
  const reportedConversation = getTargetConversation(providerResponse.prompt);
  const hasFinalPrompt =
    typeof providerResponse.metadata?.redteamFinalPrompt === 'string' &&
    providerResponse.metadata.redteamFinalPrompt.trim();
  const { lastUserPrompt, conversationTranscript } =
    (hasFinalPrompt && savedConversation.lastUserPrompt) || !reportedConversation.lastUserPrompt
      ? savedConversation
      : reportedConversation;
  const effectivePrompt = getRedteamPrompt(prompt, test, providerResponse, lastUserPrompt);
  invariant(effectivePrompt, `Grader ${baseType} must have a prompt`);

  const storedResult = providerResponse.metadata?.storedGraderResult as GradingResult | undefined;
  const hasStrategyGrade =
    storedResult && matchesStoredGraderResult(assertion, storedResult, test, provider);
  if (
    hasStrategyGrade &&
    storedResult.metadata?.redteamGradingInputHash ===
      getGradingInputHash(
        effectivePrompt,
        outputString,
        providerResponse.metadata?.messages,
        test.metadata?.pluginId,
      )
  ) {
    // Check if any turns had grader errors (even though we have a stored result)
    const redteamHistory = providerResponse.metadata?.redteamHistory as
      | Array<{ graderError?: string }>
      | undefined;
    const { hasAnyErrors } = analyzeGraderErrors(redteamHistory);

    return {
      ...storedResult,
      assertion: {
        ...(storedResult.assertion ?? assertion),
        value: storedResult.assertion?.value || assertion.value,
      },
      metadata: {
        ...test.metadata,
        ...storedResult.metadata,
        // Propagate gradingIncomplete if any turns had grader errors
        ...(hasAnyErrors ? { gradingIncomplete: true } : {}),
      },
    };
  }

  const grader = getGraderById(assertion.type);
  invariant(grader, `Unknown grader: ${baseType}`);

  // Build grading context from provider response metadata, test metadata, and locally
  // captured assertion trace data. Keep raw trace data in-process for deterministic
  // graders; pass only a compact trajectory summary into model-graded rubrics.
  // This includes exfil tracking data from indirect-web-pwn strategy
  let gradingContext = createInitialGradingContext({
    assertionValueContext,
    providerResponse,
    conversationTranscript,
  });
  const webPageUuid =
    (providerResponse.metadata?.webPageUuid as string | undefined) ||
    (test.metadata?.webPageUuid as string | undefined);
  if (webPageUuid) {
    // Try to get evalId from metadata, or extract from webPageUrl
    // URL format: /dynamic-pages/{evalId}/{uuid}
    let evalId = test.metadata?.evaluationId as string | undefined;
    if (!evalId) {
      // Check both providerResponse.metadata and test.metadata for webPageUrl
      const webPageUrl =
        (providerResponse.metadata?.webPageUrl as string | undefined) ||
        (test.metadata?.webPageUrl as string | undefined);
      if (webPageUrl) {
        const match = webPageUrl.match(/\/dynamic-pages\/([^/]+)\//);
        if (match) {
          evalId = match[1];
        }
      }
    }
    const tracking = await checkExfilTracking(webPageUuid, evalId);
    if (tracking) {
      gradingContext = {
        ...gradingContext,
        wasExfiltrated: tracking.wasExfiltrated,
        exfilCount: tracking.exfilCount,
        exfilRecords: tracking.exfilRecords,
      };
    }
  }

  // A stale verdict is unusable, but its strategy grading calls still incurred usage.
  const tokensUsed =
    hasStrategyGrade && storedResult.tokensUsed
      ? cloneTokenUsageBreakdown(storedResult.tokensUsed)
      : undefined;

  try {
    const { grade, rubric, suggestions } = await grader.getResult(
      effectivePrompt,
      outputString,
      test,
      provider,
      renderedValue,
      undefined, // additionalRubric
      undefined, // skipRefusalCheck
      gradingContext,
    );

    if (tokensUsed && grade.tokensUsed) {
      accumulateTokenUsage(
        tokensUsed,
        grade.metadata?.cachedResponse === true
          ? {
              total: 0,
              cached:
                grade.tokensUsed.cached ||
                grade.tokensUsed.total ||
                (grade.tokensUsed.prompt ?? 0) + (grade.tokensUsed.completion ?? 0),
              numRequests: 0,
            }
          : grade.tokensUsed,
      );
    }

    const gradeWithUsage = tokensUsed ? withGradingUsage(grade, tokensUsed) : grade;
    return {
      ...gradeWithUsage,
      ...(grade.assertion || assertion
        ? {
            assertion: {
              ...(grade.assertion ?? assertion),
              value: rubric,
            },
          }
        : {}),
      suggestions,
      metadata: {
        // Pass through all test metadata for redteam
        ...test.metadata,
        ...gradeWithUsage.metadata,
      },
    };
  } catch (error) {
    // For iterative strategies, check if only SOME turns had grader errors (not all).
    // If only some failed, we can be lenient. If ALL failed, we should still ERROR.
    const redteamHistory = providerResponse.metadata?.redteamHistory as
      | Array<{ graderError?: string }>
      | undefined;
    const { hasAnyErrors, allTurnsHaveErrors } = analyzeGraderErrors(redteamHistory);

    // Only handle gracefully if this is an iterative test with SOME (not all) grader errors
    if (test.metadata?.strategyId && hasAnyErrors && !allTurnsHaveErrors) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('[Redteam] Grading failed for iterative test with some prior grader errors', {
        error: errorMessage,
        strategyId: test.metadata.strategyId,
        pluginId: test.metadata.pluginId,
      });

      return {
        pass: true,
        score: 0,
        reason: `Some grading calls failed during iterative testing. Check the Messages tab for details.`,
        assertion,
        ...(tokensUsed ? { tokensUsed } : {}),
        metadata: {
          ...test.metadata,
          gradingIncomplete: true,
          gradingError: errorMessage,
        },
      };
    }

    // For non-iterative tests, tests without grader errors, or tests where ALL turns failed, re-throw
    throw error;
  }
};
