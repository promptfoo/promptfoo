import { Router } from 'express';
import { z } from 'zod';
import cliState from '../../cliState';
import logger from '../../logger';
import { ConfigurationAgent } from '../../redteam/configAgent/agent';
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
import { evalJobService } from '../services/evalJobService';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../services/redteamTestCaseGenerationService';
import type { Request, Response } from 'express';

import type {
  AgentMessage,
  ConfigAgentSession,
  DiscoveredConfig,
  UserInput,
} from '../../redteam/configAgent/types';

export const redteamRouter = Router();

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

// ============================================================================
// Configuration Agent Endpoints
// ============================================================================

// Store active configuration agent sessions
const configAgentSessions = new Map<string, ConfigurationAgent>();

// Maximum number of concurrent sessions allowed
const MAX_CONFIG_AGENT_SESSIONS = 100;

/**
 * Sanitize session data to remove sensitive information before sending to client
 */
function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === 'authorization' ||
    normalized.includes('api-key') ||
    normalized.includes('apikey') ||
    normalized.includes('key') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('token')
  );
}

function maskSensitiveValue(value: unknown): string {
  const strValue = String(value);
  return strValue.length > 4 ? `••••${strValue.slice(-4)}` : '••••';
}

function maskHeaderValue(value: string): string {
  const authMatch = value.match(/^([a-z]+)\s+(.+)$/i);
  if (authMatch) {
    return `${authMatch[1]} ${maskSensitiveValue(authMatch[2])}`;
  }
  return maskSensitiveValue(value);
}

function sanitizeDiscoveredConfig<T extends Partial<DiscoveredConfig>>(config: T): T {
  const sanitizedConfig = { ...config };

  if (sanitizedConfig.headers) {
    sanitizedConfig.headers = Object.fromEntries(
      Object.entries(sanitizedConfig.headers).map(([key, value]) => [
        key,
        isSensitiveName(key) ? maskHeaderValue(value) : value,
      ]),
    );
  }

  return sanitizedConfig;
}

function sanitizeMessagesForClient(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => ({
    ...message,
    metadata: message.metadata
      ? {
          ...message.metadata,
          discoveredConfig: message.metadata.discoveredConfig
            ? sanitizeDiscoveredConfig(message.metadata.discoveredConfig)
            : undefined,
        }
      : undefined,
  }));
}

function sanitizeSessionForClient(session: ConfigAgentSession): ConfigAgentSession {
  const sanitizedSession = structuredClone(session);

  // Remove sensitive fields from userInputs
  if (sanitizedSession.userInputs) {
    const sanitizedInputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sanitizedSession.userInputs)) {
      if (isSensitiveName(key)) {
        sanitizedInputs[key] = maskSensitiveValue(value);
      } else {
        sanitizedInputs[key] = value;
      }
    }
    sanitizedSession.userInputs = sanitizedInputs;
  }

  if (sanitizedSession.finalConfig) {
    sanitizedSession.finalConfig = sanitizeDiscoveredConfig(sanitizedSession.finalConfig);
  }

  if (sanitizedSession.bestMatch) {
    sanitizedSession.bestMatch.discoveredConfig = sanitizeDiscoveredConfig(
      sanitizedSession.bestMatch.discoveredConfig,
    );
  }

  sanitizedSession.messages = sanitizeMessagesForClient(sanitizedSession.messages);

  return sanitizedSession;
}

const CONFIG_AGENT_SESSION_TTL = 60 * 60 * 1000;

function cleanExpiredConfigAgentSessions(): void {
  const now = Date.now();
  for (const [sessionId, agent] of configAgentSessions) {
    const session = agent.getSession();
    if (now - session.startedAt > CONFIG_AGENT_SESSION_TTL) {
      agent.cancel();
      configAgentSessions.delete(sessionId);
      logger.debug('[ConfigAgent] Cleaned up expired session', { sessionId });
    }
  }
}

/**
 * Start a new configuration agent session
 */
redteamRouter.post('/config-agent/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedBody = RedteamSchemas.ConfigAgentStart.Request.safeParse(req.body);
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request', details: parsedBody.error.message });
      return;
    }

    const { baseUrl } = parsedBody.data;

    cleanExpiredConfigAgentSessions();

    // Check session limit to prevent DoS
    if (configAgentSessions.size >= MAX_CONFIG_AGENT_SESSIONS) {
      res.status(503).json({
        success: false,
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
        success: false,
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

    res.json(
      RedteamSchemas.ConfigAgentStart.Response.parse({
        success: true,
        data: {
          sessionId: session.id,
          messages: sanitizeMessagesForClient(agent.getMessages()),
        },
      }),
    );
  } catch (error) {
    logger.error('[ConfigAgent] Start error', { error });
    res.status(500).json({ success: false, error: 'Failed to start configuration agent' });
  }
});

/**
 * Send user input to a configuration agent session
 */
redteamRouter.post('/config-agent/input', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsedBody = RedteamSchemas.ConfigAgentInput.Request.safeParse(req.body);
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request', details: parsedBody.error.message });
      return;
    }

    cleanExpiredConfigAgentSessions();

    const input: UserInput = parsedBody.data;
    const agent = configAgentSessions.get(input.sessionId);

    if (!agent) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    await agent.handleUserInput(input);

    // Sanitize session data to remove sensitive information
    const sanitizedSession = sanitizeSessionForClient(agent.getSession());

    res.json(
      RedteamSchemas.ConfigAgentInput.Response.parse({
        success: true,
        data: {
          messages: sanitizeMessagesForClient(agent.getMessages()),
          session: sanitizedSession,
        },
      }),
    );
  } catch (error) {
    logger.error('[ConfigAgent] Input error', { error });
    res.status(500).json({ success: false, error: 'Failed to process input' });
  }
});

/**
 * Get the current state of a configuration agent session
 */
redteamRouter.get(
  '/config-agent/session/:sessionId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      cleanExpiredConfigAgentSessions();

      const sessionId = req.params.sessionId as string;
      const agent = configAgentSessions.get(sessionId);

      if (!agent) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      // Sanitize session data to remove sensitive information
      const sanitizedSession = sanitizeSessionForClient(agent.getSession());

      res.json(
        RedteamSchemas.ConfigAgentSession.Response.parse({
          success: true,
          data: {
            messages: sanitizeMessagesForClient(agent.getMessages()),
            session: sanitizedSession,
            config: sanitizedSession.finalConfig,
            isComplete: agent.isComplete(),
          },
        }),
      );
    } catch (error) {
      logger.error('[ConfigAgent] Get session error', { error });
      res.status(500).json({ success: false, error: 'Failed to get session' });
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
      cleanExpiredConfigAgentSessions();

      const sessionId = req.params.sessionId as string;
      const agent = configAgentSessions.get(sessionId);

      if (agent) {
        agent.cancel();
        configAgentSessions.delete(sessionId);
      }

      res.json(RedteamSchemas.ConfigAgentDelete.Response.parse({ success: true, data: {} }));
    } catch (error) {
      logger.error('[ConfigAgent] Cancel error', { error });
      res.status(500).json({ success: false, error: 'Failed to cancel session' });
    }
  },
);

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
