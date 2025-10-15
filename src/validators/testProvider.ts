import dedent from 'dedent';
import { v4 as uuidv4 } from 'uuid';
import { evaluate } from '../evaluator';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import Eval from '../models/eval';
import { neverGenerateRemote } from '../redteam/remoteGeneration';
import { doRemoteGrading } from '../remoteGrading';
import { fetchWithProxy } from '../util/fetch';
import { sanitizeObject } from '../util/sanitizer';
import {
  determineEffectiveSessionSource,
  formatConfigBody,
  formatConfigHeaders,
  validateSessionConfig,
} from './util';

import type { EvaluateOptions, TestSuite } from '../types/index';
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

type ValidationResult = { success: true } | { success: false; result: SessionTestResult };

/**
 * Tests basic provider connectivity with "Hello, world!" prompt
 * Extracted from POST /providers/test endpoint
 */
export async function testHTTPProviderConnectivity(
  provider: ApiProvider,
): Promise<ProviderTestResult> {
  const vars: Record<string, string> = {};

  // Generate a session ID for testing (works for both client sessions)
  // For server sessions, a value is provided by the server, and subsequent
  // requests will use the server-returned session ID
  if (!provider.config.sessionParser) {
    vars['sessionId'] = uuidv4();
  }

  // Build TestSuite for evaluation (no assertions - we'll use agent endpoint for analysis)
  const testSuite: TestSuite = {
    providers: [provider],
    prompts: [
      {
        raw: 'Hello, world!',
        label: 'Connectivity Test',
      },
    ],
    tests: [
      {
        vars,
      },
    ],
  };

  try {
    // Create evaluation record
    const evalRecord = new Eval({});

    // Run evaluation
    logger.debug('[testProviderConnectivity] Running evaluation', {
      providerId: provider.id,
    });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1,
      showProgressBar: false,
    } as EvaluateOptions);

    // Get results
    const summary = await evalRecord.toEvaluateSummary();
    const result = summary.results[0];

    logger.debug('[testProviderConnectivity] Evaluation completed', {
      result: sanitizeObject(result),
      providerId: provider.id,
    });

    // Extract session ID
    const sessionId = provider.getSessionId?.() ?? result.response?.sessionId ?? vars.sessionId;

    // If remote grading is disabled, return basic success
    if (neverGenerateRemote()) {
      logger.debug('[testProviderConnectivity] Remote grading disabled, returning raw result');
      return {
        success: !result.error,
        message: result.error
          ? `Provider returned error: ${result.error}`
          : 'Provider test completed. Remote grading disabled - please review the response manually.',
        error: result.error || undefined,
        providerResponse: result.response,
        transformedRequest: result.response?.metadata?.transformedRequest,
        sessionId,
      };
    }

    // Call the agent helper endpoint to evaluate the results (even if there's an error)
    const HOST = cloudConfig.getApiHost();

    try {
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
          providerResponse: result.response?.raw,
          parsedResponse: result.response?.output,
          error: result.error,
          headers: result.response?.metadata?.http?.headers,
        }),
      });

      if (!testAnalyzerResponse.ok) {
        logger.error('[testProviderConnectivity] Error calling agent helper', {
          error: testAnalyzerResponse.statusText,
          providerId: provider.id,
        });

        return {
          success: false,
          message: 'Error evaluating the results. Please review the provider response manually.',
          error: 'Remote evaluation failed',
          providerResponse: result.response,
          transformedRequest: result.response?.metadata?.transformedRequest,
          sessionId,
        };
      }

      const testAnalyzerResponseObj = await testAnalyzerResponse.json();

      const errorMsg = result.error ?? result.response?.error ?? testAnalyzerResponseObj.error;

      return {
        success: !testAnalyzerResponseObj.error && !testAnalyzerResponseObj.changes_needed,
        message:
          testAnalyzerResponseObj.message ||
          testAnalyzerResponseObj.error ||
          errorMsg ||
          "Test successfully completed. We've verified that the provider is working correctly.",
        error: errorMsg
          ? errorMsg.substring(0, 100) + (errorMsg.length > 100 ? '...' : '')
          : undefined,
        providerResponse: result.response,
        transformedRequest: result.response?.metadata?.transformedRequest,
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
        success: false,
        message: 'Error evaluating the results. Please review the provider response manually.',
        error: errorMessage,
        providerResponse: result.response,
        transformedRequest: result.response?.metadata?.transformedRequest,
        sessionId,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[testProviderConnectivity] Error during evaluation', {
      error: errorMessage,
      providerId: provider.id,
    });

    return {
      success: false,
      message: 'Error evaluating the provider. Please review the error details.',
      error: errorMessage,
    };
  }
}

