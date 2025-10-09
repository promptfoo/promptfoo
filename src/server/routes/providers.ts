import dedent from 'dedent';
import { Router } from 'express';
import { fromZodError } from 'zod-validation-error';
import { getEnvString } from '../../envars';
import logger from '../../logger';
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
        maxRetries: 1,
      },
    },
  });

  // Use refactored function
  const result = await testHTTPProviderConnectivity(loadedProvider);

  res.status(200).json({
    testResult: {
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
