/**
 * Provider management routes for the local web UI.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { defaultProviders } from '../../../constants/defaultProviders';
import { getEnvString } from '../../../envars';
import logger from '../../../logger';
import { createTransformRequest, createTransformResponse } from '../../../providers/httpTransforms';
import { loadApiProvider } from '../../../providers/index';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../../redteam/commands/discover';
import { neverGenerateRemote } from '../../../redteam/remoteGeneration';
import { fetchWithProxy } from '../../../util/fetch/index';
import invariant from '../../../util/invariant';
import { ProviderOptionsSchema } from '../../../validators/providers';
import { testProviderConnectivity, testProviderSession } from '../../../validators/testProvider';
import { getAvailableProviders } from '../../config/serverConfig';

import type { ProviderOptions, ProviderTestResponse } from '../../../types/providers';

export const providersRouter = new Hono();

// Validation schemas
const TestRequestTransformSchema = z.object({
  transformCode: z.string().optional(),
  prompt: z.string(),
});

const TestResponseTransformSchema = z.object({
  transformCode: z.string().optional(),
  response: z.string(),
});

const TestPayloadSchema = z.object({
  prompt: z.string().optional(),
  providerOptions: ProviderOptionsSchema,
});

/**
 * GET /api/providers
 *
 * Returns the list of providers available in the eval creator UI.
 * If ui-providers.yaml exists in .promptfoo directory, returns those providers.
 * Otherwise returns the default list of ~600 providers.
 */
providersRouter.get('/', (c) => {
  try {
    const serverProviders = getAvailableProviders();

    // If server has custom providers, use those; otherwise use defaults
    const providers = serverProviders.length > 0 ? serverProviders : defaultProviders;
    const hasCustomConfig = serverProviders.length > 0;

    return c.json({
      success: true,
      data: { providers, hasCustomConfig },
    });
  } catch (error) {
    logger.error('[GET /api/providers] Error loading providers', { error });
    return c.json(
      {
        success: false,
        error: 'Failed to load providers',
      },
      500,
    );
  }
});

/**
 * GET /api/providers/config-status
 *
 * Returns whether a custom provider configuration exists.
 */
providersRouter.get('/config-status', (c) => {
  try {
    const serverProviders = getAvailableProviders();
    const hasCustomConfig = serverProviders.length > 0;

    return c.json({
      success: true,
      data: { hasCustomConfig },
    });
  } catch (error) {
    logger.error('[GET /api/providers/config-status] Error loading config status', { error });
    return c.json(
      {
        success: false,
        error: 'Failed to load provider config status',
      },
      500,
    );
  }
});

/**
 * POST /api/providers/test
 *
 * Test provider connectivity.
 */
