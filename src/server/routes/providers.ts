import dedent from 'dedent';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fromZodError } from 'zod-validation-error';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { loadApiProvider } from '../../providers';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../redteam/commands/discover';
import { neverGenerateRemote } from '../../redteam/remoteGeneration';
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
    const testAnalyzerResponse = await fetch(`${HOST}/api/v1/providers/test`, {
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

providersRouter.post('/test-strategy', async (req: Request, res: Response): Promise<void> => {
  const { provider: providerOptions, strategyId } = req.body;

  // Validate inputs
  if (!providerOptions || !strategyId) {
    res.status(400).json({ error: 'Provider configuration and strategy ID are required' });
    return;
  }

  try {
    // Parse provider options
    const parsedProviderOptions = ProviderOptionsSchema.parse(providerOptions);
    invariant(parsedProviderOptions.id, 'Provider ID is required');

    // Load the provider
    const loadedProvider = await loadApiProvider(parsedProviderOptions.id, {
      options: {
        ...parsedProviderOptions,
        config: {
          ...parsedProviderOptions.config,
          maxRetries: 1,
        },
      },
    });

    // Prepare test data based on strategy type
    let testPrompt = 'Hello, how can I help you today?';
    let testVars: Record<string, any> = {};

    // Check if it's a multi-modal strategy and adjust the test accordingly
    const multiModalStrategies = ['audio', 'image', 'video'];
    if (multiModalStrategies.includes(strategyId)) {
      // For multi-modal strategies, we'll send a test with appropriate content type
      if (strategyId === 'image') {
        // Small transparent 1x1 PNG for testing
        const testImageBase64 =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        testPrompt = 'Can you analyze this image?';
        testVars = {
          image: `data:image/png;base64,${testImageBase64}`,
        };
      } else if (strategyId === 'audio') {
        // Small silent WAV for testing
        testPrompt = 'Can you transcribe this audio?';
        testVars = {
          audio:
            'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        };
      } else if (strategyId === 'video') {
        testPrompt = 'Can you describe this video?';
        testVars = {
          video:
            'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAA=',
        };
      }
    }

    // Call the provider with the test prompt
    const result = await loadedProvider.callApi(testPrompt, {
      debug: true,
      prompt: { raw: testPrompt, label: 'Strategy Test' },
      vars: testVars,
    });

    // Check if the provider supports the strategy
    let supportsStrategy = true;
    let message = `Provider appears to support ${strategyId} strategy`;
    const suggestions: string[] = [];

    if (result.error) {
      supportsStrategy = false;
      message = `Provider may not support ${strategyId} strategy: ${result.error}`;

      // Provide specific suggestions based on the strategy and error
      if (multiModalStrategies.includes(strategyId)) {
        suggestions.push(
          'Ensure your provider supports multi-modal inputs',
          'Check that your API endpoint accepts image/audio/video data',
          'Verify your provider model version supports multi-modal features',
        );

        // Provider-specific suggestions
        if (parsedProviderOptions.id === 'openai') {
          suggestions.push(
            'For OpenAI, use models like gpt-4-vision-preview or gpt-4o for image support',
          );
        } else if (parsedProviderOptions.id === 'anthropic') {
          suggestions.push(
            'For Anthropic, use Claude 3 models (Opus, Sonnet, Haiku) for multi-modal support',
          );
        } else if (parsedProviderOptions.id === 'google') {
          suggestions.push(
            'For Google, use Gemini Pro Vision or later models for multi-modal support',
          );
        }
      }
    }

    res.json({
      success: supportsStrategy,
      message,
      suggestions,
      strategyId,
      providerResponse: result,
    });
  } catch (error) {
    logger.error(
      `Error testing strategy: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to test strategy',
      strategyId,
    });
  }
});
