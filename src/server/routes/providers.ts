import { Router } from 'express';
import { z } from 'zod';
import { defaultProviders } from '../../constants/defaultProviders';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { createTransformRequest, createTransformResponse } from '../../providers/httpTransforms';
import { loadApiProvider } from '../../providers/index';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../redteam/commands/discover';
import { neverGenerateRemote } from '../../redteam/remoteGeneration';
import { ProviderSchemas } from '../../types/api/providers';
import { fetchWithProxy } from '../../util/fetch/index';
import { testProviderConnectivity, testProviderSession } from '../../validators/testProvider';
import { getAvailableProviders } from '../config/serverConfig';
import type { Request, Response } from 'express';

import type { ProviderOptions, ProviderTestResponse } from '../../types/providers';

export const providersRouter = Router();

/**
 * GET /api/providers
 *
 * Returns the list of providers available in the eval creator UI.
 * If ui-providers.yaml exists in .promptfoo directory, returns those providers.
 * Otherwise returns the default list of ~600 providers.
 *
 * Response:
 * - providers: Array of provider options (can be string IDs or full config objects)
 * - hasCustomConfig: Boolean indicating if custom config exists
 */
providersRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const serverProviders = getAvailableProviders();

    // If server has custom providers, use those; otherwise use defaults
    const providers = serverProviders.length > 0 ? serverProviders : defaultProviders;
    const hasCustomConfig = serverProviders.length > 0;

    res.json({
      success: true,
      data: { providers, hasCustomConfig },
    });
  } catch (error) {
    logger.error('[GET /api/providers] Error loading providers', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to load providers',
    });
  }
});

/**
 * GET /api/providers/config-status
 *
 * Returns whether a custom provider configuration exists.
 * Used by redteam setup UI to determine whether to filter provider types.
 *
 * When custom config exists (hasCustomConfig: true), redteam setup restricts
 * provider types to: http, websocket, python, javascript for testing custom implementations.
 *
 * Response:
 * - hasCustomConfig: Boolean indicating if ui-providers.yaml exists with providers
 */
providersRouter.get('/config-status', (_req: Request, res: Response): void => {
  try {
    const serverProviders = getAvailableProviders();
    const hasCustomConfig = serverProviders.length > 0;

    res.json({
      success: true,
      data: { hasCustomConfig },
    });
  } catch (error) {
    logger.error('[GET /api/providers/config-status] Error loading config status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to load provider config status',
    });
  }
});

providersRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ProviderSchemas.Test.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { providerOptions } = bodyResult.data;

  const loadedProvider = await loadApiProvider(providerOptions.id, {
    options: {
      ...(providerOptions as ProviderOptions),
      config: {
        ...providerOptions.config,
        maxRetries: 1,
      },
    },
  });

  // Pass inputs explicitly from providerOptions since loaded provider may not expose config.inputs
  // Check both top-level inputs (from redteam UI) and config.inputs for backwards compatibility
  const result = await testProviderConnectivity({
    provider: loadedProvider,
    prompt: bodyResult.data.prompt,
    inputs: providerOptions.inputs || providerOptions.config?.inputs,
  });

  res.status(200).json({
    testResult: {
      success: result.success,
      message: result.message,
      error: result.error,
      changes_needed: result.analysis?.changes_needed,
      changes_needed_reason: result.analysis?.changes_needed_reason,
      changes_needed_suggestions: result.analysis?.changes_needed_suggestions,
    },
    providerResponse: result.providerResponse,
    transformedRequest: result.transformedRequest,
  } as ProviderTestResponse);
});

providersRouter.post(
  '/discover',
  async (
    req: Request,
    res: Response<TargetPurposeDiscoveryResult | { error: string }>,
  ): Promise<void> => {
    const bodyResult = ProviderSchemas.Discover.Request.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: z.prettifyError(bodyResult.error) });
      return;
    }
    const providerOptions = bodyResult.data;

    // Check that remote generation is enabled:
    if (neverGenerateRemote()) {
      res.status(400).json({ error: 'Requires remote generation be enabled.' });
      return;
    }

    try {
      const loadedProvider = await loadApiProvider(providerOptions.id, {
        options: providerOptions as ProviderOptions,
      });
      const result = await doTargetPurposeDiscovery(loadedProvider, undefined, false);

      if (result) {
        res.json(result);
      } else {
        res.status(500).json({ error: "Discovery failed to discover the target's purpose." });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error('Error calling target purpose discovery', {
        error: e,
        providerOptions,
      });
      res.status(500).json({ error: `Discovery failed: ${errorMessage}` });
      return;
    }
  },
);

