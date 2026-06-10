import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../../../src/envars';
import {
  analyzeCoverage,
  extractRequirements,
  generateAssertions,
  validateAssertions,
} from '../../../src/generation/assertions';
import {
  extractConcepts,
  generateDataset,
  measureDiversity,
} from '../../../src/generation/dataset';
import { generateTestSuite } from '../../../src/generation/index';
import {
  completeJob,
  createJob,
  failJob,
  generationJobs,
  getJobAbortSignal,
  jobEventEmitter,
} from '../../../src/generation/shared/jobManager';
import { getDefaultProviders } from '../../../src/providers/defaults';
import { generationRouter } from '../../../src/server/routes/generation';

vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn(),
}));

vi.mock('../../../src/generation/assertions', () => ({
  analyzeCoverage: vi.fn(),
  extractRequirements: vi.fn(),
  generateAssertions: vi.fn(),
  validateAssertions: vi.fn(),
}));

vi.mock('../../../src/generation/dataset', () => ({
  extractConcepts: vi.fn(),
  generateDataset: vi.fn(),
  measureDiversity: vi.fn(),
}));

vi.mock('../../../src/generation/index', () => ({
  generateTestSuite: vi.fn(),
}));

vi.mock('../../../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn().mockResolvedValue({
    synthesizeProvider: {
      id: () => 'route-provider',
      callApi: vi.fn(),
    },
  }),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    level: 'info',
    child: vi.fn().mockReturnValue({}),
  },
}));

function createRouteApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/generation', generationRouter);
  return app;
}

