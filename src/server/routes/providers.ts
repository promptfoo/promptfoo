import dedent from 'dedent';
import { Router } from 'express';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { createTransformRequest, createTransformResponse } from '../../providers/httpTransforms';
import { loadApiProvider } from '../../providers/index';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../redteam/commands/discover';
import { neverGenerateRemote } from '../../redteam/remoteGeneration';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { ProviderOptionsSchema } from '../../validators/providers';
import { testHTTPProviderConnectivity, testProviderSession } from '../../validators/testProvider';
import type { Request, Response } from 'express';
import type { ZodError } from 'zod-validation-error';

import type { ProviderOptions, ProviderTestResponse } from '../../types/providers';

export const providersRouter = Router();

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

providersRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  let payload: z.infer<typeof TestPayloadSchema>;

  try {
    payload = TestPayloadSchema.parse(req.body);
  } catch (e) {
    res.status(400).json({ error: fromZodError(e as ZodError).toString() });
    return;
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

  // Use refactored function with optional prompt
  const result = await testHTTPProviderConnectivity(loadedProvider, payload.prompt);

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

// Test request transform endpoint
providersRouter.post(
  '/test-request-transform',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { transformCode, prompt } = TestRequestTransformSchema.parse(req.body);

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

      // Return the result even if it's an empty string or other falsy value
      // as it might be intentional
      res.json({
        success: true,
        result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: fromZodError(error).toString(),
        });
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[POST /providers/test-request-transform] Error: ${errorMessage}`);
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
    try {
      const { transformCode, response: responseText } = TestResponseTransformSchema.parse(req.body);

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

      // Check if result is empty/null/undefined
      // The result is always a ProviderResponse object with an 'output' field
      const output = result?.output ?? result?.raw ?? result;

      // Check if both output and raw are empty
      if (output === null || output === undefined || output === '') {
        res.json({
          success: false,
          error:
            'Transform returned empty result. Ensure that your sample response is correct, and check your extraction path or transform function are returning a valid result.',
          result: JSON.stringify(output),
        });
        return;
      }

      // If output is empty but raw has content, still return it as success
      // This handles cases where the result isn't a string but is still valid
      res.json({
        success: true,
        result: output,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: fromZodError(error).toString(),
        });
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[POST /providers/test-response-transform] Error: ${errorMessage}`);
      res.status(200).json({
        success: false,
        error: errorMessage,
      });
    }
  },
);

// Test multi-turn session functionality
providersRouter.post('/test-session', async (req: Request, res: Response): Promise<void> => {
  const body = req.body;
  const { provider: providerOptions, sessionConfig } = body;

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

    // Use refactored function
    const result = await testProviderSession(loadedProvider, sessionConfig);

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
