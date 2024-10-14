import { Router } from 'express';
import logger from '../../logger';
import { loadApiProviders } from '../../providers';
import { HttpProvider } from '../../providers/http';
import { ProviderSchema } from '../../validators/providers';

export const providersRouter = Router();

providersRouter.post('/test', async (req, res) => {
  const body = req.body;

  let provider;
  try {
    provider = ProviderSchema.parse(body);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  // @ts-ignore
  const loadedProviders = await loadApiProviders([provider], { env: {}, basePath: '' });
  const loadedProvider = loadedProviders[0];
  if (!(loadedProvider instanceof HttpProvider)) {
    res.status(400).json({ error: 'Only http providers are supported for testing' });
    return;
  }

  const result = await loadedProvider.callApi('Hello, world!', {
    debug: true,
    prompt: { raw: 'Hello, world!', label: 'Hello, world!' },
    vars: {},
  });
  logger.debug(
    `[POST /providers/test] result from API provider ${JSON.stringify({ result, provider })}`,
  );

  const HOST = process.env.PROMPTFOO_CLOUD_API_URL || 'https://api.promptfoo.app';
  try {
    const response = await fetch(`${HOST}/providers/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'http-provider-setup',
        config: provider,
        providerResponse: result.raw,
        parsedResponse: result.output,
        error: result.error,
      }),
    });
    const data = await response.json();

    res.json({ test_result: data, provider_response: result }).status(200);
  } catch (e) {
    console.error('Error calling agent helper', e);
    res.status(500).json({ error: 'Error calling agent helper' });
    return;
  }
});
