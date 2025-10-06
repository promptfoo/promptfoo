import dedent from 'dedent';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fromZodError } from 'zod-validation-error';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { matchesLlmRubric } from '../../matchers';
import { loadApiProvider } from '../../providers/index';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../redteam/commands/discover';
import { neverGenerateRemote } from '../../redteam/remoteGeneration';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { ProviderOptionsSchema } from '../../validators/providers';
import type { Request, Response } from 'express';
import type { ZodError } from 'zod-validation-error';

import type { ProviderOptions, ProviderTestResponse } from '../../types/providers';

export const providersRouter = Router();

providersRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  const body = req.body;
  let providerOptions: ProviderOptions;
  try {
    providerOptions = ProviderOptionsSchema.parse(body);
  } catch (e) {
    res.status(400).json({ error: fromZodError(e as ZodError).toString() });
    return;
  }
  invariant(providerOptions.id, 'id is required');

  const loadedProvider = await loadApiProvider(providerOptions.id, {
    options: {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        // Since this is just a test, we don't want to retry the request automatically.
        maxRetries: 1,
      },
    },
  });
  // Call the provider with the test prompt
  let result;
  const vars: Record<string, string> = {};

  // Client-generated Session ID:
  if (providerOptions.config?.sessionSource === 'client') {
    vars['sessionId'] = uuidv4();
  }

  try {
    result = await loadedProvider.callApi('Hello, world!', {
      debug: true,
      prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
      vars,
    });
    logger.debug(
      dedent`[POST /providers/test] result from API provider
        result: ${JSON.stringify(result)}
        providerOptions: ${JSON.stringify(providerOptions)}`,
    );
  } catch (error) {
    logger.error(
      dedent`[POST /providers/test] Error calling provider API
        error: ${error instanceof Error ? error.message : String(error)}
        providerOptions: ${JSON.stringify(providerOptions)}`,
    );
    result = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const sessionId = loadedProvider.getSessionId?.() ?? vars.sessionId ?? undefined;

  const HOST = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');
  try {
    // Call the the agent helper to evaluate the results of the provider
    logger.debug(
      dedent`[POST /providers/test] Calling agent helper
        result: ${JSON.stringify(result)}
        providerOptions: ${JSON.stringify(providerOptions)}`,
    );
    const testAnalyzerResponse = await fetchWithProxy(`${HOST}/api/v1/providers/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: providerOptions,
        providerResponse: result?.raw,
        parsedResponse: result?.output,
        error: result?.error,
        headers: result?.metadata?.http?.headers,
      }),
    });

    if (!testAnalyzerResponse.ok) {
      logger.error(
        dedent`[POST /providers/test] Error calling agent helper
          error: ${testAnalyzerResponse.statusText}
          providerOptions: ${JSON.stringify(providerOptions)}`,
      );
      res.status(200).json({
        testResult: {
          error:
            'Error evaluating the results of your configuration. Manually review the provider results below.',
        },
        providerResponse: {
          ...result,
          sessionId,
        },
        transformedRequest: result?.metadata?.transformedRequest,
      } as ProviderTestResponse);
      return;
    }

    const testAnalyzerResponseObj = await testAnalyzerResponse.json();

    res.status(200).json({
      testResult: testAnalyzerResponseObj,
      providerResponse: {
        ...result,
        sessionId,
      },
      transformedRequest: result?.metadata?.transformedRequest,
    } as ProviderTestResponse);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error(
      dedent`[POST /providers/test] Error calling agent helper
        error: ${errorMessage}
        providerOptions: ${JSON.stringify(providerOptions)}`,
    );
    res.status(200).json({
      testResult: {
        error:
          'Error evaluating the results of your configuration. Manually review the provider results below.',
      },
      providerResponse: result,
      transformedRequest: result?.metadata?.transformedRequest,
    } as ProviderTestResponse);
    return;
  }
});

providersRouter.post(
  '/discover',
  async (
    req: Request,
    res: Response<TargetPurposeDiscoveryResult | { error: string }>,
  ): Promise<void> => {
    const body = req.body;
    let providerOptions: ProviderOptions;
    try {
      providerOptions = ProviderOptionsSchema.parse(body);
    } catch (e) {
      res.status(400).json({ error: fromZodError(e as ZodError).toString() });
      return;
    }
    invariant(providerOptions.id, 'Provider ID (`id`) is required');

    // Check that remote generation is enabled:
    if (neverGenerateRemote()) {
      res.status(400).json({ error: 'Requires remote generation be enabled.' });
      return;
    }

    try {
      const loadedProvider = await loadApiProvider(providerOptions.id, {
        options: providerOptions,
      });
      const result = await doTargetPurposeDiscovery(loadedProvider, undefined, false);

      if (result) {
        res.json(result);
      } else {
        res.status(500).json({ error: "Discovery failed to discover the target's purpose." });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const serializedError = dedent`
        [POST /providers/discover] Error calling target purpose discovery
        error: ${errorMessage}
        providerOptions: ${JSON.stringify(providerOptions)}`;
      logger.error(serializedError);
      res.status(500).json({ error: serializedError });
      return;
    }
  },
);

providersRouter.post('/http-generator', async (req: Request, res: Response): Promise<void> => {
  const { requestExample, responseExample } = req.body;

  if (!requestExample) {
    res.status(400).json({ error: 'Request example is required' });
    return;
  }

  const HOST = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');

  try {
    logger.debug(
      dedent`[POST /providers/http-generator] Calling HTTP provider generator API
        requestExample: ${requestExample?.substring(0, 200)}
        hasResponseExample: ${!!responseExample}`,
    );

    const response = await fetchWithProxy(`${HOST}/api/v1/http-provider-generator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestExample,
        responseExample,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        dedent`[POST /providers/http-generator] Error from cloud API
          status: ${response.status}
          error: ${errorText}`,
      );
      res.status(response.status).json({
        error: `HTTP error! status: ${response.status}`,
        details: errorText,
      });
      return;
    }

    const data = await response.json();
    logger.debug('[POST /providers/http-generator] Successfully generated config');
    res.status(200).json(data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      dedent`[POST /providers/http-generator] Error calling HTTP provider generator
        error: ${errorMessage}`,
    );
    res.status(500).json({
      error: 'Failed to generate HTTP configuration',
      details: errorMessage,
    });
  }
});

