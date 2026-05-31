import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import { evaluate } from '../src/node/evaluate';
import { ResultFailureReason } from '../src/types';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider } from '../src/types';

function createOutputPath(extension = '.jsonl'): string {
  return path.join(os.tmpdir(), `promptfoo-evaluate-${randomUUID()}${extension}`);
}

function readJsonl(outputPath: string): Array<Record<string, any>> {
  return fs
    .readFileSync(outputPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('programmatic JSONL output', () => {
  const outputPaths: string[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const outputPath of outputPaths.splice(0)) {
      fs.rmSync(outputPath, { force: true });
    }
  });

  it('includes synthetic timeout rows in the finalized artifact', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'slow-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation((_prompt, _context, options) => {
        return new Promise<never>((_resolve, reject) => {
          options?.abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('Provider call aborted')),
            { once: true },
          );
        });
      }),
    };

    await evaluate(
      {
        outputPath,
        prompts: ['Test prompt'],
        providers: [provider],
        tests: [{ vars: {} }],
      },
      { timeoutMs: 10 },
    );

    expect(readJsonl(outputPath)).toEqual([
      expect.objectContaining({
        error: expect.stringContaining('timed out'),
        failureReason: ResultFailureReason.ERROR,
        success: false,
      }),
    ]);
  });

  it('rewrites streamed rows with the final max-score state', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'max-score-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    await evaluate({
      outputPath,
      prompts: ['Prompt A', 'Prompt B'],
      providers: [provider],
      tests: [
        {
          assert: [{ type: 'contains', value: 'hello' }, { type: 'max-score' }],
        },
      ],
    });

    const results = readJsonl(outputPath).sort((a, b) => a.promptIdx - b.promptIdx);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(expect.objectContaining({ success: true }));
    expect(results[1]).toEqual(
      expect.objectContaining({
        failureReason: ResultFailureReason.ASSERT,
        success: false,
      }),
    );
  });

  it('finalizes failed streamed rows together with later timeout rows', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'partially-slow-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation((prompt, _context, options) => {
        if (prompt.includes('fast')) {
          return Promise.resolve({
            output: 'fast response',
            tokenUsage: createEmptyTokenUsage(),
          });
        }
        return new Promise<never>((_resolve, reject) => {
          options?.abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('Provider call aborted')),
            { once: true },
          );
        });
      }),
    };
    const originalAddResult = Eval.prototype.addResult;
    vi.spyOn(Eval.prototype, 'addResult').mockImplementation(async function (this: Eval, result) {
      if (result.promptIdx === 0) {
        throw new Error('simulated save failure');
      }
      return originalAddResult.call(this, result);
    });

    await evaluate(
      {
        outputPath,
        prompts: ['fast prompt', 'slow prompt'],
        providers: [provider],
        tests: [{ vars: {} }],
      },
      { timeoutMs: 10 },
    );

    const results = readJsonl(outputPath).sort((a, b) => a.promptIdx - b.promptIdx);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(expect.objectContaining({ success: true }));
    expect(results[1]).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('timed out'),
        failureReason: ResultFailureReason.ERROR,
        success: false,
      }),
    );
  });

  it('finalizes failed streamed rows together with later max-score updates', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'partially-persisted-max-score-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    const originalAddResult = Eval.prototype.addResult;
    vi.spyOn(Eval.prototype, 'addResult').mockImplementation(async function (this: Eval, result) {
      if (result.promptIdx === 2) {
        throw new Error('simulated save failure');
      }
      return originalAddResult.call(this, result);
    });

    await evaluate({
      outputPath,
      prompts: ['Prompt A', 'Prompt B', 'Prompt C'],
      providers: [provider],
      tests: [
        {
          assert: [{ type: 'contains', value: 'hello' }, { type: 'max-score' }],
        },
      ],
    });

    const results = readJsonl(outputPath).sort((a, b) => a.promptIdx - b.promptIdx);
    expect(results).toHaveLength(3);
    expect(results.filter((result) => result.promptIdx < 2 && !result.success)).toHaveLength(1);
    expect(results[2]).toEqual(expect.objectContaining({ success: true }));
  });

  it('preserves provider and model-graded assertion token usage when finalizing persisted rows', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'token-usage-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: {
          total: 6,
          prompt: 4,
          completion: 2,
        },
      }),
    };
    const gradingProvider: ApiProvider = {
      id: () => 'grading-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          pass: true,
          score: 1,
          reason: 'Test passed',
        }),
        tokenUsage: {
          total: 9,
          prompt: 5,
          completion: 4,
        },
      }),
    };

    await evaluate({
      outputPath,
      prompts: ['Test prompt'],
      providers: [provider],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output should be valid',
              provider: gradingProvider,
            },
          ],
        },
      ],
      writeLatestResults: true,
    });

    expect(readJsonl(outputPath)[0].tokenUsage).toEqual({
      ...createEmptyTokenUsage(),
      total: 6,
      prompt: 4,
      completion: 2,
      numRequests: 1,
      assertions: {
        ...createEmptyTokenUsage().assertions,
        total: 9,
        prompt: 5,
        completion: 4,
        numRequests: 1,
      },
    });
  });

  it('exports non-persisted rows with sensitive HTTP metadata redacted', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'metadata-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        metadata: {
          http: {
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'session=secret',
              'x-request-id': 'req_should_not_persist',
            },
            requestHeaders: {
              authorization: 'Bearer sk-should-not-persist',
              'x-safe-debug': 'keep-me',
            },
          },
        },
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    await evaluate({
      outputPath,
      prompts: ['Test prompt'],
      providers: [provider],
      tests: [{ vars: { topic: 'weather' } }],
    });

    const [result] = readJsonl(outputPath);
    expect(result.vars).toEqual({ topic: 'weather' });
    expect(result.response.metadata.http).toEqual({
      headers: {
        'content-type': 'application/json',
        'set-cookie': '[REDACTED]',
        'x-request-id': '[REDACTED]',
      },
      requestHeaders: {
        authorization: '[REDACTED]',
        'x-safe-debug': 'keep-me',
      },
    });
    expect(JSON.stringify(result)).not.toContain('session=secret');
    expect(JSON.stringify(result)).not.toContain('req_should_not_persist');
    expect(JSON.stringify(result)).not.toContain('sk-should-not-persist');
  });

  it('preserves sanitized streamed rows for uppercase JSONL after persistence fails', async () => {
    const outputPath = createOutputPath('.JSONL');
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'metadata-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        metadata: {
          http: {
            headers: {
              'set-cookie': 'session=secret',
            },
            requestHeaders: {
              authorization: 'Bearer sk-should-not-persist',
            },
          },
        },
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    vi.spyOn(Eval.prototype, 'addResult').mockRejectedValue(new Error('simulated save failure'));

    await evaluate({
      outputPath,
      prompts: ['Test prompt'],
      providers: [provider],
      tests: [{ vars: { topic: 'weather' } }],
    });

    const [result] = readJsonl(outputPath);
    expect(result.vars).toEqual({ topic: 'weather' });
    expect(result.response.metadata.http.headers['set-cookie']).toBe('[REDACTED]');
    expect(result.response.metadata.http.requestHeaders.authorization).toBe('[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('session=secret');
    expect(JSON.stringify(result)).not.toContain('sk-should-not-persist');
  });
});
