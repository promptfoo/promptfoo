import dedent from 'dedent';
import { v4 as uuidv4 } from 'uuid';
import { getEnvString } from '../envars';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { neverGenerateRemote } from '../redteam/remoteGeneration';
import { fetchWithProxy } from '../util/fetch';
import { sanitizeObject } from '../util/sanitizer';

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

  // Generate a session ID for testing (works for both client and server sessions)
  // For server sessions, this provides a value for the first request; subsequent
  // requests will use the server-returned session ID
  vars['sessionId'] = uuidv4();

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

    // Convert to ProviderTestResult format
    if (result.error) {
      return {
        success: false,
        message: `Provider call failed: ${result.error}`,
        error: result.error,
        providerResponse: result.response,
        transformedRequest: result.response?.metadata?.transformedRequest,
        sessionId,
      };
    }

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

    // Call the agent helper endpoint to evaluate the results
    const HOST = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');

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

      return {
        success: !testAnalyzerResponseObj.error && !testAnalyzerResponseObj.changes_needed,
        message:
          testAnalyzerResponseObj.message || testAnalyzerResponseObj.error || 'Test completed',
        error: testAnalyzerResponseObj.error,
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
 * Determines the effective session source based on config and defaults
 */
function determineEffectiveSessionSource({
  provider,
  sessionConfig,
}: {
  provider: ApiProvider;
  sessionConfig?: { sessionSource?: string; sessionParser?: string };
}): string {
  return (
    sessionConfig?.sessionSource ||
    provider.config?.sessionSource ||
    (provider.config.sessionParser ? 'server' : 'client')
  );
}

/**
 * Validates client-side session configuration
 * Returns validation result with success flag
 */
function validateClientSessionConfig({
  provider,
  sessionSource,
}: {
  provider: ApiProvider;
  sessionSource: string;
}): ValidationResult {
  if (sessionSource !== 'client') {
    return { success: true };
  }

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
      result: {
        success: false,
        message:
          'Session configuration error: {{sessionId}} variable is not used in the provider configuration',
        reason:
          'When using client-side sessions, you must include {{sessionId}} in your request headers or body.',
        details: {
          sessionSource,
        },
      },
    };
  }

  return { success: true };
}

/**
 * Validates server-side session configuration
 * Returns validation result with success flag
 */
function validateServerSessionConfig({
  provider,
  sessionSource,
  sessionConfig,
}: {
  provider: ApiProvider;
  sessionSource: string;
  sessionConfig?: { sessionSource?: string; sessionParser?: string };
}): ValidationResult {
  if (sessionSource !== 'server') {
    return { success: true };
  }

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
      result: {
        success: false,
        message:
          'Session configuration error: No session parser configured for server-generated sessions',
        reason:
          'When using server-side sessions, you must configure a session parser to extract the session ID from the response.',
        details: {
          sessionSource,
        },
      },
    };
  }

  return { success: true };
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
 * Creates test suite for session testing with two sequential requests
 */