/**
 * Updates provider configuration with session settings
 */
function updateProviderConfigWithSession({
  provider,
  sessionSource,
  sessionConfig,
}: {
  provider: ApiProvider;
  sessionSource: string;
  sessionConfig?: { sessionSource?: string; sessionParser?: string };
}): void {
  if (!sessionConfig) {
    return;
  }

  provider.config = {
    ...provider.config,
    sessionSource,
    sessionParser: sessionConfig.sessionParser || provider.config?.sessionParser,
  };
}

/**
 * Validates and configures session settings for the provider
 * Performs all validation checks and updates provider config if successful
 */
function validateAndConfigureSessions({
  provider,
  sessionConfig,
  options,
}: {
  provider: ApiProvider;
  sessionConfig?: { sessionSource?: string; sessionParser?: string };
  options?: { skipConfigValidation?: boolean };
}): ValidationResult {
  const effectiveSessionSource = determineEffectiveSessionSource({ provider, sessionConfig });

  // Validate session configuration (logs warnings but does not prevent test execution)
  // Skip validation checks for cloud targets, as that'll be validated on the UI.
  if (!options?.skipConfigValidation) {
    validateSessionConfig({
      provider,
      sessionSource: effectiveSessionSource,
      sessionConfig,
    });
  }

  updateProviderConfigWithSession({
    provider,
    sessionSource: effectiveSessionSource,
    sessionConfig,
  });

  return { success: true };
}

/**
 * Validates that server-generated session was successfully extracted
 * Returns validation result with success flag
 */
function validateServerSessionExtraction({
  sessionSource,
  sessionId,
  firstPrompt,
  firstResult,
}: {
  sessionSource: string;
  sessionId: string;
  firstPrompt: string;
  firstResult: any;
}): ValidationResult {
  if (sessionSource !== 'server') {
    return { success: true };
  }

  if (!sessionId || sessionId.trim() === '') {
    return {
      success: false,
      result: {
        success: false,
        message:
          'Session extraction failed: The session parser did not extract a session ID from the server response',
        reason:
          "The session parser expression did not return a valid session ID. Check that the parser matches your server's response format.",
        details: {
          sessionSource,
          sessionId: 'Not extracted',
          request1: { prompt: firstPrompt },
          response1: firstResult.response?.output,
        },
      },
    };
  }

  return { success: true };
}

/**
 * Builds troubleshooting advice for server-side sessions
 */
function buildServerSessionTroubleshootingAdvice({
  sessionConfig,
  providerConfig,
  firstResult,
  secondResult,
}: {
  sessionConfig: { sessionSource?: string; sessionParser?: string } | undefined;
  providerConfig: any;
  firstResult: any;
  secondResult: any;
}): string {
  const firstSessionId = firstResult.response?.sessionId ?? firstResult.metadata?.sessionId;
  const secondSessionId = secondResult.response?.sessionId ?? secondResult.metadata?.sessionId;

  return dedent`

    Troubleshooting tips for server-side sessions:
    - SessionParser: ${sessionConfig?.sessionParser || providerConfig?.sessionParser || 'Not configured'}
    - First request parsed session ID: ${firstSessionId || 'None extracted'}
    - Second request parsed session ID: ${secondSessionId || 'None extracted'}
    
    Common issues:
    1. Verify your sessionParser expression correctly extracts the session ID from the response
    2. Check that your server is actually returning a session ID in the expected location
    3. Confirm the session ID format matches what your sessionParser expects
    4. Ensure the same session ID is being extracted from both responses
  `;
}

/**
 * Builds troubleshooting advice based on session source
 */