describe('generation routes', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createRouteApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    generationJobs.clear();
    vi.mocked(getEnvString).mockReturnValue(undefined as never);
    vi.mocked(getDefaultProviders).mockResolvedValue({
      synthesizeProvider: {
        id: () => 'route-provider',
        callApi: vi.fn(),
      },
    } as never);
    vi.mocked(generateDataset).mockResolvedValue({
      testCases: [{ city: 'Paris' }],
      metadata: { totalGenerated: 1, durationMs: 1, provider: 'dataset' },
    } as never);
    vi.mocked(generateAssertions).mockResolvedValue({
      assertions: [{ type: 'contains', value: 'Paris' }],
      metadata: { totalGenerated: 1, pythonConverted: 0, durationMs: 1, provider: 'assertions' },
    } as never);
    vi.mocked(generateTestSuite).mockResolvedValue({
      dataset: {
        testCases: [],
        metadata: { totalGenerated: 0, durationMs: 0, provider: 'dataset' },
      },
      assertions: {
        assertions: [],
        metadata: { totalGenerated: 0, pythonConverted: 0, durationMs: 0, provider: 'assertions' },
      },
      metadata: { totalDurationMs: 0, provider: 'combined' },
    } as never);
    vi.mocked(extractConcepts).mockResolvedValue({
      topics: [],
      entities: [],
      constraints: [],
      variableRelationships: [],
    } as never);
    vi.mocked(measureDiversity).mockResolvedValue({
      score: 1,
      averageDistance: 1,
      minDistance: 1,
      maxDistance: 1,
    } as never);
    vi.mocked(extractRequirements).mockResolvedValue([{ text: 'Return JSON' }] as never);
    vi.mocked(analyzeCoverage).mockResolvedValue({
      requirements: [],
      overallScore: 1,
      gaps: [],
    } as never);
    vi.mocked(validateAssertions).mockResolvedValue([{ accuracy: 1 }] as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
    generationJobs.clear();
    jobEventEmitter.removeAllListeners();
  });

  it('reports capabilities and validates request bodies', async () => {
    vi.mocked(getEnvString).mockReturnValue('secret');

    await api.get('/api/generation/capabilities').expect(200, {
      success: true,
      data: { hasPiAccess: true, defaultAssertionType: 'pi' },
    });
    await api.post('/api/generation/dataset/generate').send({}).expect(400);
    await api.post('/api/generation/assertions/generate').send({}).expect(400);
    await api.post('/api/generation/tests/generate').send({}).expect(400);
    await api.post('/api/generation/dataset/analyze-concepts').send({}).expect(400);
    await api.post('/api/generation/dataset/measure-diversity').send({}).expect(400);
    await api.post('/api/generation/assertions/analyze-coverage').send({}).expect(400);
    await api.post('/api/generation/assertions/validate').send({}).expect(400);
    await api
      .post('/api/generation/assertions/generate')
      .send({ prompts: ['Prompt'], tests: [{ assert: [{ value: 'missing type' }] }] })
      .expect(400);
    await api
      .post('/api/generation/assertions/analyze-coverage')
      .send({ prompts: ['Prompt'], assertions: [{ value: 'missing type' }] })
      .expect(400);
    await api
      .post('/api/generation/assertions/validate')
      .send({
        assertions: [{ value: 'missing type' }],
        samples: [{ output: 'JSON', expectedPass: true }],
      })
      .expect(400);
  });

  it('starts dataset, assertion, and combined generation jobs and exposes job lookups', async () => {
    const dataset = await api
      .post('/api/generation/dataset/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(200);
    const assertions = await api
      .post('/api/generation/assertions/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(200);
    const combined = await api
      .post('/api/generation/tests/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(200);

    await Promise.resolve();
    await Promise.resolve();

    expect(dataset.body.data.jobId).toBeTypeOf('string');
    expect(assertions.body.data.jobId).toBeTypeOf('string');
    expect(combined.body.data.jobId).toBeTypeOf('string');

    const datasetCallbacks = vi.mocked(generateDataset).mock.calls[0]?.[3] as
      | {
          abortSignal?: AbortSignal;
          onProgress?: (current: number, total: number, phase: string) => void;
        }
      | undefined;
    const assertionCallbacks = vi.mocked(generateAssertions).mock.calls[0]?.[3] as
      | {
          abortSignal?: AbortSignal;
          onProgress?: (current: number, total: number, phase: string) => void;
        }
      | undefined;
    const combinedCallbacks = vi.mocked(generateTestSuite).mock.calls[0]?.[3] as
      | {
          abortSignal?: AbortSignal;
          onProgress?: (current: number, total: number, phase: string) => void;
        }
      | undefined;

    datasetCallbacks?.onProgress?.(1, 3, 'Dataset phase');
    assertionCallbacks?.onProgress?.(2, 4, 'Assertion phase');
    combinedCallbacks?.onProgress?.(3, 5, 'Combined phase');

    expect(datasetCallbacks?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(assertionCallbacks?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(combinedCallbacks?.abortSignal).toBeInstanceOf(AbortSignal);

    await api
      .get(`/api/generation/dataset/job/${dataset.body.data.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          progress: 1,
          total: 3,
          phase: 'Dataset phase',
          status: 'in-progress',
        });
      });
    await api
      .get(`/api/generation/assertions/job/${assertions.body.data.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          progress: 2,
          total: 4,
          phase: 'Assertion phase',
          status: 'in-progress',
        });
      });
    await api
      .get(`/api/generation/tests/job/${combined.body.data.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          progress: 3,
          total: 5,
          phase: 'Combined phase',
          status: 'in-progress',
        });
      });
    await api.get('/api/generation/dataset/job/missing').expect(404);
    await api.get('/api/generation/assertions/job/missing').expect(404);
    await api.get('/api/generation/tests/job/missing').expect(404);
  });

  it('cancels active jobs and aborts their provider signal', async () => {
    const job = createJob('dataset');
    const signal = getJobAbortSignal(job.id);

    await api
      .post(`/api/generation/jobs/${job.id}/cancel`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          id: job.id,
          status: 'cancelled',
          phase: 'Cancelled',
        });
      });

    expect(signal?.aborted).toBe(true);
    await api.post('/api/generation/jobs/missing/cancel').expect(404);
  });

  it('returns synchronous analysis results and lists filtered jobs', async () => {
    await api
      .post('/api/generation/dataset/analyze-concepts')
      .send({ prompts: ['Prompt'] })
      .expect(200);
    await api
      .post('/api/generation/dataset/measure-diversity')
      .send({ testCases: [{ city: 'Paris' }] })
      .expect(200);
    await api
      .post('/api/generation/assertions/analyze-coverage')
      .send({ prompts: ['Prompt'], assertions: [{ type: 'contains', value: 'JSON' }] })
      .expect(200);
    await api
      .post('/api/generation/assertions/validate')
      .send({
        assertions: [{ type: 'contains', value: 'JSON' }],
        samples: [{ output: 'JSON', expectedPass: true }],
      })
      .expect(200);

    const datasetJob = createJob('dataset');
    completeJob(datasetJob.id, {
      testCases: [],
      metadata: { totalGenerated: 0, durationMs: 0, provider: 'dataset' },
    });
    const assertionJob = createJob('assertions');
    failJob(assertionJob.id, 'failed');

    const allJobs = await api.get('/api/generation/jobs').expect(200);
    const filteredJobs = await api
      .get('/api/generation/jobs?type=dataset&status=complete')
      .expect(200);

    expect(allJobs.body.data.jobs).toHaveLength(2);
    expect(filteredJobs.body.data.jobs).toEqual([
      expect.objectContaining({ id: datasetJob.id, status: 'complete' }),
    ]);
  });

  it('surfaces async generation failures and sync route exceptions as server errors', async () => {
    vi.mocked(generateDataset).mockRejectedValueOnce(new Error('dataset failed'));
    vi.mocked(extractConcepts).mockRejectedValueOnce(new Error('concept failed'));

    const dataset = await api
      .post('/api/generation/dataset/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(200);
    await Promise.resolve();
    await Promise.resolve();

    await api
      .get(`/api/generation/dataset/job/${dataset.body.data.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          status: 'error',
          error: 'Dataset generation failed',
        });
      });
    await api
      .post('/api/generation/dataset/analyze-concepts')
      .send({ prompts: ['Prompt'] })
      .expect(500, { error: 'Failed to analyze concepts' });
  });

  it('covers assertion and combined route failures plus synchronous starter exceptions', async () => {
    vi.mocked(generateAssertions).mockRejectedValueOnce(new Error('assertions failed'));
    vi.mocked(generateTestSuite).mockRejectedValueOnce(new Error('combined failed'));

    const assertions = await api
      .post('/api/generation/assertions/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(200);
    const combined = await api
      .post('/api/generation/tests/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(200);

    await Promise.resolve();
    await Promise.resolve();

    await api
      .get(`/api/generation/assertions/job/${assertions.body.data.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          status: 'error',
          error: 'Assertion generation failed',
        });
      });
    await api
      .get(`/api/generation/tests/job/${combined.body.data.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.job).toMatchObject({
          status: 'error',
          error: 'Test suite generation failed',
        });
      });

    vi.mocked(generateDataset).mockImplementationOnce(() => {
      throw new Error('dataset sync');
    });
    vi.mocked(generateAssertions).mockImplementationOnce(() => {
      throw new Error('assertions sync');
    });
    vi.mocked(generateTestSuite).mockImplementationOnce(() => {
      throw new Error('combined sync');
    });

    await api
      .post('/api/generation/dataset/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(500, { error: 'Failed to start dataset generation' });
    await api
      .post('/api/generation/assertions/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(500, { error: 'Failed to start assertion generation' });
    await api
      .post('/api/generation/tests/generate')
      .send({ prompts: [{ raw: 'Prompt' }] })
      .expect(500, { error: 'Failed to start test suite generation' });

    vi.mocked(analyzeCoverage).mockRejectedValueOnce(new Error('coverage failed'));
    vi.mocked(validateAssertions).mockRejectedValueOnce(new Error('validation failed'));

    await api
      .post('/api/generation/assertions/analyze-coverage')
      .send({ prompts: ['Prompt'], assertions: [{ type: 'contains', value: 'JSON' }] })
      .expect(500, { error: 'Failed to analyze assertion coverage' });
    await api
      .post('/api/generation/assertions/validate')
      .send({
        assertions: [{ type: 'contains', value: 'JSON' }],
        samples: [{ output: 'JSON', expectedPass: true }],
      })
      .expect(500, { error: 'Failed to validate assertions' });
  });

  it('streams missing, completed, failed, and live generation jobs', async () => {
    await api.get('/api/generation/stream/missing').expect(404);

    const complete = createJob('dataset');
    completeJob(complete.id, {
      testCases: [],
      metadata: { totalGenerated: 0, durationMs: 0, provider: 'dataset' },
    });
    await api
      .get(`/api/generation/stream/${complete.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('"type":"progress"');
        expect(response.text).toContain('"type":"complete"');
      });

    const failed = createJob('dataset');
    failJob(failed.id, 'stream failed');
    await api
      .get(`/api/generation/stream/${failed.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain('"type":"error"');
      });
  });

  it('cleans up a live SSE listener immediately when generation completes', async () => {
    const job = createJob('dataset');
    const address = server.address() as AddressInfo;
    const eventName = `job:${job.id}`;

    await new Promise<void>((resolve, reject) => {
      const streamRequest = httpGet(
        `http://127.0.0.1:${address.port}/api/generation/stream/${job.id}`,
        (response) => {
          let completed = false;
          response.setEncoding('utf8');
          response.once('data', () => {
            try {
              expect(jobEventEmitter.listenerCount(eventName)).toBe(1);
              completeJob(job.id, {
                testCases: [],
                metadata: { totalGenerated: 0, durationMs: 0, provider: 'dataset' },
              });
              expect(jobEventEmitter.listenerCount(eventName)).toBe(0);
              completed = true;
            } catch (error) {
              streamRequest.destroy();
              reject(error);
            }
          });
          response.on('end', () => {
            if (!completed) {
              reject(new Error('SSE connection ended before completion was sent'));
              return;
            }
            resolve();
          });
          response.on('error', reject);
        },
      );
      streamRequest.on('error', reject);
    });
  });
});
