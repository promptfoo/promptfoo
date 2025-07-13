import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import logger from '../../logger';
import { synthesizeFromTestSuite } from '../../testCase/synthesis';
import { synthesizeFromTestSuite as synthesizeAssertionsFromTestSuite } from '../../assertions/synthesis';
import type { Job, TestSuite, Assertion, VarMapping } from '../../types';

export const generateRouter = Router();

// Running generation jobs - shared between dataset and assertion generation
export const generationJobs = new Map<string, Job>();

// Job retention settings
const JOB_RETENTION_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
const JOB_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// Cleanup old completed/errored jobs periodically
const cleanupOldJobs = () => {
  const now = Date.now();
  for (const [jobId, job] of generationJobs.entries()) {
    if (job.status === 'complete' || job.status === 'error') {
      // Check if job has a timestamp (we'll add this)
      const completedAt = (job as any).completedAt;
      if (completedAt && now - completedAt > JOB_RETENTION_TIME) {
        generationJobs.delete(jobId);
        logger.debug(`Cleaned up old job ${jobId}`);
      }
    }
  }
};

// Start cleanup interval
const cleanupInterval = setInterval(cleanupOldJobs, JOB_CLEANUP_INTERVAL);

// Cleanup on process exit
process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
  process.exit();
});

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limiting middleware
const checkRateLimit = (req: Request, res: Response): boolean => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  const rateLimit = rateLimitMap.get(clientIp);
  
  if (!rateLimit || now > rateLimit.resetTime) {
    // New window or expired window
    rateLimitMap.set(clientIp, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }
  
  if (rateLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((rateLimit.resetTime - now) / 1000);
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      retryAfter,
    });
    return false;
  }
  
  rateLimit.count++;
  return true;
};

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

// Caching configuration
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of cached results
const generationCache = new Map<string, { result: any; timestamp: number }>();

// Generate cache key from request parameters
const getCacheKey = (type: 'dataset' | 'assertions', testSuite: TestSuite, options: any): string => {
  const cacheObject = {
    type,
    prompts: testSuite.prompts,
    tests: testSuite.tests,
    options,
  };
  return crypto.createHash('sha256').update(JSON.stringify(cacheObject)).digest('hex');
};

// Get cached result if available
const getCachedResult = (key: string): any | null => {
  const cached = generationCache.get(key);
  if (cached) {
    const now = Date.now();
    if (now - cached.timestamp < CACHE_TTL) {
      logger.debug(`Cache hit for generation key: ${key}`);
      return cached.result;
    } else {
      // Expired
      generationCache.delete(key);
    }
  }
  return null;
};

