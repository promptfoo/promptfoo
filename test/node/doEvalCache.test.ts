import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCacheEnabled } from '../../src/cache';
import { doEval } from '../../src/node/doEval';
import { createDeferred } from '../util/utils';

vi.mock('../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn() },
}));

async function run(cache: boolean | undefined, provider: () => Promise<{ output: string }>) {
  const result = await doEval(
    { cache, write: false, share: false, table: false, progressBar: false },
    { prompts: ['cache fixture'], providers: [provider], tests: [{ vars: {} }] },
    undefined,
    { eventSource: 'mcp' },
  );
  const [row] = await result.getResults();
  expect(row.success).toBe(true);
  return row.response?.output;
}

describe('doEval cache isolation', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('does not let cache:false disable an overlapping peer or a later invocation', async () => {
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const disabled = run(false, async () => {
      entered.resolve();
      await release.promise;
      return { output: String(isCacheEnabled()) };
    });
    await entered.promise;
    try {
      expect(await run(undefined, async () => ({ output: String(isCacheEnabled()) }))).toBe('true');
    } finally {
      release.resolve();
    }
    expect(await disabled).toBe('false');
    expect(await run(undefined, async () => ({ output: String(isCacheEnabled()) }))).toBe('true');
    expect(isCacheEnabled()).toBe(true);
  });
});
