import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

import logger from '../../../src/logger';
import Eval from '../../../src/models/eval';
import { evaluateWithSource } from '../../../src/node';
import { createApp } from '../../../src/server/server';
import { shouldShareResults } from '../../../src/util/sharing';

const errorSpy = vi.spyOn(logger, 'error');
const mockedEvalCreate = vi.mocked(Eval.create);
const mockedEvalFindById = vi.mocked(Eval.findById);
const mockedEvaluateWithSource = vi.mocked(evaluateWithSource);
const mockedShouldShareResults = vi.mocked(shouldShareResults);

describe('Eval Routes - Sharing behavior', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
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
    errorSpy.mockClear();

    mockedEvaluateWithSource.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    } as any);

    mockedShouldShareResults.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  const postJob = (body: Record<string, unknown>) => api.post('/api/eval/job').send(body);

  const minimalTestSuite = {
    prompts: ['test prompt'],
    providers: ['echo'],
    tests: [{ vars: { input: 'test' } }],
  };

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
    expect(inProgressResponse.body.status).toBe('in-progress');
    expect(inProgressResponse.body.evalId).toBeUndefined();

    resolveSummary!({ results: [] });

    await vi.waitFor(async () => {
      const completedResponse = await api.get(`/api/eval/job/${jobId}`);
      expect(completedResponse.body).toMatchObject({
        status: 'complete',
        evalId: 'eval-result-id',
        result: { results: [] },
      });
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
      expect(response.body.status).toBe('error');
    });
  });

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

  it('rejects executable prompt sources from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['exec:/bin/echo PROMPTFOO_EXEC_SENTINEL'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['prompts/runner'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['prompts/my runner.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with spaces before the first separator', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my prompts/template.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with single-character path prefixes', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['a/prompt.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with non-word path segments', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my+prompts/runner.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with punctuation-only path prefixes', async () => {
    const underscoredResponse = await postJob({
      ...minimalTestSuite,
      prompts: ['_/runner'],
    });
    const dashedResponse = await postJob({
      ...minimalTestSuite,
      prompts: ['--/tool'],
    });

    expect(underscoredResponse.status).toBe(400);
    expect(underscoredResponse.body.error).toContain('Server-side prompt sources are disabled');
    expect(dashedResponse.status).toBe(400);
    expect(dashedResponse.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects extensionless local paths with non-word path segments', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my+prompts/runner'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects extensionless local prompt file sources with spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my prompts/my runner'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects glob prompt sources that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['prompts/my *.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local prompt file names that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my prompt.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local executable prompt files that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my script.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects local executable prompt files with non-word file names', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my+script.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects URI-like prompt strings that resolve through the local prompt loader', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['foo://../../../../bin/sh'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects colon-separated prompt file references', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['label:path/to/filename.py:functionName'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects executable prompt files from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['runner.sh'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects executable prompt files with generic file extensions', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['payload.bin'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('rejects executable prompt files with non-letter extensions', async () => {
    const numericExtensionResponse = await postJob({
      ...minimalTestSuite,
      prompts: ['payload.42'],
    });
    const mixedExtensionResponse = await postJob({
      ...minimalTestSuite,
      prompts: ['tool.1a'],
    });

    expect(numericExtensionResponse.status).toBe(400);
    expect(numericExtensionResponse.body.error).toContain(
      'Server-side prompt sources are disabled',
    );
    expect(mixedExtensionResponse.status).toBe(400);
    expect(mixedExtensionResponse.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluateWithSource).not.toHaveBeenCalled();
  });

  it('allows object prompt sources from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: [{ raw: 'exec:/bin/echo PROMPTFOO_EXEC_SENTINEL', label: 'unsafe' }],
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });
  });

  it('allows object prompt id sources when raw is omitted', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: [{ id: 'prompts/runner', label: 'unsafe' }],
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });
  });

  it('allows inline templated and JSON-like prompt strings', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: [
        '{{prompt}}',
        '{"role":"user","content":"hello"}',
        '["hello","world"]',
        'Explain A/B testing and calculate 2 * 2.',
        'Discuss C++/CLI interop.',
        'Contact foo@example.com for support.',
        'Use version 1.2 in the answer.',
      ],
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });
  });

  it('allows server-side prompt sources when explicitly enabled', async () => {
    vi.stubEnv('PROMPTFOO_ALLOW_SERVER_PROMPT_SOURCES', 'true');

    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['exec:/bin/echo trusted-local'],
    });

    expect(response.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockedEvaluateWithSource).toHaveBeenCalled();
    });
  });
});
