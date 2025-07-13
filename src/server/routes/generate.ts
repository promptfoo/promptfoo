import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../logger';
import { synthesizeFromTestSuite } from '../../testCase/synthesis';
import { synthesizeFromTestSuite as synthesizeAssertionsFromTestSuite } from '../../assertions/synthesis';
import type { Job, TestSuite, Assertion, VarMapping } from '../../types';

export const generateRouter = Router();

// Running generation jobs - shared between dataset and assertion generation
export const generationJobs = new Map<string, Job>();

interface GenerateDatasetOptions {
  numPersonas?: number;
  numTestCasesPerPersona?: number;
  instructions?: string;
  provider?: string;
  async?: boolean;
}

interface GenerateAssertionsOptions {
  numQuestions?: number;
  type?: 'pi' | 'g-eval' | 'llm-rubric';
  instructions?: string;
  provider?: string;
  async?: boolean;
}

// Dataset generation endpoint
generateRouter.post('/dataset', async (req: Request, res: Response): Promise<void> => {
  const { prompts, tests, options = {} } = req.body;
  const { async: isAsync = false, ...synthesisOptions } = options as GenerateDatasetOptions;

  const testSuite: TestSuite = {
    prompts: prompts || [],
    tests: tests || [],
    providers: [],
  };

  // Synchronous generation (backward compatibility)
  if (!isAsync) {
    try {
      const results = await synthesizeFromTestSuite(testSuite, synthesisOptions);
      res.json({ results });
    } catch (error) {
      logger.error(`Dataset generation error: ${error}`);
      res.status(500).json({ error: 'Failed to generate dataset' });
    }
    return;
  }

  // Async generation with job tracking
  const jobId = uuidv4();
  generationJobs.set(jobId, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: (synthesisOptions.numPersonas || 5) * (synthesisOptions.numTestCasesPerPersona || 3),
    result: null,
    logs: [],
  });

  // Run generation in background
  synthesizeFromTestSuite(testSuite, synthesisOptions)
    .then((results: VarMapping[]) => {
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.result = { results } as any; // Store results in a format compatible with the UI
        job.progress = job.total;
        logger.debug(`Dataset generation completed: ${results.length} test cases generated`);
      }
    })
    .catch((error) => {
      logger.error(`Dataset generation job ${jobId} failed: ${error}`);
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.logs.push(`Error: ${error.message || error}`);
      }
    });

  res.json({ id: jobId });
});

// Assertion generation endpoint
generateRouter.post('/assertions', async (req: Request, res: Response): Promise<void> => {
  const { prompts, tests, options = {} } = req.body;
  const { async: isAsync = false, ...synthesisOptions } = options as GenerateAssertionsOptions;

  const testSuite: TestSuite = {
    prompts: prompts || [],
    tests: tests || [],
    providers: [],
  };

  // Synchronous generation
  if (!isAsync) {
    try {
      const results = await synthesizeAssertionsFromTestSuite(testSuite, synthesisOptions);
      res.json({ results });
    } catch (error) {
      logger.error(`Assertion generation error: ${error}`);
      res.status(500).json({ error: 'Failed to generate assertions' });
    }
    return;
  }

  // Async generation with job tracking
  const jobId = uuidv4();
  generationJobs.set(jobId, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: synthesisOptions.numQuestions || 5,
    result: null,
    logs: [],
  });

  // Run generation in background
  synthesizeAssertionsFromTestSuite(testSuite, synthesisOptions)
    .then((results: Assertion[]) => {
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.result = { results } as any; // Store results in a format compatible with the UI
        job.progress = job.total;
        logger.debug(`Assertion generation completed: ${results.length} assertions generated`);
      }
    })
    .catch((error) => {
      logger.error(`Assertion generation job ${jobId} failed: ${error}`);
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.logs.push(`Error: ${error.message || error}`);
      }
    });

  res.json({ id: jobId });
});

// Job status endpoint - checks both eval jobs and generation jobs
generateRouter.get('/job/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  const job = generationJobs.get(id);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.status === 'complete') {
    res.json({
      status: 'complete',
      result: job.result,
      progress: job.progress,
      total: job.total,
      logs: job.logs,
    });
  } else if (job.status === 'error') {
    res.json({
      status: 'error',
      logs: job.logs,
    });
  } else {
    res.json({
      status: 'in-progress',
      progress: job.progress,
      total: job.total,
      logs: job.logs,
    });
  }
}); 