function buildTroubleshootingAdvice({
  sessionWorking,
  sessionSource,
  sessionConfig,
  providerConfig,
  initialSessionId,
  firstResult,
  secondResult,
}: {
  sessionWorking: boolean;
  sessionSource: string;
  sessionConfig: { sessionSource?: string; sessionParser?: string } | undefined;
  providerConfig: any;
  initialSessionId: string | undefined;
  firstResult: any;
  secondResult: any;
}): string {
  if (sessionWorking) {
    return '';
  }

  if (sessionSource === 'server') {
    return buildServerSessionTroubleshootingAdvice({
      sessionConfig,
      providerConfig,
      firstResult,
      secondResult,
    });
  }

  const configuredHeaders = formatConfigHeaders({ headers: providerConfig?.headers });
  const configuredBody = formatConfigBody({ body: providerConfig?.body });
  const configStr = JSON.stringify(providerConfig || {});
  const usesSessionId = configStr.includes('{{sessionId}}');

  return dedent`

    Troubleshooting tips for client-side sessions:
    - Session ID sent: ${initialSessionId}
    - {{sessionId}} variable used in config: ${usesSessionId ? 'Yes' : 'No ⚠️'}
    
    Your configured headers:${configuredHeaders}
    
    Your configured body:${configuredBody}
    
    Common issues:
    1. Ensure {{sessionId}} is in the correct location for your API
    2. Verify your server accepts and maintains sessions using the session ID you send
    3. Check that your server's session management is configured correctly
    4. Confirm the session ID is being passed in the format your server expects
  `;
}

/**
 * Tests multi-turn session functionality by making two sequential requests
 * For server-sourced sessions, extracts sessionId from first response and uses it in second request
 * For client-sourced sessions, generates a sessionId and uses it in both requests
 */
