import { Router } from 'express';
import { z } from 'zod';
import cliState from '../../cliState';
import logger from '../../logger';
import {
  containsSetupSecret,
  localReviewField,
  sessionTransform,
  targetExecutionIssue,
  testSetupConnection,
} from '../../node/redteamSetupConnection';
import {
  DATASET_EXEMPT_PLUGINS,
  isMultiTurnStrategy,
  MULTI_INPUT_EXCLUDED_PLUGINS,
  type MultiTurnStrategy,
} from '../../redteam/constants';
import { PluginFactory, Plugins } from '../../redteam/plugins/index';
import { redteamProviderManager } from '../../redteam/providers/shared';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../redteam/remoteGeneration';
import { doRedteamRun } from '../../redteam/shared';
import { Strategies, validateStrategies } from '../../redteam/strategies/index';
import { type Strategy as StrategyFactory } from '../../redteam/strategies/types';
import { type RedteamFileConfig, TestCaseWithPlugin } from '../../types';
import { httpTargetValidationIssue, RedteamSchemas } from '../../types/api/redteam';
import { fetchWithProxy } from '../../util/fetch/index';
import { isLocalHost } from '../middleware/csrfProtection';
import { evalJobService } from '../services/evalJobService';
import {
  extractGeneratedPrompt,
  generateMultiTurnPrompt,
  getPluginConfigurationError,
  RemoteGenerationDisabledError,
} from '../services/redteamTestCaseGenerationService';
import type { Request, Response } from 'express';

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
      provider,
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

    // Keep preview generation request-scoped. A form-selected provider wins, followed by
    // any org/team cache, then the built-in default; previous CLI runs must not leak here.
    const providerSelection = await redteamProviderManager.getProviderSelection({
      provider: provider as RedteamFileConfig['provider'],
      ignoreCliState: true,
    });

    const testCases = await pluginFactory.action({
      provider: providerSelection.provider,
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
          {
            ...(strategy.config || {}),
          },
          strategy.id,
          {
            // Provider options stay request-local because they can contain credentials.
            generationProviderSelection: providerSelection,
          },
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

  if (bodyResult.data.fromAgent) {
    const { config, userTurns = [] } = bodyResult.data;
    const check = await assessSetup(config, userTurns);
    if (!check.runnable) {
      res.status(400).json({
        error:
          check.runIssue || 'The setup failed validation. Return to chat to correct the draft.',
      });
      return;
    }
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
  const { basePath: _basePath, ...localConfig } = config;
  const id = crypto.randomUUID();
  currentJobId = id;
  currentAbortController = new AbortController();

  evalJobService.create(id);

  // Set web UI mode
  cliState.webUI = true;

  // Run redteam in background
  doRedteamRun({
    liveRedteamConfig: localConfig,
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

type Config = Record<string, unknown>;
type Assessment = {
  runnable: boolean;
  testableTargets: number[];
  runIssue?: string;
  validationError?: string;
};

function targets(config?: Config): unknown[] {
  const list = config?.targets ?? config?.providers;
  return Array.isArray(list) ? list : list === undefined ? [] : [list];
}

function invalid(message: string): Assessment {
  return { runnable: false, testableTargets: [], validationError: message.slice(0, 2000) };
}

function issue(error: z.ZodError) {
  return error.issues
    .slice(0, 5)
    .map((i) => {
      const detail =
        i.code === 'invalid_union'
          ? i.errors
              .flat()
              .slice(0, 4)
              .map((e) => e.message.slice(0, 160))
              .join(' or ')
          : i.message;
      return i.path.join('.') + ': ' + detail;
    })
    .join('\n');
}

const schema = RedteamSchemas.SetupPlan;

async function assessSetup(
  config: Config | undefined,
  userTurns: string[],
  previous?: Config,
): Promise<Assessment> {
  if (!config) {
    return { runnable: false, testableTargets: [] };
  }
  const input = schema.Input.safeParse(config);
  if (!input.success) {
    return invalid(issue(input.error));
  }
  const list = targets(config);
  const parsed =
    list.length && config.redteam
      ? schema.Complete.safeParse(config)
      : schema.Draft.safeParse(config);
  if (!parsed.success) {
    return invalid(issue(parsed.error));
  }
  const redteam = parsed.data.redteam;
  if (redteam) {
    // Use the same validators as generation. Do not call plugin actions, load
    // file-based strategies, or replace the authored config with parsed defaults.
    for (const plugin of redteam.plugins ?? []) {
      const { id, config: settings } =
        typeof plugin === 'string' ? { id: plugin, config: undefined } : plugin;
      try {
        Plugins.find((entry) => entry.key === id)?.validate?.(settings ?? {});
      } catch (err) {
        return invalid(
          'redteam.plugins (' +
            id +
            '): ' +
            (err instanceof Error ? err.message : 'Invalid plugin settings'),
        );
      }
    }
    try {
      await validateStrategies(
        (redteam.strategies ?? []).map((s) => (typeof s === 'string' ? { id: s } : s)),
      );
    } catch (err) {
      return invalid(
        'redteam.strategies: ' + (err instanceof Error ? err.message : 'Invalid strategy settings'),
      );
    }
    if (!redteam.plugins?.length) {
      return invalid(
        'redteam.plugins is empty. Choose plugins or omit redteam until the scope is clear. An empty list would run the default suite.',
      );
    }
  }

  const prior = targets(previous);
  const testableTargets: number[] = [];
  let runIssue: string | undefined;
  for (const [index, target] of list.entries()) {
    const path = (config.targets ? 'targets.' : 'providers.') + index;
    if (target && typeof target === 'object') {
      const keys = Object.keys(target);
      const isMap = keys.length && keys.every((key) => !Object.hasOwn(schema.Provider.shape, key));
      const parsed = (isMap ? schema.ProviderMap : schema.Provider).safeParse(target);
      if (!parsed.success) {
        return invalid(path + ': ' + issue(parsed.error));
      }
    }
    const httpError = httpTargetValidationIssue(target);
    if (httpError) {
      return invalid(path + ': ' + httpError);
    }
    const restriction = targetExecutionIssue(target, userTurns, prior[index]);
    if (restriction?.repairable) {
      return invalid(path + ': ' + restriction.message);
    }
    if (restriction) {
      runIssue ??= path + ': ' + restriction.message;
    } else if (RedteamSchemas.SetupConnectionTest.Request.safeParse(target).success) {
      testableTargets.push(index);
    }
  }
  const defaultTest = parsed.data.defaultTest;
  if (
    testableTargets.some((i) => /\{\{\s*sessionId\s*\}\}/.test(JSON.stringify(list[i]))) &&
    !(
      typeof defaultTest === 'object' &&
      (defaultTest.options?.transformVars || defaultTest.vars?.sessionId)
    )
  ) {
    return invalid(
      'To create the sessionId used by this HTTP target, set defaultTest.options.transformVars to ' +
        JSON.stringify(sessionTransform) +
        '.',
    );
  }
  if (!list.length || !redteam) {
    runIssue ??= list.length
      ? 'The draft still needs a red team test plan.'
      : 'The draft still needs a target.';
  } else {
    if (
      !config.prompts ||
      (typeof config.prompts === 'object' && !Object.keys(config.prompts).length)
    ) {
      return invalid('Provide at least one prompt template, typically ["{{prompt}}"].');
    }
    const field = localReviewField(config);
    if (field) {
      runIssue ??=
        'Review ' +
        field +
        ' locally before running. It can access files, credentials, code or another service.';
    }
  }
  return { runnable: !runIssue, testableTargets, runIssue };
}

redteamRouter.get('/setup-plan', (_req, res) => {
  res.json({ enabled: !neverGenerateRemote() });
});

// Keep this off /:taskId, even on older servers. Connection details must never
// fall through to the Cloud task proxy. Only local users can send server credentials.
redteamRouter.post('/setup/connection-test', async (req, res) => {
  const caller = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (!isLocalHost(req.hostname) || (caller !== '127.0.0.1' && caller !== '::1')) {
    res.status(403).json({ error: 'Open Promptfoo on localhost to test a connection from chat.' });
    return;
  }
  const input = RedteamSchemas.SetupConnectionTest.Request.safeParse(req.body);
  if (!input.success) {
    res
      .status(400)
      .json({ error: 'Check the endpoint, request, reply path, headers and variable names.' });
    return;
  }
  const timeout = AbortSignal.timeout(15_000);
  const disconnected = new AbortController();
  res.once('close', () => disconnected.abort());
  try {
    const result = await testSetupConnection(
      input.data,
      AbortSignal.any([timeout, disconnected.signal]),
    );
    res.json(RedteamSchemas.SetupConnectionTest.Response.parse(result));
  } catch {
    if (!disconnected.signal.aborted) {
      res.json({
        success: false,
        message: timeout.aborted
          ? 'No reply within 15 seconds. Check your app before retrying. It may have received the message.'
          : 'Couldn’t reach the endpoint. Check the URL and that Promptfoo can reach your app.',
      });
    }
  }
});

redteamRouter.post('/setup-plan', async (req, res) => {
  if (neverGenerateRemote()) {
    res.status(403).json({ error: 'Remote generation is disabled. Set up your tests manually.' });
    return;
  }
  const input = RedteamSchemas.SetupPlan.Request.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      error:
        req.body?.version === 3
          ? 'Check your draft and message size. The agent accepts up to 128,000 characters of config and 48,000 characters of conversation.'
          : 'Reload setup to use the hosted agent. The new chat shares API descriptions with Promptfoo Cloud.',
    });
    return;
  }
  const { version: _version, ...conversation } = input.data;
  const { messages, config, verification } = conversation;
  const fields = [
    ...messages.map(({ content }) => content),
    JSON.stringify(config),
    verification?.message,
    ...(verification?.paths ?? []),
  ];
  if (fields.some((value) => value && containsSetupSecret(value))) {
    res.status(400).json({
      error:
        'This looks like a credential. I didn’t send it to Cloud. Remove the value and use the environment variable name instead.',
    });
    return;
  }

  const timeout = AbortSignal.timeout(60_000);
  const disconnected = new AbortController();
  res.once('close', () => disconnected.abort());
  const signal = AbortSignal.any([timeout, disconnected.signal]);
  const userTurns = messages.filter((m) => m.role === 'user').map((m) => m.content);
  let feedback: { validationError: string; rejectedConfig?: Record<string, unknown> } | undefined;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetchWithProxy(getRemoteGenerationUrl(), {
        method: 'POST',
        headers: getRemoteGenerationHeaders(),
        body: JSON.stringify({ task: 'redteam-setup', ...conversation, ...feedback }),
        signal,
        redirect: 'error',
      });
      if (
        response.status === 400 &&
        (await response.json()).message === 'Unknown task: redteam-setup'
      ) {
        res
          .status(502)
          .json({ error: 'This server does not support agent setup yet. Continue manually.' });
        return;
      }
      if (response.status === 429) {
        res
          .status(429)
          .json({ error: 'The setup agent is busy. Try again shortly or continue manually.' });
        return;
      }
      if (!response.ok) {
        break;
      }
      const reply = schema.HostedReply.safeParse(await response.json());
      if (!reply.success) {
        break;
      }
      if (
        containsSetupSecret(reply.data.message) ||
        (reply.data.config && containsSetupSecret(JSON.stringify(reply.data.config)))
      ) {
        feedback = {
          validationError: 'Remove literal credentials. Use only environment variable references.',
        };
        continue;
      }
      const { validationError, ...status } = await assessSetup(
        reply.data.config ?? config,
        userTurns,
        config,
      );
      if (!validationError) {
        res.json(schema.Response.parse({ ...reply.data, ...status }));
        return;
      }
      feedback = { validationError, rejectedConfig: reply.data.config };
    }
    if (feedback) {
      res.status(502).json({
        error:
          'The agent couldn’t validate its changes. Your draft is unchanged. Try again or clarify the request.',
      });
      return;
    }
  } catch {
    if (disconnected.signal.aborted) {
      return;
    }
  }
  res.status(502).json({
    error: timeout.aborted
      ? 'The setup agent took too long. Try again or continue manually.'
      : 'The setup agent is unavailable. Try again or continue manually.',
  });
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
    logger.debug(`Received ${taskId} response from cloud function`);
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
