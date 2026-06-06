import { Router } from 'express';
import { z } from 'zod';
import cliState from '../../cliState';
import logger from '../../logger';
import {
  deletePendingReconConfig,
  InvalidPendingReconError,
  isValidReconHandoffToken,
  readPendingReconConfig,
} from '../../redteam/commands/recon/pending';
import {
  DATASET_EXEMPT_PLUGINS,
  isMultiTurnStrategy,
  MULTI_INPUT_EXCLUDED_PLUGINS,
  type MultiTurnStrategy,
  REDTEAM_MODEL,
} from '../../redteam/constants';
import { PluginFactory, Plugins } from '../../redteam/plugins/index';
import { redteamProviderManager } from '../../redteam/providers/shared';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../redteam/remoteGeneration';
import { doRedteamRun } from '../../redteam/shared';
import { Strategies } from '../../redteam/strategies/index';
import { type Strategy as StrategyFactory } from '../../redteam/strategies/types';
import { TestCaseWithPlugin } from '../../types';
import { RedteamSchemas } from '../../types/api/redteam';
import { fetchWithProxy } from '../../util/fetch/index';
import { sanitizeObject } from '../../util/sanitizer';
import {
  type DeletePendingReconResponse,
  type GetPendingReconResponse,
  type ReconErrorResponse,
} from '../../validators/recon';
import { evalJobService } from '../services/evalJobService';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../services/redteamTestCaseGenerationService';
import { sendError } from '../utils/errors';
import type { Request, Response } from 'express';

export const redteamRouter = Router();
const INVALID_PENDING_RECON_MESSAGE =
  'Invalid pending recon configuration. Run `promptfoo redteam recon` again to regenerate.';

function isLocalhostRequest(req: Request): boolean {
  const remoteAddress = req.socket?.remoteAddress || req.ip || '';
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1' ||
    remoteAddress.startsWith('127.')
  );
}

function getReconHandoffToken(req: Request): string | undefined {
  return typeof req.query.token === 'string' ? req.query.token : undefined;
}

/**
 * Generates a test case for a given plugin/strategy combination.
 */
