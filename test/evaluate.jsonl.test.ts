import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as comparison from '../src/matchers/comparison';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import { evaluate } from '../src/node/evaluate';
import { ResultFailureReason } from '../src/types';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';
import { mockProcessEnv } from './util/utils';

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
    // max-score over three equal outputs keeps only the lowest index as the winner. The row
    // that failed to persist (promptIdx 2) is graded over the full output set and demoted to
    // a loser, not emitted in its stale, pre-comparison success state.
    expect(results[0]).toEqual(expect.objectContaining({ success: true }));
    expect(results[1]).toEqual(expect.objectContaining({ success: false }));
    expect(results[2]).toEqual(expect.objectContaining({ success: false }));
  });

  it('composes select-best then max-score grading for a row that failed to persist', async () => {
    // Regression: when a test has BOTH select-best and max-score, the failed-to-persist row
    // used to be rehydrated from its stale pre-comparison state for each pass. select-best
    // would demote it, then max-score (which can make it the winner) rehydrated the stale row
    // and overwrote the finalized artifact — erasing the select-best failure and reporting
    // success: true. The reconstructed row must be reused across passes so grading composes.
    const selectBestSpy = vi.spyOn(comparison, 'matchesSelectBest').mockResolvedValue([
      { pass: true, score: 1, reason: 'Selected as best' },
      { pass: true, score: 1, reason: 'Selected as best' },
      // The row that failed to persist (promptIdx 2) loses the select-best comparison.
      { pass: false, score: 0, reason: 'Not selected as best' },
    ]);
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    // Only the failed row's output contains "hello", so real max-score makes it the unique
    // winner — without composition it would be re-promoted to success.
    const provider: ApiProvider = {
      id: () => 'compose-comparison-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation((prompt) =>
        Promise.resolve({
          output: prompt.includes('Prompt C') ? 'hello world' : 'goodbye',
          tokenUsage: createEmptyTokenUsage(),
        }),
      ),
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
          assert: [
            { type: 'contains', value: 'hello' },
            { type: 'select-best', value: 'choose the best one' },
            { type: 'max-score' },
          ],
        },
      ],
    });

    const results = readJsonl(outputPath).sort((a, b) => a.promptIdx - b.promptIdx);
    expect(results).toHaveLength(3);
    // The later max-score pass must not erase the select-best failure for the failed row.
    expect(results[2].success).toBe(false);
    const selectBestComponent = results[2].gradingResult?.componentResults?.find(
      (component: any) => component.assertion?.type === 'select-best',
    );
    expect(selectBestComponent?.pass).toBe(false);

    selectBestSpy.mockRestore();
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
      config: {
        apiKey: 'sk-provider-config-should-not-persist',
      },
      callApi: vi.fn().mockResolvedValue({
        output: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              authorization: 'model output should stay intact',
            },
          },
        },
        metadata: {
          headers: {
            'x-request-id': 'legacy_req_should_not_persist',
            'api-key': 'legacy-api-key-should-not-persist',
            'x-safe-debug': 'keep-legacy',
          },
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'session=secret',
              'x-request-id': 'req_should_not_persist',
            },
            requestHeaders: {
              authorization: 'Bearer sk-should-not-persist',
              'api-key': 'azure-api-key-should-not-persist',
              'X-API-Key': 'custom-api-key-should-not-persist',
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
    // Legacy top-level response metadata headers are redacted (they echo the transport)
    // — including api-key-style names via the request-header matcher — while a
    // non-sensitive header survives.
    expect(result.response.metadata.headers).toEqual({
      'x-request-id': '[REDACTED]',
      'api-key': '[REDACTED]',
      'x-safe-debug': 'keep-legacy',
    });
    expect(result.response.metadata.http).toEqual({
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'set-cookie': '[REDACTED]',
        'x-request-id': '[REDACTED]',
      },
      requestHeaders: {
        authorization: '[REDACTED]',
        'api-key': '[REDACTED]',
        'X-API-Key': '[REDACTED]',
        'x-safe-debug': 'keep-me',
      },
    });
    expect(result.provider).toEqual({ id: 'metadata-provider' });
    // A user-controlled `http` key nested in model output must NOT be redacted.
    expect(result.response.output.http.headers.authorization).toBe(
      'model output should stay intact',
    );
    expect(JSON.stringify(result)).not.toContain('session=secret');
    expect(JSON.stringify(result)).not.toContain('req_should_not_persist');
    expect(JSON.stringify(result)).not.toContain('legacy_req_should_not_persist');
    expect(JSON.stringify(result)).not.toContain('legacy-api-key-should-not-persist');
    expect(JSON.stringify(result)).not.toContain('sk-should-not-persist');
    expect(JSON.stringify(result)).not.toContain('azure-api-key-should-not-persist');
    expect(JSON.stringify(result)).not.toContain('custom-api-key-should-not-persist');
    expect(JSON.stringify(result)).not.toContain('sk-provider-config-should-not-persist');
  });

  it('preserves vars and redacts legacy headers when finalizing persisted rows', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'vars-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        metadata: {
          headers: {
            'set-cookie': ['legacy_persisted_session_should_not_persist'],
            'x-request-id': {
              value: 'legacy_persisted_req_should_not_persist',
            },
            'x-safe-debug': 'keep-legacy',
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
      writeLatestResults: true,
    });

    const [result] = readJsonl(outputPath);
    expect(result.vars).toEqual({ topic: 'weather' });
    expect(result.response.metadata.headers).toEqual({
      'set-cookie': '[REDACTED]',
      'x-request-id': '[REDACTED]',
      'x-safe-debug': 'keep-legacy',
    });
    // The result-level metadata.headers echoes the transport, so it is redacted too.
    expect(result.metadata.headers).toEqual({
      'set-cookie': '[REDACTED]',
      'x-request-id': '[REDACTED]',
      'x-safe-debug': 'keep-legacy',
    });
    expect(JSON.stringify(result)).not.toContain('legacy_persisted_session_should_not_persist');
    expect(JSON.stringify(result)).not.toContain('legacy_persisted_req_should_not_persist');
  });

  it('preserves arbitrary test metadata headers when finalizing persisted rows', async () => {
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'metadata-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    await evaluate({
      outputPath,
      prompts: ['Test prompt'],
      providers: [provider],
      tests: [
        {
          metadata: {
            headers: {
              'x-request-id': 'user-defined-reporting-id',
            },
          },
        },
      ],
      writeLatestResults: true,
    });

    const [result] = readJsonl(outputPath);
    // No transport provenance for these headers, so the provenance guard must preserve them.
    expect(result.metadata.headers).toEqual({
      'x-request-id': 'user-defined-reporting-id',
    });
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

  it('applies strip projections to recovered streamed rows after persistence fails', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_METADATA: 'true',
      PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
      PROMPTFOO_STRIP_TEST_VARS: 'true',
    });
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'stripped-recovery-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'response-output-secret',
        metadata: {
          debug: 'response-metadata-secret',
        },
        tokenUsage: createEmptyTokenUsage(),
      }),
    };
    vi.spyOn(Eval.prototype, 'addResult').mockRejectedValue(new Error('simulated save failure'));

    try {
      await evaluate({
        outputPath,
        prompts: ['Test prompt'],
        providers: [provider],
        tests: [
          {
            vars: { customerEmail: 'vars-secret@example.com' },
            metadata: { debug: 'testcase-metadata-secret' },
          },
        ],
      });

      const [result] = readJsonl(outputPath);
      expect(result.response).toEqual({
        output: '[output stripped]',
        tokenUsage: createEmptyTokenUsage(),
      });
      expect(result.vars).toEqual({});
      expect(result.testCase.vars).toBeUndefined();
      expect(result.testCase.metadata).toBeUndefined();
      expect(result.metadata).toEqual({});
      expect(JSON.stringify(result)).not.toContain('response-output-secret');
      expect(JSON.stringify(result)).not.toContain('response-metadata-secret');
      expect(JSON.stringify(result)).not.toContain('vars-secret@example.com');
      expect(JSON.stringify(result)).not.toContain('testcase-metadata-secret');
    } finally {
      restoreEnv();
    }
  });

  it('applies prompt-text and grading-result strip projections to finalized JSONL', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_PROMPT_TEXT: 'true',
      PROMPTFOO_STRIP_GRADING_RESULT: 'true',
    });
    const outputPath = createOutputPath();
    outputPaths.push(outputPath);
    const provider: ApiProvider = {
      id: () => 'strip-prompt-grading-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: createEmptyTokenUsage(),
      }),
    };

    try {
      await evaluate({
        outputPath,
        prompts: ['Prompt {{topic}}'],
        providers: [provider],
        tests: [{ vars: { topic: 'alpha' }, assert: [{ type: 'contains', value: 'hello' }] }],
      });

      const [result] = readJsonl(outputPath);
      expect(result.prompt.raw).toBe('[prompt stripped]');
      expect(result.gradingResult).toBeNull();
    } finally {
      restoreEnv();
    }
  });
});
