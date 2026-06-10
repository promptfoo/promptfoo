import { Router } from 'express';
import { getEnvString } from '../../envars';
import {
  analyzeCoverage,
  extractRequirements,
  generateAssertions,
  validateAssertions,
} from '../../generation/assertions';
import { extractConcepts, generateDataset, measureDiversity } from '../../generation/dataset';
import { generateTestSuite } from '../../generation/index';
import {
  cancelJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  getJobAbortSignal,
  jobEventEmitter,
  listJobs,
} from '../../generation/shared/jobManager';
import logger from '../../logger';
import { GenerationSchemas } from '../../types/api/generation';
import { replyValidationError, sendError } from '../utils/errors';
import type { Request, Response } from 'express';

import type { JobEvent } from '../../generation/shared/jobManager';
import type { GenerationJob, GenerationJobType } from '../../generation/types';
import type { Assertion, Prompt, TestCase } from '../../types';
import type { GenerationPromptInput } from '../../types/api/generation';

export const generationRouter = Router();

// =============================================================================
// Capabilities Endpoint
// =============================================================================

/**
 * GET /api/generation/capabilities
 * Returns available generation capabilities based on environment.
 */
generationRouter.get('/capabilities', (_req: Request, res: Response): void => {
  const hasPiAccess = !!getEnvString('WITHPI_API_KEY');
  res.json({
    success: true,
    data: {
      hasPiAccess,
      defaultAssertionType: hasPiAccess ? 'pi' : 'llm-rubric',
    },
  });
});

// =============================================================================
// Dataset Generation Routes
// =============================================================================

/**
 * POST /api/generation/dataset/generate
 * Creates an async job to generate a dataset.
 */
generationRouter.post('/dataset/generate', (req: Request, res: Response): void => {
  try {
    const parseResult = GenerationSchemas.DatasetGenerate.Request.safeParse(req.body);

    if (!parseResult.success) {
      replyValidationError(res, parseResult.error);
      return;
    }

    const { prompts, tests, options } = parseResult.data;

    // Create job
    const job = createJob('dataset');

    // Start generation in background with jobId for streaming
    generateDataset(toPrompts(prompts), tests as TestCase[], options || {}, {
      abortSignal: getJobAbortSignal(job.id),
      jobId: job.id, // Pass jobId for SSE streaming
      onProgress: (current, total, phase) => {
        const existingJob = getJob(job.id);
        if (existingJob && existingJob.status !== 'cancelled') {
          existingJob.progress = current;
          existingJob.total = total;
          existingJob.phase = phase;
          existingJob.status = 'in-progress';
        }
      },
    })
      .then((result) => {
        if (getJob(job.id)?.status === 'cancelled') {
          return;
        }
        completeJob(job.id, result);
        logger.info('Dataset generation job completed', { jobId: job.id });
      })
      .catch((error) => {
        if (getJob(job.id)?.status === 'cancelled') {
          return;
        }
        logger.error('Dataset generation job failed', { jobId: job.id, error });
        failJob(job.id, 'Dataset generation failed');
      });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    sendError(res, 500, 'Failed to start dataset generation', error);
  }
});

/**
 * GET /api/generation/dataset/job/:id
 * Gets the status and result of a dataset generation job.
 */
generationRouter.get('/dataset/job/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const job = getJob(id);

  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  res.json({
    success: true,
    data: { job: formatJobResponse(job) },
  });
});

/**
 * POST /api/generation/dataset/analyze-concepts
 * Extracts concepts from prompts (synchronous, quick operation).
 */
generationRouter.post(
  '/dataset/analyze-concepts',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = GenerationSchemas.AnalyzeConcepts.Request.safeParse(req.body);

      if (!parseResult.success) {
        replyValidationError(res, parseResult.error);
        return;
      }

      const { prompts, options } = parseResult.data;
      const { getDefaultProviders } = await import('../../providers/defaults');
      const provider = (await getDefaultProviders()).synthesizeProvider;

      const concepts = await extractConcepts(toPromptStrings(prompts), provider, options);

      res.json({ success: true, data: { concepts } });
    } catch (error) {
      sendError(res, 500, 'Failed to analyze concepts', error);
    }
  },
);

/**
 * POST /api/generation/dataset/measure-diversity
 * Measures diversity of provided test cases (synchronous).
 */
generationRouter.post(
  '/dataset/measure-diversity',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = GenerationSchemas.MeasureDiversity.Request.safeParse(req.body);

      if (!parseResult.success) {
        replyValidationError(res, parseResult.error);
        return;
      }

      const { testCases, options } = parseResult.data;
      const diversity = await measureDiversity(testCases, undefined, {
        measureMethod: 'text',
        ...options,
      });

      res.json({ success: true, data: { diversity } });
    } catch (error) {
      sendError(res, 500, 'Failed to measure diversity', error);
    }
  },
);