redteamRouter.post('/generate-test', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedBody = RedteamSchemas.GenerateTest.Request.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: z.prettifyError(parsedBody.error) });
      return;
    }

    const {
      plugin,
      strategy,
      config,
      turn,
      maxTurns,
      history,
      goal: goalOverride,
      stateful,
      count,
    } = parsedBody.data;

    const pluginConfigurationError = getPluginConfigurationError(plugin);
    if (pluginConfigurationError) {
      res.status(400).json({ error: pluginConfigurationError });
      return;
    }

    // In multi-input mode, some plugins don't support dynamic generation
    const hasMultiInput =
      plugin.config.inputs && Object.keys(plugin.config.inputs as object).length > 0;
    if (hasMultiInput) {
      const excludedPlugins = [...DATASET_EXEMPT_PLUGINS, ...MULTI_INPUT_EXCLUDED_PLUGINS];
      if (excludedPlugins.includes(plugin.id as (typeof excludedPlugins)[number])) {
        logger.debug(`Skipping plugin '${plugin.id}' - does not support multi-input mode`);
        res.json(RedteamSchemas.GenerateTest.Response.parse({ testCases: [], count: 0 }));
        return;
      }
    }

    // For multi-turn strategies, force count to 1 (each turn depends on previous response)
    const effectiveCount = isMultiTurnStrategy(strategy.id) ? 1 : count;

    logger.debug('Generating red team test case', { plugin, strategy, count: effectiveCount });

    // Find the plugin
    const pluginFactory = Plugins.find((p) => p.key === plugin.id) as PluginFactory;

    // TODO: Add support for this? Was previously misconfigured such that the no value would ever
    // be passed in as a configuration option.
    const injectVar = 'query';

    // Get the red team provider
    const redteamProvider = await redteamProviderManager.getProvider({ provider: REDTEAM_MODEL });

    const testCases = await pluginFactory.action({
      provider: redteamProvider,
      purpose: config.applicationDefinition.purpose ?? 'general AI assistant',
      injectVar,
      n: effectiveCount, // Generate requested number of test cases
      delayMs: 0,
      config: {
        ...plugin.config,
        language: plugin.config.language ?? 'en',
        __nonce: Math.floor(Math.random() * 1000000), // Use a nonce to prevent caching
      },
    });

    if (testCases.length === 0) {
      res.status(500).json({ error: 'Failed to generate test case' });
      return;
    }

    // Apply strategy to test case
    let finalTestCases = testCases;

    // Skip applying strategy if it's 'basic' as they don't transform test cases
    if (!['basic', 'default'].includes(strategy.id)) {
      try {
        const strategyFactory = Strategies.find((s) => s.id === strategy.id) as StrategyFactory;

        const strategyTestCases = await strategyFactory.action(
          testCases as TestCaseWithPlugin[],
          injectVar,
          strategy.config || {},
          strategy.id,
        );

        if (strategyTestCases && strategyTestCases.length > 0) {
          finalTestCases = strategyTestCases;
        }
      } catch (error) {
        logger.error(`Error applying strategy ${strategy.id}`, { error });
        res.status(500).json({
          error: `Failed to apply strategy ${strategy.id}`,
        });
        return;
      }
    }

    const context = `This test case targets the ${plugin.id} plugin with strategy ${strategy.id} and was generated based on your application context. If the test case is not relevant to your application, you can modify the application definition to improve relevance.`;
    const purpose = config.applicationDefinition.purpose ?? null;

    // Handle multi-turn strategies (always single test case)
    if (isMultiTurnStrategy(strategy.id)) {
      const testCase = finalTestCases[0];
      const generatedPrompt = extractGeneratedPrompt(testCase, injectVar);
      const baseMetadata =
        testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};
      const metadataForStrategy = {
        ...baseMetadata,
        strategyId: strategy.id,
      };

      try {
        const multiTurnResult = await generateMultiTurnPrompt({
          pluginId: plugin.id,
          strategyId: strategy.id as MultiTurnStrategy,
          strategyConfigRecord: strategy.config as Record<string, unknown>,
          history,
          turn,
          maxTurns,
          goalOverride,
          baseMetadata: metadataForStrategy,
          generatedPrompt,
          purpose,
          stateful,
        });

        res.json(
          RedteamSchemas.GenerateTest.Response.parse({
            prompt: multiTurnResult.prompt,
            context,
            metadata: multiTurnResult.metadata,
          }),
        );
        return;
      } catch (error) {
        if (error instanceof RemoteGenerationDisabledError) {
          res.status(400).json({ error: error.message });
          return;
        }

        logger.error('[Multi-turn] Error generating prompt', {
          message: error instanceof Error ? error.message : String(error),
          strategy: strategy.id,
        });
        res.status(500).json({
          error: 'Failed to generate multi-turn prompt',
        });
        return;
      }
    }

    // Handle batch response (count > 1)
    if (effectiveCount > 1) {
      const batchResults = finalTestCases.map((testCase) => {
        const prompt = extractGeneratedPrompt(testCase, injectVar);
        const metadata =
          testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};
        return { prompt, context, metadata };
      });

      res.json(
        RedteamSchemas.GenerateTest.Response.parse({
          testCases: batchResults,
          count: batchResults.length,
        }),
      );
      return;
    }

    // Handle single test case response (backward compatible)
    const testCase = finalTestCases[0];
    const generatedPrompt = extractGeneratedPrompt(testCase, injectVar);
    const baseMetadata =
      testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};

    res.json(
      RedteamSchemas.GenerateTest.Response.parse({
        prompt: generatedPrompt,
        context,
        metadata: baseMetadata,
      }),
    );
  } catch (error) {
    logger.error('Error generating test case', { error });
    res.status(500).json({
      error: 'Failed to generate test case',
    });
  }
});

// Track the current running job
let currentJobId: string | null = null;
let currentAbortController: AbortController | null = null;

