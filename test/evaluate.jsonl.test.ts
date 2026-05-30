import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../src/migrate';
import { evaluate } from '../src/node/evaluate';
import { ResultFailureReason } from '../src/types';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider } from '../src/types';

function createOutputPath(): string {
  return path.join(os.tmpdir(), `promptfoo-evaluate-${randomUUID()}.jsonl`);
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

  it('exports persisted rows with sensitive HTTP metadata redacted', async () => {
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
      writeLatestResults: true,
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
});
