import dedent from 'dedent';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ZodError } from 'zod-validation-error';
import { fromZodError } from 'zod-validation-error';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { loadApiProvider } from '../../providers';
import { hasGoogleDefaultCredentials } from '../../providers/google/util';
import {
  doTargetPurposeDiscovery,
  type TargetPurposeDiscoveryResult,
} from '../../redteam/commands/discover';
import { neverGenerateRemote } from '../../redteam/remoteGeneration';
import type { ProviderOptions, ProviderTestResponse } from '../../types/providers';
import invariant from '../../util/invariant';
import { ProviderOptionsSchema } from '../../validators/providers';

export const providersRouter = Router();

// GET /api/providers/available - Check which providers have available credentials
providersRouter.get('/available', async (req: Request, res: Response): Promise<void> => {
  try {
    // Check for various API keys following the pattern from defaults.ts
    const hasOpenAI = Boolean(getEnvString('OPENAI_API_KEY'));
    const hasAnthropic = Boolean(getEnvString('ANTHROPIC_API_KEY'));
    const hasMistral = Boolean(getEnvString('MISTRAL_API_KEY'));

    // Check for Azure credentials
    const hasAzureApiKey = Boolean(
      getEnvString('AZURE_OPENAI_API_KEY') || getEnvString('AZURE_API_KEY'),
    );
    const hasAzureClientCreds = Boolean(
      getEnvString('AZURE_CLIENT_ID') &&
        getEnvString('AZURE_CLIENT_SECRET') &&
        getEnvString('AZURE_TENANT_ID'),
    );
    const hasAzure = Boolean(
      (hasAzureApiKey || hasAzureClientCreds) &&
        (getEnvString('AZURE_DEPLOYMENT_NAME') || getEnvString('AZURE_OPENAI_DEPLOYMENT_NAME')),
    );

    // Check for AWS credentials (these are standard AWS SDK env vars)
    const hasAWS = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    // Check for Google credentials
    // Check for Google credentials
    const hasGoogleAppCreds = await hasGoogleDefaultCredentials();
    const hasGoogle = hasGoogleAppCreds || Boolean(process.env.GOOGLE_API_KEY);

    res.json({
      openai: hasOpenAI,
      anthropic: hasAnthropic,
      google: hasGoogle,
      aws: hasAWS,
      azure: hasAzure,
      mistral: hasMistral,
    });
  } catch (error) {
    logger.error(
      `Error checking available providers: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(500).json({ error: 'Failed to check available providers' });
  }
});

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

  const loadedProvider = await loadApiProvider(providerOptions.id, { options: providerOptions });
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
    res.status(500).json({ error: 'Failed to call provider API' });
    return;
  }

  const sessionId = loadedProvider.getSessionId?.() ?? vars.sessionId ?? undefined;

  const HOST = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');
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