redteamRouter.post('/run', async (req: Request, res: Response): Promise<void> => {
  const bodyResult = RedteamSchemas.Run.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ success: false, error: z.prettifyError(bodyResult.error) });
    return;
  }

  // If there's a current job running, abort it
  if (currentJobId) {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    evalJobService.fail(currentJobId, ['Job cancelled - new job started'], {
      append: true,
      resetResult: false,
    });
  }

  const { config, force, verbose, delay, maxConcurrency } = bodyResult.data;
  const id = crypto.randomUUID();
  currentJobId = id;
  currentAbortController = new AbortController();

  evalJobService.create(id);

  // Set web UI mode
  cliState.webUI = true;

  // Run redteam in background
  doRedteamRun({
    liveRedteamConfig: config,
    force,
    verbose,
    ...(delay === undefined ? {} : { delay }),
    ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
    logCallback: (message: string) => {
      if (currentJobId === id) {
        evalJobService.appendLog(id, message);
      }
    },
    abortSignal: currentAbortController.signal,
  })
    .then(async (evalResult) => {
      const summary = evalResult ? await evalResult.toEvaluateSummary() : null;
      if (currentJobId === id) {
        evalJobService.complete(id, summary, evalResult?.id ?? null);
      }
      if (currentJobId === id) {
        cliState.webUI = false;
        currentJobId = null;
        currentAbortController = null;
      }
    })
    .catch((error) => {
      logger.error(`Error running red team: ${error}\n${error.stack || ''}`);
      if (currentJobId === id) {
        evalJobService.fail(
          id,
          [`Error: ${error.message}`, ...(error.stack ? [`Stack trace: ${error.stack}`] : [])],
          { append: true, resetResult: false },
        );
      }
      if (currentJobId === id) {
        cliState.webUI = false;
        currentJobId = null;
        currentAbortController = null;
      }
    });

  res.json(RedteamSchemas.Run.Response.parse({ id }));
});

redteamRouter.post('/cancel', async (_req: Request, res: Response): Promise<void> => {
  if (!currentJobId) {
    res.status(400).json({ error: 'No job currently running' });
    return;
  }

  const jobId = currentJobId;

  if (currentAbortController) {
    currentAbortController.abort();
  }

  evalJobService.fail(jobId, ['Job cancelled by user'], {
    append: true,
    resetResult: false,
  });

  // Clear state
  cliState.webUI = false;
  currentJobId = null;
  currentAbortController = null;

  // Wait a moment to ensure cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));

  res.json(RedteamSchemas.Cancel.Response.parse({ message: 'Job cancelled' }));
});

/**
 * Proxies requests to Promptfoo Cloud to invoke tasks.
 *
 * This route is defined last such that it acts as a catch-all for tasks.
 *
 * TODO(out of scope for #6461): Prepend a /tasks prefix to route i.e. /task/:taskId to avoid conflicts w/ other routes.
 *
 * @param taskId - The ID of the task to invoke. Note that IDs must be defined in
 * Cloud's task registry (See server/src/routes/task.ts).
 */
redteamRouter.post('/:taskId', async (req: Request, res: Response): Promise<void> => {
  const paramsResult = RedteamSchemas.Task.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ success: false, error: z.prettifyError(paramsResult.error) });
    return;
  }
  const bodyResult = RedteamSchemas.Task.Request.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ success: false, error: z.prettifyError(bodyResult.error) });
    return;
  }

  const { taskId } = paramsResult.data;
  if (neverGenerateRemote()) {
    res.status(400).json({ success: false, error: 'Requires remote generation be enabled.' });
    return;
  }

  const cloudFunctionUrl = getRemoteGenerationUrl();
  logger.debug(`Received ${taskId} task request`, {
    method: req.method,
    url: req.url,
    body: sanitizeObject(bodyResult.data, { context: 'request body' }),
  });

  try {
    logger.debug(`Sending request to cloud function: ${cloudFunctionUrl}`);
    const response = await fetchWithProxy(cloudFunctionUrl, {
      method: 'POST',
      headers: getRemoteGenerationHeaders(),
      body: JSON.stringify({
        ...bodyResult.data,
        task: taskId,
      }),
    });

    if (!response.ok) {
      logger.error(`Cloud function responded with status ${response.status}`);
      throw new Error(`Cloud function responded with status ${response.status}`);
    }

    const data = await response.json();
    logger.debug(`Received response from cloud function: ${JSON.stringify(data)}`);
    res.json(RedteamSchemas.Task.Response.parse(data));
  } catch (error) {
    logger.error(`Error in ${taskId} task: ${error}`);
    res.status(500).json({ error: `Failed to process ${taskId} task` });
  }
});

redteamRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  res.json(
    RedteamSchemas.Status.Response.parse({
      hasRunningJob: currentJobId !== null,
      jobId: currentJobId,
    }),
  );
});

