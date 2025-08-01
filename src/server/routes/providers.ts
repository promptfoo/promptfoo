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
import { fetchWithRetries } from '../../util/fetch';
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
    const testAnalyzerResponse = await fetchWithRetries(
      `${HOST}/api/v1/providers/test`,
      {
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
      },
      60000, // 60 second timeout
    );

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
