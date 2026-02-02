import logger from '../logger';
import { getGraderById } from '../redteam/graders';
import { checkExfilTracking } from '../redteam/strategies/indirectWebPwn';
import invariant from '../util/invariant';

import type { RedteamGradingContext } from '../redteam/plugins/base';
import type { AssertionParams, GradingResult } from '../types/index';

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
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  // Skip grading if stored result exists from strategy execution for this specific assertion
  if (
    providerResponse.metadata?.storedGraderResult &&
    test.metadata?.pluginId &&
    assertion.type.includes(test.metadata.pluginId)
  ) {
    const storedResult = providerResponse.metadata.storedGraderResult;

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
  invariant(prompt, `Grader ${baseType} must have a prompt`);
  // Build grading context from provider response metadata or test metadata
  // This includes exfil tracking data from indirect-web-pwn strategy
  let gradingContext: RedteamGradingContext | undefined;
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
        wasExfiltrated: tracking.wasExfiltrated,
        exfilCount: tracking.exfilCount,
        exfilRecords: tracking.exfilRecords,
      };
    }
  }

  try {
    const { grade, rubric, suggestions } = await grader.getResult(
      prompt,
      outputString,
      test,
      provider,
      renderedValue,
      undefined, // additionalRubric
      undefined, // skipRefusalCheck
      // Merge traceparent into gradingContext for grader span tracing
      gradingContext || providerCallContext?.traceparent
        ? { ...gradingContext, traceparent: providerCallContext?.traceparent }
        : undefined,
    );

    return {
      ...grade,
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
        ...grade.metadata,
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