providersRouter.post('/test', async (c) => {
  let payload: z.infer<typeof TestPayloadSchema>;

  try {
    const body = await c.req.json();
    payload = TestPayloadSchema.parse(body);
  } catch (e) {
    return c.json({ error: z.prettifyError(e as z.ZodError) }, 400);
  }

  const providerOptions = payload.providerOptions as ProviderOptions;

  invariant(payload.providerOptions.id, 'id is required');

  const loadedProvider = await loadApiProvider(providerOptions.id!, {
    options: {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        maxRetries: 1,
      },
    },
  });

  const result = await testProviderConnectivity({
    provider: loadedProvider,
    prompt: payload.prompt,
    inputs: providerOptions.inputs || providerOptions.config?.inputs,
  });

  return c.json({
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

/**
 * POST /api/providers/discover
 *
 * Discover target purpose.
 */
providersRouter.post('/discover', async (c) => {
  const body = await c.req.json();
  let providerOptions: ProviderOptions;
  try {
    providerOptions = ProviderOptionsSchema.parse(body);
  } catch (e) {
    return c.json({ error: z.prettifyError(e as z.ZodError) }, 400);
  }
  invariant(providerOptions.id, 'Provider ID (`id`) is required');

  if (neverGenerateRemote()) {
    return c.json({ error: 'Requires remote generation be enabled.' }, 400);
  }

  try {
    const loadedProvider = await loadApiProvider(providerOptions.id, {
      options: providerOptions,
    });
    const result = await doTargetPurposeDiscovery(loadedProvider, undefined, false);

    if (result) {
      return c.json(result as TargetPurposeDiscoveryResult);
    } else {
      return c.json({ error: "Discovery failed to discover the target's purpose." }, 500);
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error('Error calling target purpose discovery', {
      error: e,
      providerOptions,
    });
    return c.json({ error: `Discovery failed: ${errorMessage}` }, 500);
  }
});

/**
 * POST /api/providers/http-generator
 *
 * Generate HTTP provider configuration.
 */
providersRouter.post('/http-generator', async (c) => {
  const { requestExample, responseExample } = await c.req.json();

  if (!requestExample) {
    return c.json({ error: 'Request example is required' }, 400);
  }

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
      return c.json(
        {
          error: `HTTP error! status: ${response.status}`,
          details: errorText,
        },
        response.status as Parameters<typeof c.json>[1],
      );
    }

    const data = await response.json();
    logger.debug('[POST /providers/http-generator] Successfully generated config');
    return c.json(data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[POST /providers/http-generator] Error calling HTTP provider generator', {
      error,
    });
    return c.json(
      {
        error: 'Failed to generate HTTP configuration',
        details: errorMessage,
      },
      500,
    );
  }
});

/**
 * POST /api/providers/test-request-transform
 *
 * Test request transform.
 */
providersRouter.post('/test-request-transform', async (c) => {
  try {
    const body = await c.req.json();
    const { transformCode, prompt } = TestRequestTransformSchema.parse(body);

    const normalizedTransformCode =
      transformCode && transformCode.trim() ? transformCode : undefined;

    const transformFn = await createTransformRequest(normalizedTransformCode);
    const result = await transformFn(
      prompt,
      {},
      { prompt: { raw: prompt, label: prompt }, vars: {} },
    );

    if (result === null || result === undefined) {
      return c.json({
        success: false,
        error:
          'Transform returned null or undefined. Check your transform function. Did you forget to `return` the result?',
      });
    }

    return c.json({
      success: true,
      result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: z.prettifyError(error),
        },
        400,
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[POST /providers/test-request-transform] Error', {
      error,
    });
    return c.json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/providers/test-response-transform
 *
 * Test response transform.
 */
providersRouter.post('/test-response-transform', async (c) => {
  try {
    const body = await c.req.json();
    const { transformCode, response: responseText } = TestResponseTransformSchema.parse(body);

    const normalizedTransformCode =
      transformCode && transformCode.trim() ? transformCode : undefined;

    let jsonData;
    try {
      jsonData = JSON.parse(responseText);
    } catch {
      jsonData = null;
    }

    const transformFn = await createTransformResponse(normalizedTransformCode);
    const result = transformFn(jsonData, responseText);

    const output = result?.output ?? result?.raw ?? result;

    if (output === null || output === undefined || output === '') {
      return c.json({
        success: false,
        error:
          'Transform returned empty result. Ensure that your sample response is correct, and check your extraction path or transform function are returning a valid result.',
        result: JSON.stringify(output),
      });
    }

    return c.json({
      success: true,
      result: output,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: z.prettifyError(error),
        },
        400,
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[POST /providers/test-response-transform] Error', {
      error,
    });
    return c.json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * POST /api/providers/test-session
 *
 * Test multi-turn session functionality.
 */
providersRouter.post('/test-session', async (c) => {
  const body = await c.req.json();
  const { provider: providerOptions, sessionConfig, mainInputVariable } = body;

  try {
    const validatedProvider = ProviderOptionsSchema.parse(providerOptions);
    invariant(validatedProvider.id, 'Provider ID is required');

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

    const result = await testProviderSession({
      provider: loadedProvider,
      sessionConfig,
      inputs: validatedProvider.inputs || validatedProvider.config?.inputs,
      mainInputVariable,
    });

    return c.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        success: false,
        message: `Failed to test session: ${errorMessage}`,
        error: errorMessage,
      },
      500,
    );
  }
});

export default providersRouter;
