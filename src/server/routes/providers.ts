import dedent from 'dedent';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ZodError } from 'zod-validation-error';
import { fromZodError } from 'zod-validation-error';
import logger from '../../logger';
import type { HttpProviderConfig } from '../../providers/http';
import { HttpProvider, HttpProviderConfigSchema } from '../../providers/http';
import type { ProviderOptions, ProviderTestResponse } from '../../types/providers';
import invariant from '../../util/invariant';
import { ProviderOptionsSchema } from '../../validators/providers';

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

  let config: HttpProviderConfig;
  try {
    config = HttpProviderConfigSchema.parse(providerOptions.config);
  } catch (e) {
    res.status(400).json({ error: fromZodError(e as ZodError).toString() });
    return;
  }
  invariant(config.url, 'url is required');
  const loadedProvider = new HttpProvider(config.url, providerOptions);
  // Call the provider with the test prompt
  let result;
  try {
    result = await loadedProvider.callApi('Hello, world!', {
      debug: true,
      prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
      vars: {},
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
    res.status(500).json({ error: 'Failed to call provider API' });
    return;
  }

  const HOST = process.env.PROMPTFOO_CLOUD_API_URL || 'https://api.promptfoo.app';
  try {
    // Call the the agent helper to evaluate the results of the provider
    const testAnalyzerResponse = await fetch(`${HOST}/providers/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: providerOptions,
        providerResponse: result.raw,
        parsedResponse: result.output,
        error: result.error,
        headers: result.metadata?.headers,
      }),
    });
    if (!testAnalyzerResponse.ok) {
      res.status(200).json({
        testResult: {
          error:
            'Error evaluating the results of your configuration. Manually review the provider results below.',
        },
        providerResponse: result,
      } as ProviderTestResponse);
      return;
    }

    const testAnalyzerResponseObj = await testAnalyzerResponse.json();

    res
      .json({
        testResult: testAnalyzerResponseObj,
        providerResponse: result,
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
