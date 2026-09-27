import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { doEval } from '../../src/node/doEval';
import { stripAnsi } from '../util/utils';

import type { ProviderFunction } from '../../src/types/providers';

vi.mock('../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn() },
}));

function provider(id: string, tokens: number, ready?: Promise<void>) {
  return Object.assign(
    async () => {
      await ready;
      return { output: 'ok', tokenUsage: { total: tokens, prompt: tokens, numRequests: 1 } };
    },
    { label: id },
  );
}

async function run(providers: ProviderFunction[]) {
  const result = await doEval(
    { write: false, share: false, table: false, progressBar: false },
    {
      prompts: ['hello'],
      providers,
      tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
    },
    undefined,
    { eventSource: 'mcp', cache: false },
  );
  const summary = await result.toEvaluateSummary();
  expect(summary.stats.successes).toBe(providers.length);
  expect(summary.stats.errors).toBe(0);
  return result;
}

describe('evaluation provider token summaries', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function output() {
    return stripAnsi(
      vi
        .mocked(logger.info)
        .mock.calls.map(([line]) => String(line))
        .join('\n'),
    );
  }

  it('does not carry provider rows into the next evaluation', async () => {
    await run([provider('previous-a', 101), provider('previous-b', 102)]);
    vi.mocked(logger.info).mockClear();
    await run([provider('current-a', 11), provider('current-b', 12)]);
    expect(output()).toContain('current-a: 11');
    expect(output()).toContain('current-b: 12');
    expect(output()).not.toContain('previous-a:');
    expect(output()).not.toContain('previous-b:');
  });

  it('starts fresh when later evaluations reuse the same provider IDs', async () => {
    await run([provider('reused-a', 201), provider('reused-b', 202)]);
    vi.mocked(logger.info).mockClear();
    await run([provider('reused-a', 21), provider('reused-b', 22)]);
    expect(output()).toContain('reused-a: 21 (1 requests');
    expect(output()).toContain('reused-b: 22 (1 requests');
  });

  it('keeps overlapping evaluations separate until each summary is printed', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = run([provider('pending-a', 31, ready), provider('pending-b', 32, ready)]);
    try {
      await run([provider('finished-a', 301), provider('finished-b', 302)]);
      vi.mocked(logger.info).mockClear();
    } finally {
      release();
    }
    await pending;
    expect(output()).toContain('pending-a: 31');
    expect(output()).toContain('pending-b: 32');
    expect(output()).not.toContain('finished-a:');
    expect(output()).not.toContain('finished-b:');
  });
});
