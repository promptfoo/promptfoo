import { Router } from 'express';
import { z } from 'zod';
import cliState from '../../cliState';
import logger from '../../logger';
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
} from '../../redteam/constants';
import { PluginFactory, Plugins } from '../../redteam/plugins/index';
import { redteamProviderManager } from '../../redteam/providers/shared';
import { getRemoteGenerationUrl } from '../../redteam/remoteGeneration';
import { doRedteamRun } from '../../redteam/shared';
import { Strategies } from '../../redteam/strategies/index';
import { type Strategy as StrategyFactory } from '../../redteam/strategies/types';
import {
  ConversationMessageSchema,
  PluginConfigSchema,
  StrategyConfigSchema,
} from '../../redteam/types';
import { TestCaseWithPlugin } from '../../types';
import { fetchWithProxy } from '../../util/fetch/index';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../services/redteamTestCaseGenerationService';
import { evalJobs } from './eval';
import type { Request, Response } from 'express';

export const redteamRouter = Router();

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
  // Batch generation: number of test cases to generate (1-10, default 1)
  count: z.int().min(1).max(10).optional().prefault(1),
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
        res.json({ testCases: [], count: 0 });
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
        logger.error(`Error applying strategy ${strategy.id}: ${error}`);
        res.status(500).json({
          error: `Failed to apply strategy ${strategy.id}`,
          details: error instanceof Error ? error.message : String(error),
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

      res.json({
        testCases: batchResults,
        count: batchResults.length,
      });
      return;
    }

    // Handle single test case response (backward compatible)
    const testCase = finalTestCases[0];
    const generatedPrompt = extractGeneratedPrompt(testCase, injectVar);
    const baseMetadata =
      testCase.metadata && typeof testCase.metadata === 'object' ? testCase.metadata : {};

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
  const id = crypto.randomUUID();
  currentJobId = id;
  currentAbortController = new AbortController();

  // Initialize job status with empty logs array
  evalJobs.set(id, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: 0,
    result: null,
    logs: [],
  });

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

// ============================================================================
// Configuration Agent Endpoints
// ============================================================================

import { ConfigurationAgent } from '../../redteam/configAgent';

import type { UserInput } from '../../redteam/configAgent/types';

// Store active configuration agent sessions
const configAgentSessions = new Map<string, ConfigurationAgent>();

// Maximum number of concurrent sessions allowed
const MAX_CONFIG_AGENT_SESSIONS = 100;

/**
 * Sanitize session data to remove sensitive information before sending to client
 */
function sanitizeSessionForClient(
  session: ReturnType<ConfigurationAgent['getSession']>,
): Record<string, unknown> {
  // Create a sanitized copy without sensitive user inputs
  const sanitizedSession = { ...session };

  // Remove sensitive fields from userInputs
  if (sanitizedSession.userInputs) {
    const sanitizedInputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sanitizedSession.userInputs)) {
      // Mask API keys and other sensitive fields
      if (
        key === 'apiKey' ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token')
      ) {
        // Show masked version (last 4 chars only)
        const strValue = String(value);
        sanitizedInputs[key] = strValue.length > 4 ? `••••${strValue.slice(-4)}` : '••••';
      } else {
        sanitizedInputs[key] = value;
      }
    }
    sanitizedSession.userInputs = sanitizedInputs;
  }

  // Also sanitize finalConfig headers that might contain auth
  if (sanitizedSession.finalConfig?.headers) {
    const sanitizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(sanitizedSession.finalConfig.headers)) {
      if (
        key.toLowerCase() === 'authorization' ||
        key.toLowerCase().includes('api-key') ||
        key.toLowerCase().includes('apikey') ||
        key.toLowerCase() === 'x-api-key'
      ) {
        // Mask sensitive header values
        sanitizedHeaders[key] =
          value.length > 10 ? `${value.slice(0, 6)}••••${value.slice(-4)}` : '••••';
      } else {
        sanitizedHeaders[key] = value;
      }
    }
    sanitizedSession.finalConfig = {
      ...sanitizedSession.finalConfig,
      headers: sanitizedHeaders,
    };
  }

  return sanitizedSession;
}

const StartConfigAgentSchema = z.object({
  baseUrl: z.string().min(1, 'URL is required'),
  hints: z
    .object({
      apiType: z.string().optional(),
      hasAuth: z.boolean().optional(),
      authType: z.string().optional(),
    })
    .optional(),
});

/**
 * Start a new configuration agent session
 */