// =============================================================================
// Assertion Generation Routes
// =============================================================================

/**
 * POST /api/generation/assertions/generate
 * Creates an async job to generate assertions.
 */
generationRouter.post('/assertions/generate', (req: Request, res: Response): void => {
  try {
    const parseResult = GenerationSchemas.AssertionGenerate.Request.safeParse(req.body);

    if (!parseResult.success) {
      replyValidationError(res, parseResult.error);
      return;
    }

    const { prompts, tests, options } = parseResult.data;

    // Create job
    const job = createJob('assertions');

    // Start generation in background with jobId for streaming
    generateAssertions(toPrompts(prompts), tests as TestCase[], options || {}, {
      abortSignal: getJobAbortSignal(job.id),
      jobId: job.id, // Pass jobId for SSE streaming
      onProgress: (current, total, phase) => {
        const existingJob = getJob(job.id);
        if (existingJob && existingJob.status !== 'cancelled') {
          existingJob.progress = current;
          existingJob.total = total;
          existingJob.phase = phase;
          existingJob.status = 'in-progress';
        }
      },
    })
      .then((result) => {
        if (getJob(job.id)?.status === 'cancelled') {
          return;
        }
        completeJob(job.id, result);
        logger.info('Assertion generation job completed', { jobId: job.id });
      })
      .catch((error) => {
        if (getJob(job.id)?.status === 'cancelled') {
          return;
        }
        logger.error('Assertion generation job failed', { jobId: job.id, error });
        failJob(job.id, 'Assertion generation failed');
      });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    sendError(res, 500, 'Failed to start assertion generation', error);
  }
});

/**
 * GET /api/generation/assertions/job/:id
 * Gets the status and result of an assertion generation job.
 */
generationRouter.get('/assertions/job/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const job = getJob(id);

  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  res.json({
    success: true,
    data: { job: formatJobResponse(job) },
  });
});

/**
 * POST /api/generation/assertions/analyze-coverage
 * Analyzes coverage of existing assertions against requirements.
 */
generationRouter.post(
  '/assertions/analyze-coverage',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = GenerationSchemas.AnalyzeCoverage.Request.safeParse(req.body);

      if (!parseResult.success) {
        replyValidationError(res, parseResult.error);
        return;
      }

      const { prompts, assertions } = parseResult.data;
      const { getDefaultProviders } = await import('../../providers/defaults');
      const provider = (await getDefaultProviders()).synthesizeProvider;

      const requirements = await extractRequirements(toPromptStrings(prompts), provider);
      const coverage = await analyzeCoverage(requirements, assertions as Assertion[]);

      res.json({ success: true, data: { coverage } });
    } catch (error) {
      sendError(res, 500, 'Failed to analyze assertion coverage', error);
    }
  },
);

/**
 * POST /api/generation/assertions/validate
 * Validates assertions against sample outputs.
 */
generationRouter.post(
  '/assertions/validate',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = GenerationSchemas.ValidateAssertions.Request.safeParse(req.body);

      if (!parseResult.success) {
        replyValidationError(res, parseResult.error);
        return;
      }

      const { assertions, samples } = parseResult.data;
      const { getDefaultProviders } = await import('../../providers/defaults');
      const provider = (await getDefaultProviders()).synthesizeProvider;

      const validation = await validateAssertions(assertions as Assertion[], samples, provider);

      res.json({ success: true, data: { validation } });
    } catch (error) {
      sendError(res, 500, 'Failed to validate assertions', error);
    }
  },
);

// =============================================================================
// Combined Test Suite Generation Routes
// =============================================================================

/**
 * POST /api/generation/tests/generate
 * Creates an async job to generate complete test suite (dataset + assertions).
 */
generationRouter.post('/tests/generate', (req: Request, res: Response): void => {
  try {
    const parseResult = GenerationSchemas.TestsGenerate.Request.safeParse(req.body);

    if (!parseResult.success) {
      replyValidationError(res, parseResult.error);
      return;
    }

    const { prompts, tests, options } = parseResult.data;

    // Create job with 'combined' type
    const job = createJob('combined');

    // Start generation in background
    generateTestSuite(toPrompts(prompts), tests as TestCase[], options || {}, {
      abortSignal: getJobAbortSignal(job.id),
      jobId: job.id, // Pass jobId for SSE streaming
      onProgress: (current, total, phase) => {
        const existingJob = getJob(job.id);
        if (existingJob && existingJob.status !== 'cancelled') {
          existingJob.progress = current;
          existingJob.total = total;
          existingJob.phase = phase;
          existingJob.status = 'in-progress';
        }
      },
    })
      .then((result) => {
        if (getJob(job.id)?.status === 'cancelled') {
          return;
        }
        completeJob(job.id, result);
        logger.info('Test suite generation job completed', { jobId: job.id });
      })
      .catch((error) => {
        if (getJob(job.id)?.status === 'cancelled') {
          return;
        }
        logger.error('Test suite generation job failed', { jobId: job.id, error });
        failJob(job.id, 'Test suite generation failed');
      });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    sendError(res, 500, 'Failed to start test suite generation', error);
  }
});