providersRouter.post('/http-generator', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ProviderSchemas.HttpGenerator.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }
  const { requestExample, responseExample } = bodyResult.data;

  const HOST = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');

  try {
    logger.debug('[POST /providers/http-generator] Calling HTTP provider generator API', {
      requestExamplePreview: requestExample?.substring(0, 200),
      hasResponseExample: !!responseExample,
    });

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
      logger.error('[POST /providers/http-generator] Error from cloud API', {
        status: response.status,
        errorText,
      });
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
    logger.error('[POST /providers/http-generator] Error calling HTTP provider generator', {
      error,
    });
    res.status(500).json({
      error: 'Failed to generate HTTP configuration',
      details: errorMessage,
    });
  }
});

// Test request transform endpoint
providersRouter.post(
  '/test-request-transform',
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ProviderSchemas.TestRequestTransform.Request.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ success: false, error: z.prettifyError(bodyResult.error) });
      return;
    }
    const { transformCode, prompt } = bodyResult.data;

    try {
      // Treat empty string as undefined to show base behavior
      const normalizedTransformCode =
        transformCode && transformCode.trim() ? transformCode : undefined;

      // Use the actual HTTP provider's transform function
      const transformFn = await createTransformRequest(normalizedTransformCode);
      const result = await transformFn(
        prompt,
        {},
        { prompt: { raw: prompt, label: prompt }, vars: {} },
      );

      // Check if result is completely empty (no value at all)
      if (result === null || result === undefined) {
        res.json({
          success: false,
          error:
            'Transform returned null or undefined. Check your transform function. Did you forget to `return` the result?',
        });
        return;
      }

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[POST /providers/test-request-transform] Error', {
        error,
      });
      res.status(200).json({
        success: false,
        error: errorMessage,
      });
    }
  },
);

// Test response transform endpoint
providersRouter.post(
  '/test-response-transform',
  async (req: Request, res: Response): Promise<void> => {
    const bodyResult = ProviderSchemas.TestResponseTransform.Request.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ success: false, error: z.prettifyError(bodyResult.error) });
      return;
    }
    const { transformCode, response: responseText } = bodyResult.data;

    try {
      // Treat empty string as undefined to show base behavior
      const normalizedTransformCode =
        transformCode && transformCode.trim() ? transformCode : undefined;

      // Parse the response as JSON if possible
      let jsonData;
      try {
        jsonData = JSON.parse(responseText);
      } catch {
        jsonData = null;
      }

      // Use the actual HTTP provider's transform function
      const transformFn = await createTransformResponse(normalizedTransformCode);
      const result = transformFn(jsonData, responseText);

      // The result is always a ProviderResponse object with an 'output' field
      const output = result?.output ?? result?.raw ?? result;

      if (output === null || output === undefined || output === '') {
        res.json({
          success: false,
          error:
            'Transform returned empty result. Ensure that your sample response is correct, and check your extraction path or transform function are returning a valid result.',
          result: JSON.stringify(output),
        });
        return;
      }

      res.json({
        success: true,
        result: output,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[POST /providers/test-response-transform] Error', {
        error,
      });
      res.status(200).json({
        success: false,
        error: errorMessage,
      });
    }
  },
);

// Test multi-turn session functionality
providersRouter.post('/test-session', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = ProviderSchemas.TestSession.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: z.prettifyError(bodyResult.error) });
    return;
  }
  const { provider: validatedProvider, sessionConfig, mainInputVariable } = bodyResult.data;

  try {
    const loadedProvider = await loadApiProvider(validatedProvider.id, {
      options: {
        ...validatedProvider,
        config: {
          ...validatedProvider.config,
          maxRetries: 1,
          sessionSource: sessionConfig?.sessionSource || validatedProvider.config?.sessionSource,
          sessionParser: sessionConfig?.sessionParser || validatedProvider.config?.sessionParser,
        },
      },
    });

    // Pass inputs from validatedProvider since loaded provider may not expose config.inputs
    // Check both top-level inputs (from redteam UI) and config.inputs for backwards compatibility
    const result = await testProviderSession({
      provider: loadedProvider,
      sessionConfig,
      inputs: validatedProvider.inputs || validatedProvider.config?.inputs,
      mainInputVariable,
    });

    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      message: `Failed to test session: ${errorMessage}`,
      error: errorMessage,
    });
  }
});