redteamRouter.post('/config-agent/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedBody = StartConfigAgentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid request', details: parsedBody.error.message });
      return;
    }

    const { baseUrl } = parsedBody.data;

    // Check session limit to prevent DoS
    if (configAgentSessions.size >= MAX_CONFIG_AGENT_SESSIONS) {
      res.status(503).json({
        error: 'Too many active sessions. Please try again later.',
      });
      return;
    }

    // Create new agent (may throw on invalid/blocked URLs)
    let agent: ConfigurationAgent;
    try {
      agent = new ConfigurationAgent(baseUrl);
    } catch (urlError) {
      // URL validation failed (SSRF protection)
      res.status(400).json({
        error: urlError instanceof Error ? urlError.message : 'Invalid URL',
      });
      return;
    }

    const session = agent.getSession();

    // Store the agent
    configAgentSessions.set(session.id, agent);

    // Start discovery (async)
    agent.startDiscovery().catch((err) => {
      logger.error('[ConfigAgent] Discovery error', { error: err });
    });

    res.json({
      sessionId: session.id,
      messages: agent.getMessages(),
    });
  } catch (error) {
    logger.error('[ConfigAgent] Start error', { error });
    res.status(500).json({ error: 'Failed to start configuration agent' });
  }
});

const UserInputSchema = z.object({
  sessionId: z.string(),
  type: z.enum(['message', 'option', 'api_key', 'confirmation']),
  value: z.union([z.string(), z.boolean()]),
  field: z.string().optional(),
});

/**
 * Send user input to a configuration agent session
 */
redteamRouter.post('/config-agent/input', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedBody = UserInputSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid request', details: parsedBody.error.message });
      return;
    }

    const input = parsedBody.data as UserInput;
    const agent = configAgentSessions.get(input.sessionId);

    if (!agent) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await agent.handleUserInput(input);

    // Sanitize session data to remove sensitive information
    const sanitizedSession = sanitizeSessionForClient(agent.getSession());

    res.json({
      messages: agent.getMessages(),
      session: sanitizedSession,
    });
  } catch (error) {
    logger.error('[ConfigAgent] Input error', { error });
    res.status(500).json({ error: 'Failed to process input' });
  }
});

/**
 * Get the current state of a configuration agent session
 */
redteamRouter.get(
  '/config-agent/session/:sessionId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.sessionId as string;
      const agent = configAgentSessions.get(sessionId);

      if (!agent) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Sanitize session data to remove sensitive information
      const sanitizedSession = sanitizeSessionForClient(agent.getSession());

      res.json({
        messages: agent.getMessages(),
        session: sanitizedSession,
        config: agent.getFinalConfig(),
        isComplete: agent.isComplete(),
      });
    } catch (error) {
      logger.error('[ConfigAgent] Get session error', { error });
      res.status(500).json({ error: 'Failed to get session' });
    }
  },
);

/**
 * Cancel a configuration agent session
 */
redteamRouter.delete(
  '/config-agent/session/:sessionId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.params.sessionId as string;
      const agent = configAgentSessions.get(sessionId);

      if (agent) {
        agent.cancel();
        configAgentSessions.delete(sessionId);
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('[ConfigAgent] Cancel error', { error });
      res.status(500).json({ error: 'Failed to cancel session' });
    }
  },
);

// Clean up old sessions periodically (sessions older than 1 hour)
const CONFIG_AGENT_SESSION_TTL = 60 * 60 * 1000; // 1 hour
setInterval(
  () => {
    const now = Date.now();
    for (const [sessionId, agent] of configAgentSessions) {
      const session = agent.getSession();
      if (now - session.startedAt > CONFIG_AGENT_SESSION_TTL) {
        agent.cancel();
        configAgentSessions.delete(sessionId);
        logger.debug('[ConfigAgent] Cleaned up expired session', { sessionId });
      }
    }
  },
  5 * 60 * 1000,
); // Check every 5 minutes

// ============================================================================
// Cloud Task Proxy (catch-all - must be last)
// ============================================================================

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
  const { taskId } = req.params;
  const cloudFunctionUrl = getRemoteGenerationUrl();
  logger.debug(
    `Received ${taskId} task request: ${JSON.stringify({
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
        task: taskId,
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
    logger.error(`Error in ${taskId} task: ${error}`);
    res.status(500).json({ error: `Failed to process ${taskId} task` });
  }
});

redteamRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  res.json({
    hasRunningJob: currentJobId !== null,
    jobId: currentJobId,
  });
});
