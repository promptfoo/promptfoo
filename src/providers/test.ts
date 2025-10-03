import dedent from 'dedent';
import { v4 as uuidv4 } from 'uuid';
import { getEnvString } from '../envars';
import logger from '../logger';
import { matchesLlmRubric } from '../matchers';
import { neverGenerateRemote } from '../redteam/remoteGeneration';
import { fetchWithProxy } from '../util/fetch';
import { sanitizeObject } from '../util/sanitizer';

import type { ApiProvider } from '../types/providers';

export interface ProviderTestResult {
  success: boolean;
  message: string;
  error?: string;
  providerResponse?: any;
  transformedRequest?: any;
  sessionId?: string;
  analysis?: {
    changes_needed?: boolean;
    changes_needed_reason?: string;
    changes_needed_suggestions?: string[];
  };
}

export interface SessionTestResult {
  success: boolean;
  message: string;
  reason?: string;
  error?: string;
  details?: {
    sessionId?: string;
    sessionSource?: string;
    request1?: { prompt: string; sessionId?: string };
    response1?: any;
    request2?: { prompt: string; sessionId?: string };
    response2?: any;
  };
}

/**
 * Tests basic provider connectivity with "Hello, world!" prompt
 * Extracted from POST /providers/test endpoint
 */
export async function testHTTPProviderConnectivity(
  provider: ApiProvider,
): Promise<ProviderTestResult> {
  const vars: Record<string, string> = {};

  // Generate a session ID for testing (works for both client and server sessions)
  // For server sessions, this provides a value for the first request; subsequent
  // requests will use the server-returned session ID
  vars['sessionId'] = uuidv4();

  let result;
  try {
    result = await provider.callApi('Hello, world!', {
      debug: true,
      prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
      vars,
    });

    logger.debug('[testProviderConnectivity] result from API provider', {
      result: sanitizeObject(result),
      providerId: provider.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug('[testProviderConnectivity] Error calling provider API', {
      error: errorMessage,
      providerId: provider.id,
    });
    result = {
      success: false,
      message: `Provider call failed: ${errorMessage}`,
      error: errorMessage,
    };
  }

  const sessionId = provider.getSessionId?.() ?? result?.sessionId ?? vars.sessionId ?? undefined;

  // Skip remote grading if disabled
  if (neverGenerateRemote()) {
    logger.debug('[testProviderConnectivity] Remote grading disabled, returning raw result');
    return {
      success: !result?.error,
      message: result?.error
        ? `Provider returned error: ${result.error}`
        : 'Provider test completed. Remote grading disabled - please review the response manually.',
      error: result?.error,
      providerResponse: result,
      transformedRequest: result?.metadata?.transformedRequest,
      sessionId,
    };
  }

  const HOST = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');

  try {
    // Call the agent helper to evaluate the results of the provider
    logger.debug('[testProviderConnectivity] Calling agent helper', {
      providerId: provider.id,
    });

    const testAnalyzerResponse = await fetchWithProxy(`${HOST}/api/v1/providers/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: provider.config,
        providerResponse: result?.raw,
        parsedResponse: result?.output,
        error: result?.error,
        headers: result?.metadata?.http?.headers,
      }),
    });

    if (!testAnalyzerResponse.ok) {
      logger.error('[testProviderConnectivity] Error calling agent helper', {
        error: testAnalyzerResponse.statusText,
        providerId: provider.id,
      });

      return {
        success: !result?.error,
        message: 'Error evaluating the results. Please review the provider response manually.',
        error: 'Remote evaluation failed',
        providerResponse: { ...result, sessionId },
        transformedRequest: result?.metadata?.transformedRequest,
        sessionId,
      };
    }

    const testAnalyzerResponseObj = await testAnalyzerResponse.json();

    return {
      success: !testAnalyzerResponseObj.error && !testAnalyzerResponseObj.changes_needed,
      message: testAnalyzerResponseObj.message || testAnalyzerResponseObj.error || 'Test completed',
      error: testAnalyzerResponseObj.error,
      providerResponse: { ...result, sessionId },
      transformedRequest: result?.metadata?.transformedRequest,
      sessionId,
      analysis: testAnalyzerResponseObj.changes_needed
        ? {
            changes_needed: testAnalyzerResponseObj.changes_needed,
            changes_needed_reason: testAnalyzerResponseObj.changes_needed_reason,
            changes_needed_suggestions: testAnalyzerResponseObj.changes_needed_suggestions,
          }
        : undefined,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('[testProviderConnectivity] Error calling agent helper', {
      error: errorMessage,
      providerId: provider.id,
    });

    return {
      success: !result?.error,
      message: 'Error evaluating the results. Please review the provider response manually.',
      error: errorMessage,
      providerResponse: result,
      transformedRequest: result?.metadata?.transformedRequest,
      sessionId,
    };
  }
}

/**
 * Tests multi-turn session functionality
 * Extracted from POST /providers/test-session endpoint
 */
export async function testProviderSession(
  provider: ApiProvider,
  sessionConfig?: { sessionSource?: string; sessionParser?: string },
  options?: { skipConfigValidation?: boolean },
): Promise<SessionTestResult> {
  try {
    // Determine effective session source
    const effectiveSessionSource =
      sessionConfig?.sessionSource || provider.config?.sessionSource || 'server';

    // Skip validation checks if requested (e.g., for CLI usage)
    if (!options?.skipConfigValidation) {
      // Validate client-side session configuration
      if (effectiveSessionSource === 'client') {
        const configStr = JSON.stringify(provider.config || {});
        const hasSessionIdTemplate = configStr.includes('{{sessionId}}');

        if (!hasSessionIdTemplate) {
          logger.warn(
            '[testProviderSession] Warning: Session source is set to client but {{sessionId}} not found',
            {
              providerId: provider.id,
            },
          );

          return {
            success: false,
            message:
              'Session configuration error: {{sessionId}} variable is not used in the provider configuration',
            reason:
              'When using client-side sessions, you must include {{sessionId}} in your request headers or body.',
            details: {
              sessionSource: effectiveSessionSource,
            },
          };
        }
      }

      // Validate server-side session configuration
      if (effectiveSessionSource === 'server') {
        const sessionParser = sessionConfig?.sessionParser || provider.config?.sessionParser;

        if (!sessionParser || sessionParser.trim() === '') {
          logger.warn(
            '[testProviderSession] Warning: Session source is server but no session parser configured',
            {
              providerId: provider.id,
            },
          );

          return {
            success: false,
            message:
              'Session configuration error: No session parser configured for server-generated sessions',
            reason:
              'When using server-side sessions, you must configure a session parser to extract the session ID from the response.',
            details: {
              sessionSource: effectiveSessionSource,
            },
          };
        }
      }
    }

    // First request - establish session
    const firstPrompt = 'What can you help me with?';
    const vars: Record<string, string> = {};

    // Generate a session ID for the first request (works for both client and server sessions)
    // For server sessions, this provides a value for the first request; the server-returned
    // session ID will be used for subsequent requests
    vars['sessionId'] = uuidv4();

    // Update provider config with session settings
    if (sessionConfig) {
      provider.config = {
        ...provider.config,
        sessionSource: effectiveSessionSource,
        sessionParser: sessionConfig.sessionParser || provider.config?.sessionParser,
      };
    }

    const firstResult = await provider.callApi(firstPrompt, {
      debug: true,
      prompt: { raw: firstPrompt, label: firstPrompt },
      vars,
    });

    logger.debug('[testProviderSession] First request completed', {
      prompt: firstPrompt,
      sessionId: vars.sessionId || 'server-generated',
      providerId: provider.id,
    });

    // Get session ID (from result, provider method, or client-generated vars)
    const sessionId =
      provider.getSessionId?.() ?? firstResult?.sessionId ?? vars.sessionId ?? undefined;

    // Validate that server-generated session was extracted
    if (effectiveSessionSource === 'server' && (!sessionId || sessionId.trim() === '')) {
      const sessionParser = sessionConfig?.sessionParser || provider.config?.sessionParser;
      logger.error('[testProviderSession] Failed to extract session ID from server response', {
        sessionParser,
        providerId: provider.id,
      });

      return {
        success: false,
        message:
          'Session extraction failed: The session parser did not extract a session ID from the server response',
        reason:
          "The session parser expression did not return a valid session ID. Check that the parser matches your server's response format.",
        details: {
          sessionSource: effectiveSessionSource,
          sessionId: 'Not extracted',
          request1: {
            prompt: firstPrompt,
          },
          response1: firstResult?.output,
        },
      };
    }

    // Update vars with session ID for second request
    if (sessionId) {
      vars['sessionId'] = sessionId;
    }

    // Second request - verify session persistence
    const secondPrompt = 'What was the last thing I asked you?';
    const secondResult = await provider.callApi(secondPrompt, {
      debug: true,
      prompt: { raw: secondPrompt, label: secondPrompt },
      vars,
    });

    logger.debug('[testProviderSession] Second request completed', {
      prompt: secondPrompt,
      sessionId,
      providerId: provider.id,
    });

    // Check if remote grading is disabled
    if (neverGenerateRemote()) {
      return {
        success: false,
        message:
          'Session test completed. Remote grading is disabled - please examine the results yourself.',
        reason: 'Manual review required - remote grading is disabled',
        details: {
          sessionId: sessionId || 'Not extracted',
          sessionSource: effectiveSessionSource,
          request1: {
            prompt: firstPrompt,
            sessionId: vars.sessionId,
          },
          response1: firstResult?.output,
          request2: {
            prompt: secondPrompt,
            sessionId,
          },
          response2: secondResult?.output,
        },
      };
    }

    // Create judge rubric for evaluating session persistence
    const judgeRubric = dedent`
      You are evaluating whether a conversation system correctly maintains session state across multiple messages.

      In the first message, the user asked what the system can help with.
      In the second message, the user asked what was the last thing they asked.

      First Message: "${firstPrompt}"
      First Response: {{firstResponse}}

      Second Message: "${secondPrompt}"
      Second Response: {{output}}

      Evaluate whether the system correctly remembered the user's first question when responding to the second message.

      Important criteria:
      - Pass: The response clearly indicates remembering the first question (e.g., "You asked what I can help you with", "Your last question was about what I can do")
      - Fail: The response indicates not remembering (e.g., "I don't know", "I don't have that information", generic responses)
      - Fail: The response is evasive or doesn't directly answer what the previous question was

      Respond with a JSON object containing:
      {
        "pass": boolean,  // true if the system clearly remembered the first question, false otherwise
        "reason": "string" // Brief explanation of your evaluation
      }
    `;

    const judgeResult = await matchesLlmRubric(
      judgeRubric,
      JSON.stringify(secondResult?.output),
      {},
      {
        firstResponse: JSON.stringify(firstResult?.output),
      },
    );

    logger.debug('[testProviderSession] Judge result', {
      pass: judgeResult.pass,
      reason: judgeResult.reason,
      providerId: provider.id,
    });

    const sessionWorking = judgeResult.pass;
    const judgeReason = judgeResult.reason;

    return {
      success: sessionWorking,
      message: sessionWorking
        ? 'Session management is working correctly! The provider remembered information across requests.'
        : 'Session is NOT working. The provider did not remember information from the first request.',
      reason: judgeReason,
      details: {
        sessionId: sessionId || 'Not extracted',
        sessionSource: effectiveSessionSource,
        request1: {
          prompt: firstPrompt,
          sessionId: vars.sessionId,
        },
        response1: firstResult?.output,
        request2: {
          prompt: secondPrompt,
          sessionId,
        },
        response2: secondResult?.output,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[testProviderSession] Error testing session', {
      error: errorMessage,
      providerId: provider.id,
    });

    return {
      success: false,
      message: `Failed to test session: ${errorMessage}`,
      error: errorMessage,
    };
  }
}
