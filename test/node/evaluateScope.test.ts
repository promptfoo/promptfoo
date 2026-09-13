import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import { evaluate } from '../../src/node/evaluate';
import { createDeferred } from '../util/utils';

import type { ApiProvider } from '../../src/types';

describe('SDK provider lifecycle', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps a shared provider alive until both SDK evaluations finish', async () => {
    const started = createDeferred<void>();
    const finishSlow = createDeferred<void>();
    let arrivals = 0;
    let closed = false;
    const shutdown = vi.fn(async () => {
      closed = true;
    });
    const provider: ApiProvider & { shutdown: typeof shutdown } = {
      id: () => 'shared-sdk-provider',
      shutdown,
      async callApi(prompt) {
        if (++arrivals === 2) {
          started.resolve();
        }
        await started.promise;
        if (prompt === 'slow') {
          await finishSlow.promise;
        }
        return closed ? { error: 'Provider closed during another SDK run' } : { output: prompt };
      },
    };
    const run = (prompt: string) =>
      evaluate(
        {
          providers: [provider],
          prompts: [prompt],
          tests: [{ assert: [{ type: 'equals', value: prompt }] }],
        },
        { cache: false },
      );
    const fast = run('fast');
    const slow = run('slow');
    let shutdownsAfterFast: number;
    try {
      await fast;
      shutdownsAfterFast = shutdown.mock.calls.length;
    } finally {
      finishSlow.resolve();
    }
    const summary = await (await slow).toEvaluateSummary();
    expect(shutdownsAfterFast).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
