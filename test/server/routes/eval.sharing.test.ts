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

vi.mock('../../../src/models/eval');
vi.mock('../../../src/globalConfig/accounts');

import promptfoo from '../../../src/index';
import { createApp } from '../../../src/server/server';
import { shouldShareResults } from '../../../src/util/sharing';

const mockedEvaluate = vi.mocked(promptfoo.evaluate);
const mockedShouldShareResults = vi.mocked(shouldShareResults);

describe('Eval Routes - Sharing behavior', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockedEvaluate.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({ results: [] }),
    } as any);

    mockedShouldShareResults.mockReturnValue(false);

    app = createApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
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

  it('should return false from shouldShareResults when cloud is disabled', async () => {
    mockedShouldShareResults.mockReturnValue(false);

    await postJob(minimalTestSuite);

    await vi.waitFor(() => {
      expect(mockedEvaluate).toHaveBeenCalled();
    });

    const evaluateArg = mockedEvaluate.mock.calls[0][0] as any;
    expect(evaluateArg.sharing).toBe(false);
  });

  it('rejects executable prompt sources from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['exec:/bin/echo PROMPTFOO_EXEC_SENTINEL'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['prompts/runner'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['prompts/my runner.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with spaces before the first separator', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my prompts/template.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with single-character path prefixes', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['a/prompt.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local prompt file sources with non-word path segments', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my+prompts/runner.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects extensionless local paths with non-word path segments', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my+prompts/runner'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects glob prompt sources that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['prompts/my *.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local prompt file names that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my prompt.txt'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local executable prompt files that contain spaces', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my script.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects local executable prompt files with non-word file names', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['my+script.py:run'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects colon-separated prompt file references', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['label:path/to/filename.py:functionName'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects executable prompt files from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['runner.sh'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects executable prompt files with generic file extensions', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: ['payload.bin'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects object prompt sources from web job creation', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: [{ raw: 'exec:/bin/echo PROMPTFOO_EXEC_SENTINEL', label: 'unsafe' }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
  });

  it('rejects object prompt id sources when raw is omitted', async () => {
    const response = await postJob({
      ...minimalTestSuite,
      prompts: [{ id: 'prompts/runner', label: 'unsafe' }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Server-side prompt sources are disabled');
    expect(mockedEvaluate).not.toHaveBeenCalled();
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
      expect(mockedEvaluate).toHaveBeenCalled();
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
      expect(mockedEvaluate).toHaveBeenCalled();
    });
  });
});
