import { Router } from 'express';
import { z } from 'zod';
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
  completeJob,
  createJob,
  failJob,
  getJob,
  jobEventEmitter,
  listJobs,
} from '../../generation/shared/jobManager';
import {
  AssertionGenerationOptionsSchema,
  DatasetGenerationOptionsSchema,
  TestSuiteGenerationOptionsSchema,
} from '../../generation/types';
import logger from '../../logger';
import type { Request, Response } from 'express';

import type { JobEvent } from '../../generation/shared/jobManager';
import type { GenerationJob, GenerationJobType } from '../../generation/types';
import type { Assertion, Prompt, TestCase } from '../../types';

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
// Request Validation Schemas
// =============================================================================

const PromptInputSchema = z.object({
  raw: z.string(),
  label: z.string().optional(),
});

const TestCaseInputSchema = z.object({
  vars: z.record(z.string(), z.any()).optional(),
  assert: z.array(z.any()).optional(),
  description: z.string().optional(),
});

const DatasetGenerateRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  tests: z.array(TestCaseInputSchema).optional().default([]),
  options: DatasetGenerationOptionsSchema.partial().optional(),
});

const AssertionsGenerateRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  tests: z.array(TestCaseInputSchema).optional().default([]),
  options: AssertionGenerationOptionsSchema.partial().optional(),
});

const AnalyzeConceptsRequestSchema = z.object({
  prompts: z.array(z.string()).min(1),
  options: z
    .object({
      maxTopics: z.number().optional(),
      maxEntities: z.number().optional(),
    })
    .optional(),
});

const MeasureDiversityRequestSchema = z.object({
  testCases: z.array(z.record(z.string(), z.string())).min(1),
});

const AnalyzeCoverageRequestSchema = z.object({
  prompts: z.array(z.string()).min(1),
  assertions: z.array(z.any()).min(1),
});

const ValidateAssertionsRequestSchema = z.object({
  assertions: z.array(z.any()).min(1),
  samples: z
    .array(
      z.object({
        output: z.string(),
        expectedPass: z.boolean(),
      }),
    )
    .min(1),
});

const TestsGenerateRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  tests: z.array(TestCaseInputSchema).optional().default([]),
  options: TestSuiteGenerationOptionsSchema.partial().optional(),
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
    const parseResult = DatasetGenerateRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const { prompts, tests, options } = parseResult.data;

    // Create job
    const job = createJob('dataset');

    // Start generation in background with jobId for streaming
    generateDataset(prompts as Prompt[], tests as TestCase[], options || {}, {
      jobId: job.id, // Pass jobId for SSE streaming
      onProgress: (current, total, phase) => {
        const existingJob = getJob(job.id);
        if (existingJob) {
          existingJob.progress = current;
          existingJob.total = total;
          existingJob.phase = phase;
          existingJob.status = 'in-progress';
        }
      },
    })
      .then((result) => {
        completeJob(job.id, result);
        logger.info(`Dataset generation job ${job.id} completed`);
      })
      .catch((error) => {
        failJob(job.id, error);
        logger.error(`Dataset generation job ${job.id} failed: ${error}`);
      });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    logger.error(`Dataset generation request failed: ${error}`);
    res.status(500).json({ success: false, error: String(error) });
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
      const parseResult = AnalyzeConceptsRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
        return;
      }

      const { prompts, options } = parseResult.data;
      const { getDefaultProviders } = await import('../../providers/defaults');
      const provider = (await getDefaultProviders()).synthesizeProvider;

      const concepts = await extractConcepts(prompts, provider, options);

      res.json({ success: true, data: { concepts } });
    } catch (error) {
      logger.error(`Concept analysis failed: ${error}`);
      res.status(500).json({ success: false, error: String(error) });
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
      const parseResult = MeasureDiversityRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
        return;
      }

      const { testCases } = parseResult.data;
      const diversity = await measureDiversity(testCases);

      res.json({ success: true, data: { diversity } });
    } catch (error) {
      logger.error(`Diversity measurement failed: ${error}`);
      res.status(500).json({ success: false, error: String(error) });
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
    const parseResult = AssertionsGenerateRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const { prompts, tests, options } = parseResult.data;

    // Create job
    const job = createJob('assertions');

    // Start generation in background with jobId for streaming
    generateAssertions(prompts as Prompt[], tests as TestCase[], options || {}, {
      jobId: job.id, // Pass jobId for SSE streaming
      onProgress: (current, total, phase) => {
        const existingJob = getJob(job.id);
        if (existingJob) {
          existingJob.progress = current;
          existingJob.total = total;
          existingJob.phase = phase;
          existingJob.status = 'in-progress';
        }
      },
    })
      .then((result) => {
        completeJob(job.id, result);
        logger.info(`Assertion generation job ${job.id} completed`);
      })
      .catch((error) => {
        failJob(job.id, error);
        logger.error(`Assertion generation job ${job.id} failed: ${error}`);
      });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    logger.error(`Assertion generation request failed: ${error}`);
    res.status(500).json({ success: false, error: String(error) });
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
      const parseResult = AnalyzeCoverageRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
        return;
      }

      const { prompts, assertions } = parseResult.data;
      const { getDefaultProviders } = await import('../../providers/defaults');
      const provider = (await getDefaultProviders()).synthesizeProvider;

      const requirements = await extractRequirements(prompts, provider);
      const coverage = await analyzeCoverage(requirements, assertions as Assertion[]);

      res.json({ success: true, data: { coverage } });
    } catch (error) {
      logger.error(`Coverage analysis failed: ${error}`);
      res.status(500).json({ success: false, error: String(error) });
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
      const parseResult = ValidateAssertionsRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
        return;
      }

      const { assertions, samples } = parseResult.data;
      const { getDefaultProviders } = await import('../../providers/defaults');
      const provider = (await getDefaultProviders()).synthesizeProvider;

      const validation = await validateAssertions(assertions as Assertion[], samples, provider);

      res.json({ success: true, data: { validation } });
    } catch (error) {
      logger.error(`Assertion validation failed: ${error}`);
      res.status(500).json({ success: false, error: String(error) });
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
    const parseResult = TestsGenerateRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const { prompts, tests, options } = parseResult.data;

    // Create job with 'combined' type
    const job = createJob('combined');

    // Start generation in background
    generateTestSuite(prompts as Prompt[], tests as TestCase[], options || {}, {
      onProgress: (current, total, phase) => {
        const existingJob = getJob(job.id);
        if (existingJob) {
          existingJob.progress = current;
          existingJob.total = total;
          existingJob.phase = phase;
          existingJob.status = 'in-progress';
        }
      },
    })
      .then((result) => {
        completeJob(job.id, result);
        logger.info(`Test suite generation job ${job.id} completed`);
      })
      .catch((error) => {
        failJob(job.id, error);
        logger.error(`Test suite generation job ${job.id} failed: ${error}`);
      });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (error) {
    logger.error(`Test suite generation request failed: ${error}`);
    res.status(500).json({ success: false, error: String(error) });
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
    status === 'error'
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

  // Subscribe to job events
  const eventHandler = (event: JobEvent) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Close connection on complete or error
      if (event.type === 'complete' || event.type === 'error') {
        res.end();
      }
    } catch (err) {
      logger.debug(`SSE write error for job ${jobId}: ${err}`);
    }
  };

  jobEventEmitter.on(`job:${jobId}`, eventHandler);

  // Handle client disconnect
  req.on('close', () => {
    logger.debug(`SSE connection closed for job ${jobId}`);
    jobEventEmitter.off(`job:${jobId}`, eventHandler);
  });

  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

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