function createSessionTestSuite({
  provider,
  firstPrompt,
  secondPrompt,
  initialSessionId,
}: {
  provider: ApiProvider;
  firstPrompt: string;
  secondPrompt: string;
  initialSessionId: string;
}): TestSuite {
  return {
    providers: [provider],
    prompts: [{ raw: '{{input}}', label: 'Session Test' }],
    tests: [
      // Test 1: First request (establishes session)
      {
        vars: {
          sessionId: initialSessionId,
          input: firstPrompt,
        },
      },
      // Test 2: Second request (tests session memory)
      {
        vars: {
          sessionId: initialSessionId,
          input: secondPrompt,
        },
        assert: neverGenerateRemote()
          ? []
          : [
              {
                type: 'llm-rubric' as const,
                value: dedent`
              You are evaluating whether a conversation system correctly maintains session state across multiple messages.

              In the first message, the user asked what the system can help with.
              In the second message, the user asked what was the last thing they asked.

              First Message: "${firstPrompt}"
              First Response: {{__outputs.0.output}}

              Second Message: "${secondPrompt}"
              Second Response: {{output}}

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
              },
            ],
      },
    ],
    defaultTest: {
      options: {
        provider: undefined, // Use default grading provider
      },
    },
  };
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
 * Formats config body for troubleshooting display
 */
function formatConfigBody({ body }: { body: any }): string {
  if (!body) {
    return 'None configured';
  }

  if (typeof body === 'string') {
    // Try to parse and pretty-print JSON strings
    try {
      const parsed = JSON.parse(body);
      return (
        '\n' +
        JSON.stringify(parsed, null, 2)
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')
      );
    } catch {
      // If not JSON, just indent it
      return '\n    ' + body;
    }
  }

  // If it's already an object, stringify it
  return (
    '\n' +
    JSON.stringify(body, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  );
}

/**
 * Formats config headers for troubleshooting display
 */
function formatConfigHeaders({ headers }: { headers: Record<string, any> | undefined }): string {
  if (!headers) {
    return 'None configured';
  }

  const headerLines = Object.entries(headers)
    .map(([key, value]) => `    ${key}: ${value}`)
    .join('\n');
  return `\n${headerLines}`;
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
 * Builds troubleshooting advice for client-side sessions
 */
function buildClientSessionTroubleshootingAdvice({
  providerConfig,
  initialSessionId,
}: {
  providerConfig: any;
  initialSessionId: string;
}): string {
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
  initialSessionId: string;
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

  return buildClientSessionTroubleshootingAdvice({ providerConfig, initialSessionId });
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
    const effectiveSessionSource = determineEffectiveSessionSource({ provider, sessionConfig });

    // Skip validation checks if requested (e.g., for CLI usage)
    if (!options?.skipConfigValidation) {
      const clientValidation = validateClientSessionConfig({
        provider,
        sessionSource: effectiveSessionSource,
      });
      if (!clientValidation.success) {
        return clientValidation.result;
      }

      const serverValidation = validateServerSessionConfig({
        provider,
        sessionSource: effectiveSessionSource,
        sessionConfig,
      });
      if (!serverValidation.success) {
        return serverValidation.result;
      }
    }

    updateProviderConfigWithSession({
      provider,
      sessionSource: effectiveSessionSource,
      sessionConfig,
    });

    const firstPrompt = 'What can you help me with?';
    const secondPrompt = 'What was the last thing I asked you?';
    const initialSessionId = uuidv4();

    // Creates a promptfooconfig test suite for the session test
    const testSuite = createSessionTestSuite({
      provider,
      firstPrompt,
      secondPrompt,
      initialSessionId,
    });

    // Create evaluation record
    const evalRecord = new Eval({});

    // Run evaluation
    logger.debug('[testProviderSession] Running evaluation', {
      providerId: provider.id,
      sessionSource: effectiveSessionSource,
    });

    await evaluate(testSuite, evalRecord, {
      maxConcurrency: 1, // Must be 1 for sequential tests
      showProgressBar: false,
    } as EvaluateOptions);

    // Get results
    const summary = await evalRecord.toEvaluateSummary();
    const firstResult = summary.results[0];
    const secondResult = summary.results[1];

    logger.debug('[testProviderSession] Evaluation completed', {
      firstResult: sanitizeObject(firstResult),
      secondResult: sanitizeObject(secondResult),
      providerId: provider.id,
    });

    // Extract session ID from evaluation results
    const sessionId =
      provider.getSessionId?.() ??
      secondResult.response?.sessionId ??
      firstResult.response?.sessionId ??
      initialSessionId;

    const serverExtraction = validateServerSessionExtraction({
      sessionSource: effectiveSessionSource,
      sessionId,
      firstPrompt,
      firstResult,
    });
    if (!serverExtraction.success) {
      return serverExtraction.result;
    }

    // Handle remote grading disabled
    if (neverGenerateRemote()) {
      return {
        success: false,
        message:
          'Session test completed. Remote grading is disabled - please examine the results yourself.',
        reason: 'Manual review required - remote grading is disabled',
        details: {
          sessionId: sessionId || 'Not extracted',
          sessionSource: effectiveSessionSource,
          request1: { prompt: firstPrompt, sessionId: initialSessionId },
          response1: firstResult.response?.output,
          request2: { prompt: secondPrompt, sessionId },
          response2: secondResult.response?.output,
        },
      };
    }

    const sessionWorking = secondResult.success;
    const judgeReason = secondResult.gradingResult?.reason || 'Session memory test completed';

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
      firstResult,
      secondResult,
    });

    return {
      success: sessionWorking,
      message: sessionWorking
        ? 'Session management is working correctly! The provider remembered information across requests.'
        : `Session is NOT working. The provider did not remember information from the first request. ${troubleshootingAdvice}`,
      reason: judgeReason,
      details: {
        sessionId: sessionId || 'Not extracted',
        sessionSource: effectiveSessionSource,
        request1: { prompt: firstPrompt, sessionId: initialSessionId },
        response1: firstResult.response?.output,
        request2: { prompt: secondPrompt, sessionId },
        response2: secondResult.response?.output,
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
