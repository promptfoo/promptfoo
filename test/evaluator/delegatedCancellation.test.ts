import './setup';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { SequenceProvider } from '../../src/providers/sequence';
import { createDeferred } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse } from '../../src/types/index';

describeEvaluator('delegated request ownership', () => {
  it.each(
    [0, 5].flatMap((delay) =>
      (['resolve', 'reject'] as const).map((outcome) => ({ delay, outcome })),
    ),
  )(
    'keeps a timed-out target in its scheduler slot until it really settles: delay=$delay $outcome',
    async ({ delay, outcome }) => {
      vi.useFakeTimers();
      const pending = createDeferred<ProviderResponse>();
      const target: ApiProvider = {
        id: () => 'offline-delegated-target',
        callApi: vi
          .fn()
          .mockResolvedValue({ output: 'fresh result' })
          .mockImplementationOnce(() => pending.promise),
      };
      const sequence = new SequenceProvider({ config: { inputs: ['benign fixture'] } });
      const record = new Eval({});
      const evaluation = evaluate(
        {
          providers: [target],
          prompts: [toPrompt('hello')],
          tests: [{ provider: sequence }, { provider: sequence }, { provider: sequence }],
        },
        record,
        { maxConcurrency: 1, timeoutMs: 25, maxEvalTimeMs: 0, delay },
      );
      try {
        await vi.advanceTimersByTimeAsync(30);
        expect(target.callApi).toHaveBeenCalledTimes(1);
        if (outcome === 'resolve') {
          pending.resolve({ output: 'late result' });
        } else {
          pending.reject(new Error('late failure'));
        }
        await vi.advanceTimersByTimeAsync(15);
        await evaluation;
        const rows = await record.getResults();
        expect(rows).toHaveLength(3);
        expect(
          rows.filter((row) => row.error?.includes('Evaluation timed out after 25ms')),
        ).toHaveLength(1);
        expect(
          rows.filter((row) => row.response?.output === 'fresh result' && row.success),
        ).toHaveLength(2);
        expect(target.callApi).toHaveBeenCalledTimes(3);
      } finally {
        pending.resolve({ output: 'cleanup' });
        await vi.advanceTimersByTimeAsync(100);
        await evaluation;
      }
    },
  );
});