/**
 * GET /api/generation/tests/job/:id
 * Gets the status and result of a test suite generation job.
 */
generationRouter.get('/tests/job/:id', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const job = getJob(id);

  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  res.json({
    success: true,
    data: { job: formatJobResponse(job) },
  });
});

// =============================================================================
// Job Management Routes
// =============================================================================

generationRouter.post('/jobs/:id/cancel', (req: Request, res: Response): void => {
  const id = req.params.id as string;
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  cancelJob(id);
  res.json({ success: true, data: { job: formatJobResponse(job) } });
});

/**
 * GET /api/generation/jobs
 * Lists all generation jobs.
 */
generationRouter.get('/jobs', (req: Request, res: Response): void => {
  const { type, status } = req.query;

  const filter: { type?: GenerationJobType; status?: GenerationJob['status'] } = {};

  if (type === 'dataset' || type === 'assertions' || type === 'combined') {
    filter.type = type;
  }
  if (
    status === 'pending' ||
    status === 'in-progress' ||
    status === 'complete' ||
    status === 'error' ||
    status === 'cancelled'
  ) {
    filter.status = status;
  }

  const jobs = listJobs(Object.keys(filter).length > 0 ? filter : undefined);

  res.json({
    success: true,
    data: { jobs: jobs.map(formatJobResponse) },
  });
});

// =============================================================================
// SSE Streaming Routes
// =============================================================================

/**
 * GET /api/generation/stream/:jobId
 * Server-Sent Events endpoint for streaming job updates in real-time.
 * Streams progress updates, individual test cases/assertions, and completion events.
 */
generationRouter.get('/stream/:jobId', (req: Request, res: Response): void => {
  const jobId = req.params.jobId as string;

  // Verify job exists
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  logger.debug(`SSE connection opened for job ${jobId}`);

  // Send initial state
  const initialEvent = {
    type: 'progress',
    jobId,
    current: job.progress,
    total: job.total,
    phase: job.phase || 'Initializing...',
  };
  res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

  // If job is already complete, send complete event immediately
  if (job.status === 'complete' && job.result) {
    res.write(`data: ${JSON.stringify({ type: 'complete', jobId, result: job.result })}\n\n`);
    res.end();
    return;
  }

  // If job already errored, send error event immediately
  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', jobId, error: job.error })}\n\n`);
    res.end();
    return;
  }

  if (job.status === 'cancelled') {
    res.write(`data: ${JSON.stringify({ type: 'cancelled', jobId })}\n\n`);
    res.end();
    return;
  }

  const eventName = `job:${jobId}`;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let isClosed = false;

  const cleanup = () => {
    if (isClosed) {
      return;
    }

    isClosed = true;
    jobEventEmitter.off(eventName, eventHandler);
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    logger.debug(`SSE connection closed for job ${jobId}`);
  };

  // Subscribe to job events
  const eventHandler = (event: JobEvent) => {
    if (isClosed) {
      return;
    }

    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Close connection on complete or error
      if (event.type === 'complete' || event.type === 'error' || event.type === 'cancelled') {
        cleanup();
        res.end();
      }
    } catch (err) {
      cleanup();
      logger.debug(`SSE write error for job ${jobId}: ${err}`);
    }
  };

  jobEventEmitter.on(eventName, eventHandler);

  // Send heartbeat every 30s to keep connection alive
  heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      cleanup();
    }
  }, 30000);

  // Handle both client disconnects and terminal server events.
  req.on('close', cleanup);
});

// =============================================================================
// Helper Functions
// =============================================================================

function toPrompt(prompt: GenerationPromptInput): Prompt {
  if (typeof prompt === 'string') {
    return { raw: prompt, label: prompt };
  }

  return { raw: prompt.raw, label: prompt.label || prompt.raw };
}

function toPrompts(prompts: GenerationPromptInput[]): Prompt[] {
  return prompts.map(toPrompt);
}

function toPromptStrings(prompts: GenerationPromptInput[]): string[] {
  return prompts.map((prompt) => (typeof prompt === 'string' ? prompt : prompt.raw));
}

/**
 * Formats a job for API response.
 */
function formatJobResponse(job: GenerationJob): Record<string, unknown> {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    total: job.total,
    phase: job.phase || 'Initializing...',
    result: job.status === 'complete' ? job.result : undefined,
    error: job.status === 'error' ? job.error : undefined,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