// Test multi-turn session functionality
providersRouter.post('/test-session', async (req: Request, res: Response): Promise<void> => {
  const body = req.body;
  const { provider: providerOptions, sessionConfig } = body;

  try {
    // Validate provider options
    const validatedProvider = ProviderOptionsSchema.parse(providerOptions);
    invariant(validatedProvider.id, 'Provider ID is required');

    // Validate session configuration based on source
    const effectiveSessionSource =
      sessionConfig?.sessionSource || validatedProvider.config?.sessionSource || 'server';

    // Check client-side session configuration
    if (effectiveSessionSource === 'client') {
      const configStr = JSON.stringify(validatedProvider);
      const hasSessionIdTemplate = configStr.includes('{{sessionId}}');

      if (!hasSessionIdTemplate) {
        logger.warn(
          dedent`[POST /providers/test-session] Warning: Session source is set to 'client' but {{sessionId}} is not found in the provider configuration.
            Make sure to include {{sessionId}} in your headers or body to properly maintain session state.`,
        );

        res.status(400).json({
          success: false,
          message:
            'Session configuration error: {{sessionId}} variable is not used in the provider configuration',
          error:
            'When using client-side sessions, you must include {{sessionId}} in your request headers or body. For example, add a header like "X-Session-Id: {{sessionId}}" or include it in your request body.',
          details: {
            sessionSource: effectiveSessionSource,
            hasSessionIdTemplate: false,
          },
        });
        return;
      }
    }

    // Check server-side session configuration
    if (effectiveSessionSource === 'server') {
      const sessionParser = sessionConfig?.sessionParser || validatedProvider.config?.sessionParser;

      if (!sessionParser || sessionParser.trim() === '') {
        logger.warn(
          dedent`[POST /providers/test-session] Warning: Session source is set to 'server' but no session parser is configured.
            A session parser is required to extract the session ID from server responses.`,
        );

        res.status(400).json({
          success: false,
          message:
            'Session configuration error: No session parser configured for server-generated sessions',
          error:
            'When using server-side sessions, you must configure a session parser to extract the session ID from the server response.',
          details: {
            sessionSource: effectiveSessionSource,
            hasSessionParser: false,
          },
        });
        return;
      }
    }

    // First request - establish session with test data
    const firstPrompt = 'What can you help me with?';
    const vars: Record<string, string> = {};

    // Generate session ID for client-side sessions
    if (effectiveSessionSource === 'client') {
      vars['sessionId'] = uuidv4();
    }

    // Load provider and make first request
    const loadedProvider = await loadApiProvider(validatedProvider.id, {
      options: {
        ...validatedProvider,
        config: {
          ...validatedProvider.config,
          maxRetries: 1,
          sessionSource: effectiveSessionSource,
          sessionParser: sessionConfig?.sessionParser || validatedProvider.config?.sessionParser,
        },
      },
    });

    const firstResult = await loadedProvider.callApi(firstPrompt, {
      debug: true,
      prompt: { raw: firstPrompt, label: firstPrompt },
      vars,
    });

    logger.debug(
      dedent`[POST /providers/test-session] First request completed
        prompt: ${firstPrompt}
        sessionId: ${vars.sessionId || 'server-generated'}
        response: ${JSON.stringify(firstResult?.output ?? {}).substring(0, 200)}`,
    );

    // Get session ID (either from provider or from vars)
    const sessionId = loadedProvider.getSessionId?.() ?? vars.sessionId ?? undefined;

    // Validate that server-generated session was extracted
    if (effectiveSessionSource === 'server' && (!sessionId || sessionId.trim() === '')) {
      const sessionParser = sessionConfig?.sessionParser || validatedProvider.config?.sessionParser;
      logger.error(
        dedent`[POST /providers/test-session] Failed to extract session ID from server response
          sessionParser: ${sessionParser}
          firstResult: ${JSON.stringify(firstResult?.metadata?.http || {}).substring(0, 500)}`,
      );

      res.status(200).json({
        success: false,
        message:
          'Session extraction failed: The session parser did not extract a session ID from the server response',
        reason:
          "The session parser expression did not return a valid session ID. Check that the parser matches your server's response format.",
        details: {
          sessionSource: effectiveSessionSource,
          sessionParser: sessionParser,
          sessionId: 'Not extracted',
          request1: {
            prompt: firstPrompt,
          },
          response1: firstResult?.output,
        },
      });
      return;
    }

    // Update vars with session ID for second request
    if (sessionId) {
      vars['sessionId'] = sessionId;
    }

    // Second request - verify session persistence
    const secondPrompt = 'What was the last thing I asked you?';
    const secondResult = await loadedProvider.callApi(secondPrompt, {
      debug: true,
      prompt: { raw: secondPrompt, label: secondPrompt },
      vars,
    });

    logger.debug(
      dedent`[POST /providers/test-session] Second request completed
        prompt: ${secondPrompt}
        sessionId: ${sessionId}
        response: ${JSON.stringify(secondResult?.output ?? {}).substring(0, 200)}`,
    );

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

    logger.debug(
      dedent`[POST /providers/test-session] Judge result
        pass: ${judgeResult.pass}
        reason: ${judgeResult.reason}`,
    );

    const sessionWorking = judgeResult.pass;
    const judgeReason = judgeResult.reason;

    // Use LLM as a judge to evaluate session persistence
    if (neverGenerateRemote() || !judgeResult.reason) {
      // Remote grading is disabled, user should examine results manually
      res.status(200).json({
        success: false,
        message:
          'Session test completed. Remote grading is disabled - please examine the results yourself.',
        reason: 'Manual review required - remote grading is disabled',
        details: {
          sessionId: sessionId || 'Not extracted',
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
      });
      return;
    } else {
      res.json({
        success: sessionWorking,
        message: sessionWorking
          ? 'Session management is working correctly! The target remembered information across requests.'
          : 'Session is NOT working. The target did not remember information from the first request. Check that your session configuration is correct and that your target properly maintains conversation state.',
        reason: judgeReason,
        details: {
          sessionId: sessionId || 'Not extracted',
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
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      dedent`[POST /providers/test-session] Error testing session
        error: ${errorMessage}
        providerOptions: ${JSON.stringify(providerOptions)}`,
    );
    res.status(500).json({
      success: false,
      message: `Failed to test session: ${errorMessage}`,
      error: errorMessage,
    });
  }
});
