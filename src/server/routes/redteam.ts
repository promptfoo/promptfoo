import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import cliState from '../../cliState';
import logger from '../../logger';
import {
  REDTEAM_MODEL,
  ALL_PLUGINS,
  ALL_STRATEGIES,
  isMultiTurnStrategy,
  type MultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '../../redteam/constants';
import { PluginFactory, Plugins } from '../../redteam/plugins/index';
import { redteamProviderManager } from '../../redteam/providers/shared';
import { getRemoteGenerationUrl } from '../../redteam/remoteGeneration';
import { doRedteamRun } from '../../redteam/shared';
import { Strategies } from '../../redteam/strategies/index';
import { fetchWithProxy } from '../../util/fetch/index';
import { evalJobs } from './eval';
import { OpenAiChatCompletionProvider } from '../../providers/openai/chat';
import type { Request, Response } from 'express';
import dedent from 'dedent';
import { z } from 'zod';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../redteam/types';
import { type Strategy as StrategyFactory } from '../../redteam/strategies/types';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../services/redteamTestCaseGenerationService';
import { emitJobUpdate } from '../socket';
import {
  addJobError,
  createInitialMetrics,
  detectErrorFromLog,
  detectPhaseFromLog,
} from '../utils/jobProgress';
import type { Job } from '../../types';

/**
 * Emit job update via WebSocket (throttled to avoid flooding)
 */
const lastEmitTime = new Map<string, number>();
const EMIT_THROTTLE_MS = 500; // Emit at most every 500ms per job

function emitThrottledJobUpdate(jobId: string, job: Job): void {
  const now = Date.now();
  const lastTime = lastEmitTime.get(jobId) || 0;

  if (now - lastTime >= EMIT_THROTTLE_MS) {
    lastEmitTime.set(jobId, now);
    emitJobUpdate(jobId, 'job:update', {
      status: job.status,
      progress: job.progress,
      total: job.total,
      phase: job.phase,
      phaseDetail: job.phaseDetail,
      startedAt: job.startedAt,
      metrics: job.metrics,
      errors: job.errors,
      logs: job.logs.slice(-50), // Only send last 50 log lines via socket
    });
  }
}

/**
 * Clean up throttle tracking for a job
 */
function cleanupJobThrottling(jobId: string): void {
  lastEmitTime.delete(jobId);
}

/**
 * Emit job completion via WebSocket (always sent immediately)
 */
function emitJobComplete(jobId: string, job: Job): void {
  cleanupJobThrottling(jobId);
  emitJobUpdate(jobId, 'job:complete', {
    status: job.status,
    evalId: job.evalId,
    phase: job.phase,
    phaseDetail: job.phaseDetail,
    metrics: job.metrics,
    errors: job.errors,
    summary: job.summary,
  });
}

/**
 * Clean up old completed/errored jobs from evalJobs map
 * Jobs older than JOB_RETENTION_MS are removed to prevent memory leaks
 */
const JOB_RETENTION_MS = 30 * 60 * 1000; // 30 minutes

function cleanupOldJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of evalJobs.entries()) {
    // Only clean up completed or errored jobs
    if (job.status === 'complete' || job.status === 'error') {
      const jobAge = job.startedAt ? now - job.startedAt : 0;
      if (jobAge > JOB_RETENTION_MS) {
        evalJobs.delete(jobId);
        cleanupJobThrottling(jobId);
        logger.debug(`Cleaned up old job: ${jobId}`);
      }
    }
  }
}

// Run cleanup periodically (every 5 minutes)
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the job cleanup interval
 * Called when server starts
 */
export function startJobCleanupInterval(): void {
  if (!cleanupIntervalId) {
    cleanupIntervalId = setInterval(cleanupOldJobs, 5 * 60 * 1000);
  }
}

/**
 * Stop the job cleanup interval
 * Should be called on server shutdown to prevent memory leaks
 */
export function stopJobCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Start cleanup interval on module load
startJobCleanupInterval();

export const redteamRouter = Router();

const TestCaseGenerationSchema = z.object({
  plugin: z.object({
    id: z.string().refine((val) => ALL_PLUGINS.includes(val as any), {
      message: `Invalid plugin ID. Must be one of: ${ALL_PLUGINS.join(', ')}`,
    }) as unknown as z.ZodType<Plugin>,
    config: PluginConfigSchema.optional().default({}),
  }),
  strategy: z.object({
    id: z.string().refine((val) => (ALL_STRATEGIES as string[]).includes(val), {
      message: `Invalid strategy ID. Must be one of: ${ALL_STRATEGIES.join(', ')}`,
    }) as unknown as z.ZodType<Strategy>,
    config: StrategyConfigSchema.optional().default({}),
  }),
  config: z.object({
    applicationDefinition: z.object({
      purpose: z.string().nullable(),
    }),
  }),
  turn: z.number().int().min(0).optional().default(0),
  maxTurns: z.number().int().min(1).optional(),
  history: z.array(ConversationMessageSchema).optional().default([]),
  goal: z.string().optional(),
  stateful: z.boolean().optional(),
});

