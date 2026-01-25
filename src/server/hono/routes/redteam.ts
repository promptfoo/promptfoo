/**
 * Red team routes for the local web UI.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import cliState from '../../../cliState';
import logger from '../../../logger';
import {
  ALL_PLUGINS,
  ALL_STRATEGIES,
  DATASET_EXEMPT_PLUGINS,
  isMultiTurnStrategy,
  MULTI_INPUT_EXCLUDED_PLUGINS,
  type MultiTurnStrategy,
  type Plugin,
  REDTEAM_MODEL,
  type Strategy,
} from '../../../redteam/constants';
import { PluginFactory, Plugins } from '../../../redteam/plugins/index';
import { redteamProviderManager } from '../../../redteam/providers/shared';
import { getRemoteGenerationUrl } from '../../../redteam/remoteGeneration';
import { doRedteamRun } from '../../../redteam/shared';
import { Strategies } from '../../../redteam/strategies/index';
import { type Strategy as StrategyFactory } from '../../../redteam/strategies/types';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../../redteam/types';
import { TestCaseWithPlugin } from '../../../types';
import { fetchWithProxy } from '../../../util/fetch/index';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../../services/redteamTestCaseGenerationService';
import { evalJobs } from './eval';

export const redteamRouter = new Hono();

const TestCaseGenerationSchema = z.object({
  plugin: z.object({
    id: z.string().refine((val) => ALL_PLUGINS.includes(val as Plugin), {
      message: `Invalid plugin ID. Must be one of: ${ALL_PLUGINS.join(', ')}`,
    }) as unknown as z.ZodType<Plugin>,
    config: PluginConfigSchema.optional().prefault({}),
  }),
  strategy: z.object({
    id: z.string().refine((val) => (ALL_STRATEGIES as string[]).includes(val), {
      message: `Invalid strategy ID. Must be one of: ${ALL_STRATEGIES.join(', ')}`,
    }) as unknown as z.ZodType<Strategy>,
    config: StrategyConfigSchema.optional().prefault({}),
  }),
  config: z.object({
    applicationDefinition: z.object({
      purpose: z.string().nullable(),
    }),
  }),
  turn: z.int().min(0).optional().prefault(0),
  maxTurns: z.int().min(1).optional(),
  history: z.array(ConversationMessageSchema).optional().prefault([]),
  goal: z.string().optional(),
  stateful: z.boolean().optional(),
  count: z.int().min(1).max(10).optional().prefault(1),
});

// Track the current running job
let currentJobId: string | null = null;
let currentAbortController: AbortController | null = null;

/**
 * POST /api/redteam/generate-test
 *
 * Generates a test case for a given plugin/strategy combination.
 */