/**
 * GET /api/redteam/recon/pending
 * Returns pending recon config if available.
 * This is used by the web UI to load a config generated by the CLI recon command.
 *
 * SECURITY: This endpoint returns sensitive recon data (system prompts, tools, security notes).
 * Access requires both a local connection and an unguessable one-time handoff token because a
 * local reverse proxy can otherwise make a localhost-only endpoint remotely accessible.
 *
 * This local handoff endpoint is intentionally not rate-limited. It is not a hosted API route,
 * and its sensitive behavior is gated by a random capability generated per recon invocation.
 */
redteamRouter.head('/recon/pending', async (req: Request, res: Response): Promise<void> => {
  if (!isLocalhostRequest(req)) {
    res.status(403).json({
      error: 'Access denied: recon endpoints are only accessible from localhost',
    });
    return;
  }

  try {
    const data = readPendingReconConfig({ deleteOnError: false });
    if (!data || !isValidReconHandoffToken(data.handoffToken, getReconHandoffToken(req))) {
      res.status(404).json({ error: 'No matching pending recon configuration' });
      return;
    }

    // Confirm ownership without consuming the single-use browser handoff.
    res.sendStatus(204);
  } catch (error) {
    if (error instanceof InvalidPendingReconError) {
      logger.warn('Invalid pending recon file during ownership probe', { error });
      res.status(400).json({ error: INVALID_PENDING_RECON_MESSAGE });
      return;
    }

    sendError(res, 500, 'Failed to verify pending recon configuration', error);
  }
});

redteamRouter.get('/recon/pending', async (req: Request, res: Response): Promise<void> => {
  // Security gate: only allow localhost access to sensitive recon data
  if (!isLocalhostRequest(req)) {
    logger.warn('Blocked non-localhost access to recon/pending endpoint', {
      remoteAddress: req.socket?.remoteAddress || req.ip,
    });
    res.status(403).json({
      error: 'Access denied: recon endpoints are only accessible from localhost',
    });
    return;
  }

  try {
    const data = readPendingReconConfig();

    if (!data) {
      const errorResponse: ReconErrorResponse = { error: 'No pending recon configuration' };
      res.status(404).json(errorResponse);
      return;
    }

    if (!isValidReconHandoffToken(data.handoffToken, getReconHandoffToken(req))) {
      res.status(403).json({ error: 'Access denied: invalid recon handoff token' });
      return;
    }

    logger.debug('Serving pending recon configuration', {
      codebaseDirectory: data.metadata.codebaseDirectory,
    });

    const response: GetPendingReconResponse = {
      config: data.config,
      metadata: data.metadata,
      ...(data.reconResult ? { reconResult: data.reconResult } : {}),
    };
    deletePendingReconConfig();
    res.json(response);
  } catch (error) {
    if (error instanceof InvalidPendingReconError) {
      logger.warn('Invalid pending recon file during retrieval', { error });
      res.status(400).json({ error: INVALID_PENDING_RECON_MESSAGE });
      return;
    }

    sendError(res, 500, 'Failed to read pending recon configuration', error);
  }
});

/**
 * DELETE /api/redteam/recon/pending
 * Removes the pending recon config file.
 * Available for authorized cleanup when a generated handoff will not be consumed.
 *
 * SECURITY: Access requires the same local connection and one-time token as retrieval.
 * This local handoff endpoint is intentionally not rate-limited for the reasons above.
 */
redteamRouter.delete('/recon/pending', async (req: Request, res: Response): Promise<void> => {
  // Security gate: only allow localhost access
  if (!isLocalhostRequest(req)) {
    logger.warn('Blocked non-localhost access to recon/pending DELETE endpoint', {
      remoteAddress: req.socket?.remoteAddress || req.ip,
    });
    res.status(403).json({
      error: 'Access denied: recon endpoints are only accessible from localhost',
    });
    return;
  }

  try {
    const data = readPendingReconConfig();
    if (data && !isValidReconHandoffToken(data.handoffToken, getReconHandoffToken(req))) {
      res.status(403).json({ error: 'Access denied: invalid recon handoff token' });
      return;
    }

    deletePendingReconConfig();
    const response: DeletePendingReconResponse = { success: true };
    res.json(response);
  } catch (error) {
    if (error instanceof InvalidPendingReconError) {
      logger.warn('Invalid pending recon file during delete', { error });
      res.status(400).json({ error: INVALID_PENDING_RECON_MESSAGE });
      return;
    }

    sendError(res, 500, 'Failed to delete pending recon configuration', error);
  }
});