/**
 * Generates a test case for a given plugin/strategy combination.
 */
redteamRouter.post('/generate-test', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedBody = TestCaseGenerationSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsedBody.error.message });
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
    } = parsedBody.data;

    const pluginConfigurationError = getPluginConfigurationError(plugin);
    if (pluginConfigurationError) {
      res.status(400).json({ error: pluginConfigurationError });
      return;
    }

    logger.debug('Generating red team test case', { plugin, strategy });

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
      n: 1, // Generate only one test case
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
          testCases as any, // Cast to TestCaseWithPlugin[]
          injectVar,
          strategy.config || {},
          strategy.id,
        );

        if (strategyTestCases && strategyTestCases.length > 0) {
          finalTestCases = strategyTestCases;
        }
      } catch (error) {
        logger.error(`Error applying strategy ${strategy.id}: ${error}`);
        res.status(500).json({
          error: `Failed to apply strategy ${strategy.id}`,
          details: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    const testCase = finalTestCases[0];
    const generatedPrompt = extractGeneratedPrompt(testCase, injectVar);
    const baseMetadata =
      testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};
    const metadataForStrategy = {
      ...baseMetadata,
      strategyId: strategy.id,
    };
    const context = `This test case targets the ${plugin.id} plugin with strategy ${strategy.id} and was generated based on your application context. If the test case is not relevant to your application, you can modify the application definition to improve relevance.`;
    const purpose = config.applicationDefinition.purpose ?? null;

    if (isMultiTurnStrategy(strategy.id)) {
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

        res.json({
          prompt: multiTurnResult.prompt,
          context,
          metadata: multiTurnResult.metadata,
        });
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
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({
      prompt: generatedPrompt,
      context,
      metadata: baseMetadata,
    });
  } catch (error) {
    logger.error(`Error generating test case: ${error}`);
    res.status(500).json({
      error: 'Failed to generate test case',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Track the current running job
let currentJobId: string | null = null;
let currentAbortController: AbortController | null = null;

redteamRouter.post('/run', async (req: Request, res: Response): Promise<void> => {
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

  const { config, force, verbose, delay, maxConcurrency } = req.body;
  const id = uuidv4();
  currentJobId = id;
  currentAbortController = new AbortController();

  // Initialize job status with enhanced fields
  const job: Job = {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: 0,
    result: null,
    logs: [],
    // Enhanced fields
    phase: 'initializing',
    phaseDetail: 'Starting red team evaluation...',
    startedAt: Date.now(),
    metrics: createInitialMetrics(),
    errors: [],
  };
  evalJobs.set(id, job);

  // Set web UI mode
  cliState.webUI = true;

  // Validate and normalize maxConcurrency
  const normalizedMaxConcurrency = Math.max(1, Number(maxConcurrency || '1'));

  // Run redteam in background
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

          // Detect phase changes from log messages
          const phaseInfo = detectPhaseFromLog(message, job.phase);
          if (phaseInfo) {
            job.phase = phaseInfo.phase;
            if (phaseInfo.detail) {
              job.phaseDetail = phaseInfo.detail;
            }
          }

          // Detect and track errors from log messages
          const errorInfo = detectErrorFromLog(message);
          if (errorInfo) {
            addJobError(job, errorInfo.type, errorInfo.message);
          }

          // Emit throttled update via WebSocket
          emitThrottledJobUpdate(id, job);
        }
      }
    },
    progressCallback: (
      progress: number,
      total: number,
      _index: number | string,
      _evalStep: any,
      _metrics: any,
    ) => {
      if (currentJobId === id) {
        const job = evalJobs.get(id);
        if (job) {
          job.progress = progress;
          job.total = total;
          job.phase = 'evaluating';
          job.phaseDetail = `Evaluating probe ${progress}/${total}...`;

          // Emit throttled update via WebSocket
          emitThrottledJobUpdate(id, job);
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
        job.phase = 'complete';
        job.phaseDetail = 'Evaluation complete';

        // Populate metrics from results
        if (summary && summary.results) {
          const results = summary.results;
          let passCount = 0;
          let failCount = 0;
          let errorCount = 0;
          let totalLatencyMs = 0;

          // Count pass/fail/error from results and aggregate latency
          for (const result of results) {
            if (result.error) {
              errorCount++;
            } else if (result.success) {
              passCount++;
            } else {
              failCount++;
            }
            // Aggregate latency from individual results
            if (result.latencyMs) {
              totalLatencyMs += result.latencyMs;
            }
          }

          if (job.metrics) {
            job.metrics.testPassCount = passCount;
            job.metrics.testFailCount = failCount;
            job.metrics.testErrorCount = errorCount;
            job.metrics.totalLatencyMs = totalLatencyMs;

            // Get aggregated token usage from stats if available
            if ('stats' in summary && summary.stats?.tokenUsage) {
              const tokenUsage = summary.stats.tokenUsage;
              job.metrics.tokenUsage = {
                total: tokenUsage.total ?? 0,
                prompt: tokenUsage.prompt ?? 0,
                completion: tokenUsage.completion ?? 0,
                numRequests: tokenUsage.numRequests ?? results.length,
              };
            }
          }

          // Calculate top categories for vulnerabilities (failed tests)
          const categoryCount: Record<string, number> = {};
          for (const result of results) {
            if (!result.success && !result.error) {
              // This is a vulnerability (failed test)
              const pluginId =
                (result.vars as Record<string, unknown>)?.pluginId ||
                (result as unknown as Record<string, unknown>).pluginId ||
                'unknown';
              const category = String(pluginId);
              categoryCount[category] = (categoryCount[category] || 0) + 1;
            }
          }

          // Sort by count and take top 5
          const topCategories = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

          job.summary = {
            vulnerabilitiesFound: failCount,
            topCategories,
          };
        }

        // Emit completion via WebSocket
        emitJobComplete(id, job);
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
        job.phase = 'error';
        job.phaseDetail = 'Evaluation failed';
        job.logs.push(`Error: ${error.message}`);
        if (error.stack) {
          job.logs.push(`Stack trace: ${error.stack}`);
        }
        addJobError(job, 'unknown', error.message);

        // Emit error via WebSocket and cleanup
        emitJobComplete(id, job);
      }
      if (currentJobId === id) {
        cliState.webUI = false;
        currentJobId = null;
        currentAbortController = null;
      }
    });

  res.json({ id });
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

  const job = evalJobs.get(jobId);
  if (job) {
    job.status = 'error';
    job.logs.push('Job cancelled by user');
  }

  // Clear state
  cliState.webUI = false;
  currentJobId = null;
  currentAbortController = null;

  // Wait a moment to ensure cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));

  res.json({ message: 'Job cancelled' });
});

redteamRouter.post(
  '/generate-custom-policy',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { applicationDefinition, existingPolicies } = req.body;

      // Check if OpenAI API key is available before attempting to generate policies
      // This feature requires an OpenAI API key and has no remote generation fallback
      if (!process.env.OPENAI_API_KEY) {
        res.status(400).json({
          error: 'OpenAI API key required',
          details: 'Set the OPENAI_API_KEY environment variable to use custom policy generation',
        });
        return;
      }

      const provider = new OpenAiChatCompletionProvider('gpt-5-mini-2025-08-07', {
        config: {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'policies',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  policies: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        text: { type: 'string' },
                      },
                      required: ['name', 'text'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['policies'],
                additionalProperties: false,
              },
            },
          },
          temperature: 0.7,
        },
      });

      const systemPrompt = dedent`
      You are an expert at defining red teaming policies for AI applications.
      Your goal is to suggest custom policies (validators) that should be enforced based on the application definition.
      Return a JSON object with a "policies" array, where each policy has a "name" and "text".
      The "text" should be a clear, specific instruction for what the AI should not do or should check for.
      Do not suggest policies that are already in the existing list.
    `;

      const userPrompt = dedent`
      Application Definition:
      ${JSON.stringify(applicationDefinition, null, 2)}

      Existing Policies:
      ${JSON.stringify(existingPolicies, null, 2)}

      Suggest 3-5 new, unique, and relevant policies.`;

      const response = await provider.callApi(
        JSON.stringify([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]),
      );

      if (response.error) {
        throw new Error(response.error);
      }

      let policies = [];
      try {
        const output =
          typeof response.output === 'string' ? JSON.parse(response.output) : response.output;
        policies = output.policies || [];
      } catch (e) {
        logger.error(`Failed to parse generated policies: ${e}`);
      }

      res.json({ policies });
    } catch (error) {
      logger.error(`Error generating policies: ${error}`);
      res.status(500).json({
        error: 'Failed to generate policies',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

// NOTE: This comes last, so the other routes take precedence
redteamRouter.post('/:task', async (req: Request, res: Response): Promise<void> => {
  const { task } = req.params;
  const cloudFunctionUrl = getRemoteGenerationUrl();
  logger.debug(
    `Received ${task} task request: ${JSON.stringify({
      method: req.method,
      url: req.url,
      body: req.body,
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
        task,
        ...req.body,
      }),
    });

    if (!response.ok) {
      logger.error(`Cloud function responded with status ${response.status}`);
      throw new Error(`Cloud function responded with status ${response.status}`);
    }

    const data = await response.json();
    logger.debug(`Received response from cloud function: ${JSON.stringify(data)}`);
    res.json(data);
  } catch (error) {
    logger.error(`Error in ${task} task: ${error}`);
    res.status(500).json({ error: `Failed to process ${task} task` });
  }
});

redteamRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  res.json({
    hasRunningJob: currentJobId !== null,
    jobId: currentJobId,
  });
});