redteamRouter.post('/generate-test', async (c) => {
  try {
    const body = await c.req.json();
    const parsedBody = TestCaseGenerationSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json({ error: 'Invalid request body', details: parsedBody.error.message }, 400);
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
      return c.json({ error: pluginConfigurationError }, 400);
    }

    // In multi-input mode, some plugins don't support dynamic generation
    const hasMultiInput =
      plugin.config.inputs && Object.keys(plugin.config.inputs as object).length > 0;
    if (hasMultiInput) {
      const excludedPlugins = [...DATASET_EXEMPT_PLUGINS, ...MULTI_INPUT_EXCLUDED_PLUGINS];
      if (excludedPlugins.includes(plugin.id as (typeof excludedPlugins)[number])) {
        logger.debug(`Skipping plugin '${plugin.id}' - does not support multi-input mode`);
        return c.json({ testCases: [], count: 0 });
      }
    }

    // For multi-turn strategies, force count to 1
    const effectiveCount = isMultiTurnStrategy(strategy.id) ? 1 : count;

    logger.debug('Generating red team test case', { plugin, strategy, count: effectiveCount });

    const pluginFactory = Plugins.find((p) => p.key === plugin.id) as PluginFactory;
    const injectVar = 'query';
    const redteamProvider = await redteamProviderManager.getProvider({ provider: REDTEAM_MODEL });

    const testCases = await pluginFactory.action({
      provider: redteamProvider,
      purpose: config.applicationDefinition.purpose ?? 'general AI assistant',
      injectVar,
      n: effectiveCount,
      delayMs: 0,
      config: {
        ...plugin.config,
        language: plugin.config.language ?? 'en',
        __nonce: Math.floor(Math.random() * 1000000),
      },
    });

    if (testCases.length === 0) {
      return c.json({ error: 'Failed to generate test case' }, 500);
    }

    let finalTestCases = testCases;

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
        logger.error(`Error applying strategy ${strategy.id}: ${error}`);
        return c.json(
          {
            error: `Failed to apply strategy ${strategy.id}`,
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    }

    const context = `This test case targets the ${plugin.id} plugin with strategy ${strategy.id} and was generated based on your application context. If the test case is not relevant to your application, you can modify the application definition to improve relevance.`;
    const purpose = config.applicationDefinition.purpose ?? null;

    // Handle multi-turn strategies
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

        return c.json({
          prompt: multiTurnResult.prompt,
          context,
          metadata: multiTurnResult.metadata,
        });
      } catch (error) {
        if (error instanceof RemoteGenerationDisabledError) {
          return c.json({ error: error.message }, 400);
        }

        logger.error('[Multi-turn] Error generating prompt', {
          message: error instanceof Error ? error.message : String(error),
          strategy: strategy.id,
        });
        return c.json(
          {
            error: 'Failed to generate multi-turn prompt',
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
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

      return c.json({
        testCases: batchResults,
        count: batchResults.length,
      });
    }

    // Handle single test case response
    const testCase = finalTestCases[0];
    const generatedPrompt = extractGeneratedPrompt(testCase, injectVar);
    const baseMetadata =
      testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};

    return c.json({
      prompt: generatedPrompt,
      context,
      metadata: baseMetadata,
    });
  } catch (error) {
    logger.error(`Error generating test case: ${error}`);
    return c.json(
      {
        error: 'Failed to generate test case',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

/**
 * POST /api/redteam/run
 *
 * Run a red team evaluation.
 */
redteamRouter.post('/run', async (c) => {
  // If there's a current job running, abort it
  if (currentJobId) {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    const existingJob = evalJobs.get(currentJobId);
    if (existingJob) {
      existingJob.status = 'error';
      existingJob.logs.push('Job cancelled - new job started');
    }
  }

  const { config, force, verbose, delay, maxConcurrency } = await c.req.json();
  const id = crypto.randomUUID();
  currentJobId = id;
  currentAbortController = new AbortController();

  evalJobs.set(id, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: 0,
    result: null,
    logs: [],
  });

  cliState.webUI = true;

  const normalizedMaxConcurrency = Math.max(1, Number(maxConcurrency || '1'));

  doRedteamRun({
    liveRedteamConfig: config,
    force,
    verbose,
    delay: Number(delay || '0'),
    maxConcurrency: normalizedMaxConcurrency,
    logCallback: (message: string) => {
      if (currentJobId === id) {
        const job = evalJobs.get(id);
        if (job) {
          job.logs.push(message);
        }
      }
    },
    abortSignal: currentAbortController.signal,
  })
    .then(async (evalResult) => {
      const summary = evalResult ? await evalResult.toEvaluateSummary() : null;
      const job = evalJobs.get(id);
      if (job && currentJobId === id) {
        job.status = 'complete';
        job.result = summary;
        job.evalId = evalResult?.id ?? null;
      }
      if (currentJobId === id) {
        cliState.webUI = false;
        currentJobId = null;
        currentAbortController = null;
      }
    })
    .catch((error) => {
      logger.error(`Error running red team: ${error}\n${error.stack || ''}`);
      const job = evalJobs.get(id);
      if (job && currentJobId === id) {
        job.status = 'error';
        job.logs.push(`Error: ${error.message}`);
        if (error.stack) {
          job.logs.push(`Stack trace: ${error.stack}`);
        }
      }
      if (currentJobId === id) {
        cliState.webUI = false;
        currentJobId = null;
        currentAbortController = null;
      }
    });

  return c.json({ id });
});

/**
 * POST /api/redteam/cancel
 *
 * Cancel the current red team run.
 */
redteamRouter.post('/cancel', async (c) => {
  if (!currentJobId) {
    return c.json({ error: 'No job currently running' }, 400);
  }

  const jobId = currentJobId;

  if (currentAbortController) {
    currentAbortController.abort();
  }

  const job = evalJobs.get(jobId);
  if (job) {
    job.status = 'error';
    job.logs.push('Job cancelled by user');
  }

  cliState.webUI = false;
  currentJobId = null;
  currentAbortController = null;

  await new Promise((resolve) => setTimeout(resolve, 100));

  return c.json({ message: 'Job cancelled' });
});

/**
 * GET /api/redteam/status
 *
 * Get the status of the current red team run.
 */
redteamRouter.get('/status', (c) => {
  return c.json({
    hasRunningJob: currentJobId !== null,
    jobId: currentJobId,
  });
});

/**
 * POST /api/redteam/:taskId
 *
 * Proxy requests to Promptfoo Cloud to invoke tasks.
 * This is a catch-all route and must be defined last.
 */
redteamRouter.post('/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const cloudFunctionUrl = getRemoteGenerationUrl();
  const body = await c.req.json();

  logger.debug(
    `Received ${taskId} task request: ${JSON.stringify({
      method: c.req.method,
      url: c.req.url,
      body,
    })}`,
  );

  try {
    logger.debug(`Sending request to cloud function: ${cloudFunctionUrl}`);
    const response = await fetchWithProxy(cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: taskId,
        ...body,
      }),
    });

    if (!response.ok) {
      logger.error(`Cloud function responded with status ${response.status}`);
      throw new Error(`Cloud function responded with status ${response.status}`);
    }

    const data = await response.json();
    logger.debug(`Received response from cloud function: ${JSON.stringify(data)}`);
    return c.json(data);
  } catch (error) {
    logger.error(`Error in ${taskId} task: ${error}`);
    return c.json({ error: `Failed to process ${taskId} task` }, 500);
  }
});

export default redteamRouter;
