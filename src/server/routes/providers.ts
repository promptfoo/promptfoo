import dedent from 'dedent';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fromZodError } from 'zod-validation-error';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { loadApiProvider } from '../../providers/index';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../redteam/commands/discover';
import { neverGenerateRemote } from '../../redteam/remoteGeneration';
import { fetchWithProxy } from '../../util/fetch';
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
        headers: result?.metadata?.headers,
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

    res
      .json({
        testResult: testAnalyzerResponseObj,
        providerResponse: {
          ...result,
          sessionId,
        },
        transformedRequest: result?.metadata?.transformedRequest,
      } as ProviderTestResponse)
      .status(200);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error(
      dedent`[POST /providers/test] Error calling agent helper
        error: ${errorMessage}
        providerOptions: ${JSON.stringify(providerOptions)}`,
    );
    res.status(200).json({
      test_result: {
        error:
          'Error evaluating the results of your configuration. Manually review the provider results below.',
      },
      provider_response: result,
    });
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

    // First request - establish session with test data
    const firstPrompt = 'Hello, please remember my name is TestUser';
    const vars: Record<string, string> = {};

    // Generate session ID for client-side sessions
    if (sessionConfig?.sessionSource === 'client') {
      vars['sessionId'] = uuidv4();
    }

    // Load provider and make first request
    const loadedProvider = await loadApiProvider(validatedProvider.id, {
      options: {
        ...validatedProvider,
        config: {
          ...validatedProvider.config,
          maxRetries: 1,
          sessionSource: sessionConfig?.sessionSource,
          sessionParser: sessionConfig?.sessionParser,
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
        response: ${JSON.stringify(firstResult?.output).substring(0, 200)}`,
    );

    // Get session ID (either from provider or from vars)
    const sessionId = loadedProvider.getSessionId?.() ?? vars.sessionId ?? undefined;

    // Update vars with session ID for second request
    if (sessionId) {
      vars['sessionId'] = sessionId;
    }

    // Second request - verify session persistence
    const secondPrompt = 'What is my name?';
    const secondResult = await loadedProvider.callApi(secondPrompt, {
      debug: true,
      prompt: { raw: secondPrompt, label: secondPrompt },
      vars,
    });

    logger.debug(
      dedent`[POST /providers/test-session] Second request completed
        prompt: ${secondPrompt}
        sessionId: ${sessionId}
        response: ${JSON.stringify(secondResult?.output).substring(0, 200)}`,
    );

    // Check if the second response indicates session persistence
    const responseText = (secondResult?.output || '').toString().toLowerCase();

    // More strict checking - the response should explicitly mention the name from the first request
    // and NOT say things like "I don't have access" or "I don't know"
    const sessionWorking =
      (responseText.includes('testuser') || responseText.includes('test user')) &&
      !responseText.includes("don't have access") &&
      !responseText.includes("don't know") &&
      !responseText.includes('cannot remember') &&
      !responseText.includes('no information') &&
      !responseText.includes('not sure') &&
      !responseText.includes('please tell me') &&
      !responseText.includes('what is your name') &&
      !responseText.includes('could you tell me');

    // Also check if it's explicitly stating the name in a positive way
    const explicitlyStatesName =
      responseText.includes('your name is testuser') ||
      responseText.includes('you are testuser') ||
      responseText.includes('you told me your name is testuser') ||
      responseText.includes('you said your name is testuser') ||
      responseText.includes('you mentioned your name is testuser') ||
      responseText.includes('name is testuser') ||
      responseText.includes('testuser, ');

    const finalSessionWorking = sessionWorking || explicitlyStatesName;

    res.json({
      success: finalSessionWorking,
      message: finalSessionWorking
        ? 'Session management is working correctly! The target remembered information across requests.'
        : 'Session is NOT working. The target did not remember information from the first request. Check that your session configuration is correct and that your target properly maintains conversation state.',
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