export async function testProviderSession(
  provider: ApiProvider,
  sessionConfig?: { sessionSource?: string; sessionParser?: string },
  options?: { skipConfigValidation?: boolean },
): Promise<SessionTestResult> {
  try {
    // Validate sessions config
    const sessionValidation = validateAndConfigureSessions({
      provider,
      sessionConfig,
      options,
    });
    if (!sessionValidation.success) {
      return sessionValidation.result;
    }

    const effectiveSessionSource = determineEffectiveSessionSource({
      provider,
      sessionConfig,
    });

    const initialSessionId = effectiveSessionSource === 'server' ? undefined : uuidv4();

    const firstPrompt = 'What can you help me with?';
    const secondPrompt = 'What was the last thing I asked you?';

    // Make first request
    logger.debug('[testProviderSession] Making first request', {
      prompt: firstPrompt,
      sessionId: initialSessionId,
      providerId: provider.id,
    });

    const firstContext = {
      vars: {
        ...(initialSessionId ? { sessionId: initialSessionId } : {}),
      },
      prompt: {
        raw: firstPrompt,
        label: 'Session Test - Request 1',
      },
    };

    const firstResponse = await provider.callApi(firstPrompt, firstContext);

    logger.debug('[testProviderSession] First request completed', {
      response: sanitizeObject(firstResponse),
      providerId: provider.id,
    });

    // Check for errors in first response
    if (firstResponse.error) {
      return {
        success: false,
        message: `First request failed: ${firstResponse.error}`,
        error: firstResponse.error,
        details: {
          sessionId: initialSessionId || 'Not applicable',
          sessionSource: effectiveSessionSource,
          request1: { prompt: firstPrompt, sessionId: initialSessionId },
          response1: firstResponse.output || firstResponse.error,
        },
      };
    }

    // Extract session ID from first response
    const extractedSessionId =
      provider.getSessionId?.() ?? firstResponse.sessionId ?? initialSessionId;

    logger.debug('[testProviderSession] Session ID extracted', {
      extractedSessionId,
      providerId: provider.id,
    });

    // Validate server session extraction
    const serverExtraction = validateServerSessionExtraction({
      sessionSource: effectiveSessionSource,
      sessionId: extractedSessionId ?? '',
      firstPrompt,
      firstResult: { response: firstResponse },
    });

    if (!serverExtraction.success) {
      return serverExtraction.result;
    }

    // Make second request with extracted session ID
    logger.debug('[testProviderSession] Making second request', {
      prompt: secondPrompt,
      sessionId: extractedSessionId,
      providerId: provider.id,
    });

    const secondContext = {
      vars: {
        ...(extractedSessionId ? { sessionId: extractedSessionId } : {}),
      },
      prompt: {
        raw: secondPrompt,
        label: 'Session Test - Request 2',
      },
    };

    const secondResponse = await provider.callApi(secondPrompt, secondContext);

    logger.debug('[testProviderSession] Second request completed', {
      response: sanitizeObject(secondResponse),
      providerId: provider.id,
    });

    // Check for errors in second response
    if (secondResponse.error) {
      return {
        success: false,
        message: `Second request failed: ${secondResponse.error}`,
        error: secondResponse.error,
        details: {
          sessionId: extractedSessionId || 'Not extracted',
          sessionSource: effectiveSessionSource,
          request1: { prompt: firstPrompt, sessionId: initialSessionId },
          response1: firstResponse.output,
          request2: { prompt: secondPrompt, sessionId: extractedSessionId },
          response2: secondResponse.output || secondResponse.error,
        },
      };
    }

    // Handle remote grading disabled
    if (neverGenerateRemote()) {
      return {
        success: false,
        message:
          'Session test completed. Remote grading is disabled - please examine the results yourself.',
        reason: 'Manual review required - remote grading is disabled',
        details: {
          sessionId: extractedSessionId || 'Not extracted',
          sessionSource: effectiveSessionSource,
          request1: { prompt: firstPrompt, sessionId: initialSessionId },
          response1: firstResponse.output,
          request2: { prompt: secondPrompt, sessionId: extractedSessionId },
          response2: secondResponse.output,
        },
      };
    }

    // Call LLM rubric to evaluate if session is working
    logger.debug('[testProviderSession] Evaluating session with LLM rubric', {
      providerId: provider.id,
    });

    let sessionWorking = false;
    let judgeReason = 'Session memory test completed';

    try {
      const gradingResult = await doRemoteGrading({
        task: 'llm-rubric',
        rubric: dedent`
        You are evaluating whether a conversation system correctly maintains session state across multiple messages.
  
        In the first message, the user asked what the system can help with.
        In the second message, the user asked what was the last thing they asked.
  
        First Message: "${firstPrompt}"
        First Response: ${firstResponse.output}
  
        Second Message: "${secondPrompt}"
        Second Response: ${secondResponse.output}
  
        Evaluate whether the system correctly remembered the user's first question when responding to the second message.
  
        Important criteria:
        - Pass: The response clearly indicates remembering the first question (e.g., "You asked what I can help you with", "Your last question was about what I can do")
        - Fail: The response indicates not remembering (e.g., "I don't know", "I don't have that information", generic responses)
        - Fail: The response is evasive or doesn't directly answer what the previous question was
  
        Respond with a JSON object containing:
        {
          "pass": boolean,
          "reason": "string"
        }
      `,
        output: secondResponse.output || '',
        vars: {
          firstPrompt,
          firstResponse: firstResponse.output || '',
          secondPrompt,
          secondResponse: secondResponse.output || '',
        },
      });

      sessionWorking = gradingResult.pass;
      judgeReason = gradingResult.reason || judgeReason;
    } catch (error) {
      logger.warn('[testProviderSession] Failed to evaluate session with LLM rubric', {
        error: error instanceof Error ? error.message : String(error),
        providerId: provider.id,
      });
      // If grading fails, we can't determine if session is working
      // Return failure with a clear message
      return {
        success: false,
        message: 'Failed to evaluate session: Could not perform remote grading',
        error: error instanceof Error ? error.message : String(error),
        details: {
          sessionId: extractedSessionId || 'Not extracted',
          sessionSource: effectiveSessionSource,
          request1: { prompt: firstPrompt, sessionId: initialSessionId },
          response1: firstResponse.output,
          request2: { prompt: secondPrompt, sessionId: extractedSessionId },
          response2: secondResponse.output,
        },
      };
    }

    logger.debug('[testProviderSession] Judge result', {
      pass: sessionWorking,
      reason: judgeReason,
      providerId: provider.id,
    });

    const troubleshootingAdvice = buildTroubleshootingAdvice({
      sessionWorking,
      sessionSource: effectiveSessionSource,
      sessionConfig,
      providerConfig: provider.config,
      initialSessionId,
      firstResult: { response: firstResponse },
      secondResult: { response: secondResponse },
    });

    return {
      success: sessionWorking,
      message: sessionWorking
        ? 'Session management is working correctly! The provider remembered information across requests.'
        : `Session is NOT working. The provider did not remember information from the first request. ${troubleshootingAdvice}`,
      reason: judgeReason,
      details: {
        sessionId: extractedSessionId || 'Not extracted',
        sessionSource: effectiveSessionSource,
        request1: { prompt: firstPrompt, sessionId: initialSessionId },
        response1: firstResponse.output,
        request2: { prompt: secondPrompt, sessionId: extractedSessionId },
        response2: secondResponse.output,
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
