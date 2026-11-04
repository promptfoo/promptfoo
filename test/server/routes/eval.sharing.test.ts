import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestServer } from '../../util/testServer';

// Mock dependencies BEFORE imports
vi.mock('../../../src/node', () => ({
  evaluateWithSource: vi.fn().mockResolvedValue({
    toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
  }),
}));

vi.mock('../../../src/util/sharing', () => ({
  shouldShareResults: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/models/eval', () => ({
  default: {
    create: vi.fn(),
    findById: vi.fn(),
  },
}));
vi.mock('../../../src/globalConfig/accounts');

import logger, { globalLogCallback, setLogCallback } from '../../../src/logger';
import Eval from '../../../src/models/eval';
import { evaluateWithSource } from '../../../src/node';
import { createApp } from '../../../src/server/server';
import { shouldShareResults } from '../../../src/util/sharing';

const originalLogError = logger.error.bind(logger);
const errorSpy = vi.spyOn(logger, 'error');
const mockedEvalCreate = vi.mocked(Eval.create);
const mockedEvalFindById = vi.mocked(Eval.findById);
const mockedEvaluateWithSource = vi.mocked(evaluateWithSource);
const mockedShouldShareResults = vi.mocked(shouldShareResults);

describe('Eval Routes - Sharing behavior', () => {
  const api = setupTestServer(createApp);

  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy.mockClear();

    mockedEvaluateWithSource.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    } as any);

    mockedShouldShareResults.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const postJob = (body: Record<string, unknown>) => api.post('/api/eval/job').send(body);

  const minimalTestSuite = {
    prompts: ['test prompt'],
    providers: ['echo'],
    tests: [{ vars: { input: 'test' } }],
  };

  const captureStreamedLogs = () => {
    const previous = globalLogCallback;
    const messages: string[] = [];
    errorSpy.mockImplementation(originalLogError);
    setLogCallback((message) => messages.push(message));
    logger.error('Public callback control');
    expect(messages).toEqual(['Public callback control']);
    messages.length = 0;
    return { messages, restore: () => setLogCallback(previous) };
  };

  it('does not let a job request change the server file-resolution directory', async () => {
    await postJob({ ...minimalTestSuite, basePath: '/' }).expect(200);
    expect(mockedEvaluateWithSource).toHaveBeenCalledOnce();
    expect(mockedEvaluateWithSource.mock.calls[0][0]).not.toHaveProperty('basePath');
  });

  it.each([undefined, '/untrusted/request/path'])(
    'restores the saved base path for rerun jobs (request path: %s)',
    async (basePath) => {
      mockedEvalFindById.mockResolvedValueOnce({ config: { basePath: '/saved/config' } } as Eval);
      await postJob({ ...minimalTestSuite, sourceEvalId: 'saved-eval', basePath }).expect(200);
      expect(mockedEvaluateWithSource.mock.calls[0][0]).toMatchObject({
        basePath: '/saved/config',
      });
    },
  );

  it('does not accept a request path when the source eval is missing', async () => {
    mockedEvalFindById.mockResolvedValueOnce(undefined);
    await postJob({
      ...minimalTestSuite,
      sourceEvalId: 'missing-eval',
      basePath: '/untrusted',
    }).expect(200);
    expect(mockedEvaluateWithSource.mock.calls[0][0]).not.toHaveProperty('basePath');
  });

  it('should use testSuite.sharing when explicitly set to true', async () => {
    await postJob({ ...minimalTestSuite, sharing: true });

    // Wait for async evaluate call
    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluateWithSource.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(true);
  });

  it('should use testSuite.sharing when explicitly set to false', async () => {
    mockedShouldShareResults.mockReturnValue(true);

    await postJob({ ...minimalTestSuite, sharing: false });

    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluateWithSource.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(false);
  });

  it('should fall back to shouldShareResults when testSuite.sharing is undefined', async () => {
    mockedShouldShareResults.mockReturnValue(true);

    await postJob(minimalTestSuite);

    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluateWithSource.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(true);
    expect(mockedShouldShareResults).toHaveBeenCalledWith({});
  });

  it('does not publish completion before saved results are ready', async () => {
    let resolveSummary: ((summary: { results: never[] }) => void) | undefined;
    mockedEvaluateWithSource.mockResolvedValueOnce({
      id: 'eval-result-id',
      toEvaluateSummary: vi.fn(
        () =>
          new Promise<{ results: never[] }>((resolve) => {
            resolveSummary = resolve;
          }),
      ),
    } as any);

    const createResponse = await postJob(minimalTestSuite);
    const jobId = createResponse.body.id;

    await vi.waitFor(() => {
      expect(resolveSummary).toBeDefined();
    });

    const inProgressResponse = await api.get(`/api/eval/job/${jobId}`);
    expect(inProgressResponse.body).toEqual({
      status: 'in-progress',
      progress: 0,
      total: 0,
      logs: [],
    });

    resolveSummary!({ results: [] });

    await vi.waitFor(async () => {
      const completedResponse = await api.get(`/api/eval/job/${jobId}`);
      expect(completedResponse.body).toEqual({
        status: 'complete',
        evalId: 'eval-result-id',
        result: { results: [] },
        logs: [],
      });
    });
  });

  it('publishes progress updates while a job is running', async () => {
    let resolveEvaluation: ((value: any) => void) | undefined;
    mockedEvaluateWithSource.mockImplementationOnce(
      (_testSuite, options) =>
        new Promise((resolve) => {
          options?.progressCallback?.(2, 5, 0, {} as never, {} as never);
          resolveEvaluation = resolve;
        }),
    );

    const createResponse = await postJob(minimalTestSuite);
    const jobId = createResponse.body.id;

    const inProgressResponse = await api.get(`/api/eval/job/${jobId}`);
    expect(inProgressResponse.body).toMatchObject({
      status: 'in-progress',
      progress: 2,
      total: 5,
    });

    resolveEvaluation!({
      id: 'eval-result-id',
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    });

    await vi.waitFor(async () => {
      const completedResponse = await api.get(`/api/eval/job/${jobId}`);
      expect(completedResponse.body.status).toBe('complete');
    });
  });

  it('flips status to error when toEvaluateSummary rejects', async () => {
    mockedEvaluateWithSource.mockResolvedValueOnce({
      id: 'eval-result-id',
      toEvaluateSummary: vi.fn().mockRejectedValue(new Error('summary boom')),
    } as any);

    const createResponse = await postJob(minimalTestSuite);
    const jobId = createResponse.body.id;

    await vi.waitFor(async () => {
      const response = await api.get(`/api/eval/job/${jobId}`);
      expect(response.body).toEqual({
        status: 'error',
        logs: ['Error: summary boom'],
      });
    });
  });

  it.runIf(process.platform !== 'win32').each([
    ['missing', 'unavailable'],
    ['invalid JSON', 'invalid-json'],
    ['array', 'invalid-result'],
    ['string', 'invalid-result'],
    ['number', 'invalid-result'],
    ['boolean', 'invalid-result'],
  ])('returns a generic JSON error for a %s snapshot', async (failure, category) => {
    mockedEvaluateWithSource.mockResolvedValueOnce({
      id: 'eval-result-id',
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    } as any);
    const open = vi.spyOn(fs, 'openSync');
    let snapshotPath: string | undefined;
    let original: string | undefined;
    let streamed: ReturnType<typeof captureStreamedLogs> | undefined;
    try {
      const created = await postJob(minimalTestSuite);
      const jobUrl = `/api/eval/job/${created.body.id}`;
      await vi.waitFor(async () => {
        expect((await api.get(jobUrl)).body).toMatchObject({ status: 'complete' });
      });
      snapshotPath = open.mock.calls.find(
        ([file]) => typeof file === 'string' && file.includes('promptfoo-job-results-'),
      )?.[0] as string;
      expect(snapshotPath).toBeDefined();
      original = fs.readFileSync(snapshotPath, 'utf8');
      if (failure === 'missing') {
        fs.unlinkSync(snapshotPath);
      } else {
        const contents: Record<string, string> = {
          'invalid JSON': 'private malformed snapshot',
          array: '[]',
          string: '"private snapshot text"',
          number: '42',
          boolean: 'true',
        };
        fs.writeFileSync(snapshotPath, contents[failure]);
      }

      streamed = captureStreamedLogs();
      const response = await api.get(jobUrl).expect(500);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toEqual({ error: 'Failed to load eval job' });
      expect(errorSpy).toHaveBeenCalledWith('Failed to load eval job', { error: { category } });
      expect(streamed.messages.join('\n')).toContain('Failed to load eval job');
      expect(response.text).not.toContain(snapshotPath);
      expect(response.text).not.toContain('private malformed snapshot');
      expect(streamed.messages.join('\n')).not.toMatch(
        /ZodError|SyntaxError|private|readResult|ENOENT/,
      );
      fs.writeFileSync(snapshotPath, original, { mode: 0o600 });
      expect((await api.get(jobUrl).expect(200)).body).toMatchObject({
        status: 'complete',
        result: { results: [] },
      });
    } finally {
      streamed?.restore();
      open.mockRestore();
      if (snapshotPath && original) {
        fs.writeFileSync(snapshotPath, original, { mode: 0o600 });
      }
    }
  });

  it.runIf(process.platform !== 'win32')(
    'publishes a job failure without storage paths when saving its snapshot fails',
    async () => {
      const streamed = captureStreamedLogs();
      const write = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOSPC /private/snapshot/path'), {
          code: 'ENOSPC',
          path: '/private/snapshot/path',
        });
      });
      try {
        const created = await postJob(minimalTestSuite);
        await vi.waitFor(async () => {
          const response = await api.get(`/api/eval/job/${created.body.id}`).expect(200);
          expect(response.body).toMatchObject({
            status: 'error',
            logs: ['Error: Failed to store eval job result snapshot'],
          });
          expect(response.text).not.toContain('/private/snapshot/path');
        });
        expect(streamed.messages.join('\n')).not.toContain('/private/snapshot/path');
      } finally {
        streamed.restore();
        write.mockRestore();
      }
    },
  );

  it('should not log the raw job body on evaluation failure', async () => {
    mockedEvaluateWithSource.mockRejectedValueOnce(new Error('boom'));

    const sensitiveBody = {
      prompts: ['test prompt'],
      providers: ['echo'],
      tests: [{ vars: { input: 'secret value', apiKey: 'sk-test-12345678901234567890' } }],
    };

    await postJob(sensitiveBody);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to eval tests',
      expect.objectContaining({
        body: expect.objectContaining({
          prompts: ['test prompt'],
          providers: ['echo'],
          tests: [
            expect.objectContaining({
              vars: expect.objectContaining({ apiKey: '[REDACTED]' }),
            }),
          ],
        }),
      }),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sk-test-12345678901234567890');
  });

  it('restores redacted Azure SAS tokens before rerunning a stored eval', async () => {
    const sasUri = 'az://account/container/tests.yaml?sp=r&sig=azure-secret';
    mockedEvalFindById.mockResolvedValueOnce({ config: { tests: sasUri } } as never);

    await postJob({
      ...minimalTestSuite,
      tests: 'az://account/container/tests.yaml?sp=r&sig=%5BREDACTED%5D',
      sourceEvalId: 'source-eval-id',
    });

    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluateWithSource.mock.calls[0][0] as any;
    expect(evaluateArg.tests).toBe(sasUri);
  });

  it('should not log the raw save body on database failure', async () => {
    mockedEvalCreate.mockRejectedValueOnce(new Error('db down'));

    const secret = 'sk-test-12345678901234567890';
    const response = await api.post('/api/eval').send({
      config: {
        providers: [{ id: 'openai:gpt-4o', config: { apiKey: secret } }],
      },
      prompts: [{ raw: 'test prompt', label: 'test prompt' }],
      results: [{ promptIdx: 0, testIdx: 0, success: true, score: 1 }],
    });

    expect(response.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to write eval to database',
      expect.objectContaining({
        body: expect.objectContaining({
          config: expect.objectContaining({
            providers: [
              expect.objectContaining({
                config: expect.objectContaining({ apiKey: '[REDACTED]' }),
              }),
            ],
          }),
        }),
      }),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
  });

  it('should return false from shouldShareResults when cloud is disabled', async () => {
    mockedShouldShareResults.mockReturnValue(false);

    await postJob(minimalTestSuite);

    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluateWithSource.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(false);
  });
});
