import logger from '../logger';
import { MULTI_INPUT_VAR } from '../redteam/constants';
import { getGraderById } from '../redteam/graders';
import { checkExfilTracking } from '../redteam/strategies/indirectWebPwn';
import invariant from '../util/invariant';
import { summarizeTrajectoryForJudge } from './trajectoryUtils';

import type { RedteamGradingContext } from '../redteam/grading/types';
import type {
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
  pluginId: string | undefined,
): boolean {
  // Strategies preserve the assertion they actually graded. Plugin IDs can name a
  // subcategory (pii:social) while its assertion names a shared grader (pii).
  if (storedResult.assertion?.type) {
    return (
      storedResult.assertion.type === assertion.type &&
      (storedResult.assertion.metric === undefined ||
        storedResult.assertion.metric === assertion.metric)
    );
  }

  // Older results did not record the assertion. Accept the plugin's exact type or
  // its canonical grader, but never a sibling category that shares that grader.
  if (!pluginId) {
    return false;
  }
  const pluginAssertionType = `promptfoo:redteam:${pluginId}`;
  return (
    assertion.type === pluginAssertionType ||
    assertion.type === getGraderById(pluginAssertionType)?.id
  );
}

function getTargetConversation(providerResponse: ProviderResponse): {
  lastUserPrompt?: string;
  conversationTranscript?: string;
} {
  const messages = providerResponse.metadata?.messages;
  if (!Array.isArray(messages)) {
    return {};
  }
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === 'user' && typeof messages[index].content === 'string') {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    return {};
  }

  // Only use the saved target conversation. redteamHistory can include unrelated
  // single-turn attempts or abandoned branches. Keep the current turn separate
  // from prior context, as Crescendo does when grading during a scan.
  const conversationTranscript = messages
    .slice(0, lastUserIndex)
    .filter(
      (message) =>
        (message?.role === 'user' || message?.role === 'assistant') &&
        typeof message.content === 'string',
    )
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n');

  return { lastUserPrompt: messages[lastUserIndex].content, conversationTranscript };
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
  const storedResult = providerResponse.metadata?.storedGraderResult as GradingResult | undefined;
  if (storedResult && matchesStoredGraderResult(assertion, storedResult, test.metadata?.pluginId)) {
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
  const { lastUserPrompt, conversationTranscript } = getTargetConversation(providerResponse);
  const effectivePrompt = getRedteamPrompt(prompt, test, providerResponse, lastUserPrompt);
  invariant(effectivePrompt, `Grader ${baseType} must have a prompt`);

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
