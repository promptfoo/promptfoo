import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('../../../src/index', () => ({
  default: {
    evaluate: vi.fn().mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    }),
  },
}));

vi.mock('../../../src/util/sharing', () => ({
  shouldShareResults: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/models/eval', () => ({
  default: {
    create: vi.fn(),
  },
}));
vi.mock('../../../src/globalConfig/accounts');

import promptfoo from '../../../src/index';
import logger from '../../../src/logger';
import Eval from '../../../src/models/eval';
import { createApp } from '../../../src/server/server';
import { shouldShareResults } from '../../../src/util/sharing';

const errorSpy = vi.spyOn(logger, 'error');
const mockedEvalCreate = vi.mocked(Eval.create);
const mockedEvaluate = vi.mocked(promptfoo.evaluate);
const mockedShouldShareResults = vi.mocked(shouldShareResults);

describe('Eval Routes - Sharing behavior', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy.mockClear();

    mockedEvaluate.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    } as any);

    mockedShouldShareResults.mockReturnValue(false);

    app = createApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const postJob = (body: Record<string, unknown>) => request(app).post('/api/eval/job').send(body);

  const minimalTestSuite = {
    prompts: ['test prompt'],
    providers: ['echo'],
    tests: [{ vars: { input: 'test' } }],
  };

  it('should use testSuite.sharing when explicitly set to true', async () => {
    await postJob({ ...minimalTestSuite, sharing: true });

    // Wait for async evaluate call
    await vi.waitFor(() => {
      expect(mockedEvaluate).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluate.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(true);
  });

  it('should use testSuite.sharing when explicitly set to false', async () => {
    mockedShouldShareResults.mockReturnValue(true);

    await postJob({ ...minimalTestSuite, sharing: false });

    await vi.waitFor(() => {
      expect(mockedEvaluate).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluate.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(false);
  });

  it('should fall back to shouldShareResults when testSuite.sharing is undefined', async () => {
    mockedShouldShareResults.mockReturnValue(true);

    await postJob(minimalTestSuite);

    await vi.waitFor(() => {
      expect(mockedEvaluate).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluate.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(true);
    expect(mockedShouldShareResults).toHaveBeenCalledWith({});
  });

  it('should not log the raw job body on evaluation failure', async () => {
    mockedEvaluate.mockRejectedValueOnce(new Error('boom'));

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

  it('should not log the raw save body on database failure', async () => {
    mockedEvalCreate.mockRejectedValueOnce(new Error('db down'));

    const secret = 'sk-test-12345678901234567890';
    const response = await request(app)
      .post('/api/eval')
      .send({
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
      expect(mockedEvaluate).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluate.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(false);
  });
});
