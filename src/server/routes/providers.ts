import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ZodError } from 'zod-validation-error';
import { fromZodError } from 'zod-validation-error';
import logger from '../../logger';
import type { HttpProviderConfig } from '../../providers/http';
import { HttpProvider, HttpProviderConfigSchema } from '../../providers/http';
import type { ProviderOptions } from '../../types/providers';
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
  const result = await loadedProvider.callApi('Hello, world!', {
    debug: true,
    prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
    vars: {},
  });
  logger.debug(
    `[POST /providers/test] result from API provider ${JSON.stringify({ result, providerOptions })}`,
  );

  const HOST = process.env.PROMPTFOO_CLOUD_API_URL || 'https://api.promptfoo.app';
  try {
    // Call the the agent helper to evaluate the results of the provider
    const response = await fetch(`${HOST}/providers/test`, {
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
    if (!response.ok) {
      res.status(200).json({
        test_result: {
          error:
            'Error evaluating the results of your configuration. Manually review the provider results below.',
        },
        provider_response: result,
      });
      return;
    }

    const data = await response.json();

    res.json({ test_result: data, provider_response: result }).status(200);
  } catch (e) {
    logger.error('[POST /providers/test] Error calling agent helper', e);
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
