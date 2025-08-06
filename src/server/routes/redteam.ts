import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import cliState from '../../cliState';
import logger from '../../logger';
import { REDTEAM_MODEL } from '../../redteam/constants';
import { Plugins } from '../../redteam/plugins';
import { redteamProviderManager } from '../../redteam/providers/shared';
import { getRemoteGenerationUrl } from '../../redteam/remoteGeneration';
import { doRedteamRun } from '../../redteam/shared';
import { evalJobs } from './eval';
import type { Request, Response } from 'express';

export const redteamRouter = Router();

// Generate a single test case for a specific plugin
redteamRouter.post('/generate-test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pluginId, config } = req.body;

    if (!pluginId) {
      res.status(400).json({ error: 'Plugin ID is required' });
      return;
    }

    // Find the plugin
    const plugin = Plugins.find((p) => p.key === pluginId);
    if (!plugin) {
      res.status(400).json({ error: `Plugin ${pluginId} not found` });
      return;
    }

    // Get default values from config
    const purpose = config?.applicationDefinition?.purpose || 'general AI assistant';
    const injectVar = config?.injectVar || 'query';

    // Extract plugin-specific configuration
    const pluginConfig = {
      language: config?.language || 'en',
      // Pass through plugin-specific config fields
      ...(config?.indirectInjectionVar && { indirectInjectionVar: config.indirectInjectionVar }),
      ...(config?.systemPrompt && { systemPrompt: config.systemPrompt }),
      ...(config?.targetIdentifiers && { targetIdentifiers: config.targetIdentifiers }),
      ...(config?.targetSystems && { targetSystems: config.targetSystems }),
      ...(config?.targetUrls && { targetUrls: config.targetUrls }),
      // Pass through any other config fields that might be present
      ...Object.fromEntries(
        Object.entries(config || {}).filter(
          ([key]) => !['applicationDefinition', 'injectVar', 'language', 'provider'].includes(key),
        ),
      ),
    };

    // Validate required configuration for specific plugins
    if (pluginId === 'indirect-prompt-injection' && !pluginConfig.indirectInjectionVar) {
      res.status(400).json({
        error: 'Indirect Prompt Injection plugin requires indirectInjectionVar configuration',
      });
      return;
    }

    if (pluginId === 'prompt-extraction' && !pluginConfig.systemPrompt) {
      res.status(400).json({
        error: 'Prompt Extraction plugin requires systemPrompt configuration',
      });
      return;
    }

    // Optional config plugins - only validate if config is provided but invalid
    if (
      pluginId === 'bfla' &&
      pluginConfig.targetIdentifiers &&
      (!Array.isArray(pluginConfig.targetIdentifiers) ||
        pluginConfig.targetIdentifiers.length === 0)
    ) {
      res.status(400).json({
        error: 'BFLA plugin targetIdentifiers must be a non-empty array when provided',
      });
      return;
    }

    if (
      pluginId === 'bola' &&
      pluginConfig.targetSystems &&
      (!Array.isArray(pluginConfig.targetSystems) || pluginConfig.targetSystems.length === 0)
    ) {
      res.status(400).json({
        error: 'BOLA plugin targetSystems must be a non-empty array when provided',
      });
      return;
    }

    if (
      pluginId === 'ssrf' &&
      pluginConfig.targetUrls &&
      (!Array.isArray(pluginConfig.targetUrls) || pluginConfig.targetUrls.length === 0)
    ) {
      res.status(400).json({
        error: 'SSRF plugin targetUrls must be a non-empty array when provided',
      });
      return;
    }

    // Get the red team provider
    const redteamProvider = await redteamProviderManager.getProvider({
      provider: config?.provider || REDTEAM_MODEL,
    });

    const testCases = await plugin.action({
      provider: redteamProvider,
      purpose,
      injectVar,
      n: 1, // Generate only one test case
      delayMs: 0,
      config: {
        // Random number to avoid caching
        __random: Math.random(),
        ...pluginConfig,
      },
    });

    if (testCases.length === 0) {
      res.status(500).json({ error: 'Failed to generate test case' });
      return;
    }

    const testCase = testCases[0];
    const generatedPrompt = testCase.vars?.[injectVar] || 'Unable to extract test prompt';

    const context = `This test case targets the ${pluginId} plugin and was generated based on your application context. If the test case is not relevant to your application, you can modify the application definition to improve relevance.`;

    res.json({
      prompt: generatedPrompt,
      context,
      metadata: testCase.metadata,
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
      logger.error(`Error running redteam: ${error}`);
      const job = evalJobs.get(id);
      if (job && currentJobId === id) {
        job.status = 'error';
        job.logs.push(`Error: ${error.message}`);
      }
      if (currentJobId === id) {
        cliState.webUI = false;
        currentJobId = null;
        currentAbortController = null;
      }
    });

  res.json({ id });
});

redteamRouter.post('/cancel', async (req: Request, res: Response): Promise<void> => {
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
    const response = await fetch(cloudFunctionUrl, {
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

redteamRouter.get('/status', async (req: Request, res: Response): Promise<void> => {
  res.json({
    hasRunningJob: currentJobId !== null,
    jobId: currentJobId,
  });
});