// Store result in cache
const setCachedResult = (key: string, result: any): void => {
  // Enforce max cache size
  if (generationCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const oldestKey = Array.from(generationCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    generationCache.delete(oldestKey);
  }
  
  generationCache.set(key, {
    result,
    timestamp: Date.now(),
  });
  logger.debug(`Cached generation result with key: ${key}`);
};

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of generationCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      generationCache.delete(key);
    }
  }
}, CACHE_TTL / 2);

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
  // Check rate limit
  if (!checkRateLimit(req, res)) {
    return;
  }
  
  const { prompts, tests, options = {} } = req.body;
  const { async: isAsync = false, ...synthesisOptions } = options as GenerateDatasetOptions;

  const testSuite: TestSuite = {
    prompts: prompts || [],
    tests: tests || [],
    providers: [],
  };

  // Check cache first
  const cacheKey = getCacheKey('dataset', testSuite, synthesisOptions);
  const cachedResult = getCachedResult(cacheKey);
  
  // Synchronous generation (backward compatibility)
  if (!isAsync) {
    if (cachedResult) {
      res.json({ results: cachedResult });
      return;
    }
    
    try {
      const results = await synthesizeFromTestSuite(testSuite, synthesisOptions);
      setCachedResult(cacheKey, results);
      res.json({ results });
    } catch (error) {
      logger.error(`Dataset generation error: ${error}`);
      res.status(500).json({ error: 'Failed to generate dataset' });
    }
    return;
  }

  // Async generation with job tracking
  const jobId = uuidv4();
  const jobTotal = (synthesisOptions.numPersonas || 5) * (synthesisOptions.numTestCasesPerPersona || 3);
  
  // If we have cached results, complete the job immediately
  if (cachedResult) {
    generationJobs.set(jobId, {
      evalId: null,
      status: 'complete',
      progress: jobTotal,
      total: jobTotal,
      result: { results: cachedResult } as any,
      logs: ['Using cached results'],
      completedAt: Date.now(),
    } as any);
    res.json({ id: jobId });
    return;
  }
  
  generationJobs.set(jobId, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: jobTotal,
    result: null,
    logs: [],
  });

  // Run generation in background
  synthesizeFromTestSuite(testSuite, synthesisOptions)
    .then((results: VarMapping[]) => {
      setCachedResult(cacheKey, results);
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.result = { results } as any; // Store results in a format compatible with the UI
        job.progress = job.total;
        (job as any).completedAt = Date.now();
        logger.debug(`Dataset generation completed: ${results.length} test cases generated`);
      }
    })
    .catch((error) => {
      logger.error(`Dataset generation job ${jobId} failed: ${error}`);
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.logs.push(`Error: ${error.message || error}`);
        (job as any).completedAt = Date.now();
      }
    });

  res.json({ id: jobId });
});

// Assertion generation endpoint
generateRouter.post('/assertions', async (req: Request, res: Response): Promise<void> => {
  // Check rate limit
  if (!checkRateLimit(req, res)) {
    return;
  }
  
  const { prompts, tests, options = {} } = req.body;
  const { async: isAsync = false, ...synthesisOptions } = options as GenerateAssertionsOptions;

  const testSuite: TestSuite = {
    prompts: prompts || [],
    tests: tests || [],
    providers: [],
  };

  // Check cache first
  const cacheKey = getCacheKey('assertions', testSuite, synthesisOptions);
  const cachedResult = getCachedResult(cacheKey);
  
  // Synchronous generation
  if (!isAsync) {
    if (cachedResult) {
      res.json({ results: cachedResult });
      return;
    }
    
    try {
      const results = await synthesizeAssertionsFromTestSuite(testSuite, synthesisOptions);
      setCachedResult(cacheKey, results);
      res.json({ results });
    } catch (error) {
      logger.error(`Assertion generation error: ${error}`);
      res.status(500).json({ error: 'Failed to generate assertions' });
    }
    return;
  }

  // Async generation with job tracking
  const jobId = uuidv4();
  const jobTotal = synthesisOptions.numQuestions || 5;
  
  // If we have cached results, complete the job immediately
  if (cachedResult) {
    generationJobs.set(jobId, {
      evalId: null,
      status: 'complete',
      progress: jobTotal,
      total: jobTotal,
      result: { results: cachedResult } as any,
      logs: ['Using cached results'],
      completedAt: Date.now(),
    } as any);
    res.json({ id: jobId });
    return;
  }
  
  generationJobs.set(jobId, {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: jobTotal,
    result: null,
    logs: [],
  });

  // Run generation in background
  synthesizeAssertionsFromTestSuite(testSuite, synthesisOptions)
    .then((results: Assertion[]) => {
      setCachedResult(cacheKey, results);
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.result = { results } as any; // Store results in a format compatible with the UI
        job.progress = job.total;
        (job as any).completedAt = Date.now();
        logger.debug(`Assertion generation completed: ${results.length} assertions generated`);
      }
    })
    .catch((error) => {
      logger.error(`Assertion generation job ${jobId} failed: ${error}`);
      const job = generationJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.logs.push(`Error: ${error.message || error}`);
        (job as any).completedAt = Date.now();
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
