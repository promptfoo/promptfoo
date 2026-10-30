import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import {
  deleteErrorResults,
  getRetryResultIds,
  recalculatePromptMetrics,
} from '../../src/node/retry';
import { ResultFailureReason } from '../../src/types/index';

import type { ApiProvider, TestSuite } from '../../src/types/index';

beforeAll(() => runDbMigrations());
afterEach(() => {
  cliState.resume = false;
  cliState.retryMode = false;
  delete cliState._retryErrorResultIds;
  vi.restoreAllMocks();
});

it.each(['select-best', 'max-score'] as const)(
  'retries the whole %s group so a former loser can win',
  async (type) => {
    let recovered = false;
    const target: ApiProvider = {
      id: () => 'target',
      callApi: vi.fn(async (prompt) => ({ output: prompt })),
    };
    const grader: ApiProvider = {
      id: () => 'judge',
      callApi: async (_prompt, context) => {
        const index = Number(String(context?.vars.output).split('-')[1]);
        if (!recovered && index === 0) {
          return { error: 'Judge unavailable' };
        }
        return {
          output: JSON.stringify({
            pass: true,
            score: (recovered ? [0.3, 0.2, 1] : [0, 0.9, 0.5])[index],
          }),
        };
      },
    };
    const comparison: ApiProvider = {
      id: () => 'comparison',
      callApi: async () => ({ output: recovered ? '2' : '1' }),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [0, 1, 2].map((index) => ({
        raw: `candidate-${index}`,
        label: `candidate-${index}`,
      })),
      tests: [
        {
          assert: [
            { type: 'llm-rubric', value: 'Rate the candidate', provider: grader },
            {
              type,
              value: 'Choose the best',
              ...(type === 'select-best' && { provider: comparison }),
            },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { cache: false, maxConcurrency: 1 });
    const original = await record.fetchResultsByTestIdx(0);
    expect(original.find((row) => row.promptIdx === 0)?.failureReason).toBe(
      ResultFailureReason.ERROR,
    );
    expect(original.find((row) => row.promptIdx === 1)?.success).toBe(true);
    expect(original.find((row) => row.promptIdx === 2)?.success).toBe(false);

    const selected = await getRetryResultIds(record.id);
    expect(new Set(selected)).toEqual(new Set(original.map((row) => row.id)));
    recovered = true;
    cliState.resume = true;
    cliState.retryMode = true;
    cliState._retryErrorResultIds = selected;
    await evaluate(suite, record, { cache: false, maxConcurrency: 1 });
    await deleteErrorResults(selected);
    await recalculatePromptMetrics(record);

    const retried = await record.fetchResultsByTestIdx(0);
    expect(retried).toHaveLength(3);
    expect(target.callApi).toHaveBeenCalledTimes(6);
    expect(retried.filter((row) => row.success).map((row) => row.promptIdx)).toEqual([2]);
    for (const row of retried) {
      expect(row.gradingResult?.componentResults).toHaveLength(2);
      expect(
        row.gradingResult?.componentResults?.filter(
          (component) => component.assertion?.type === type,
        ),
      ).toHaveLength(1);
      expect(row.failureReason).toBe(
        row.success ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
      );
    }
    for (const prompt of record.prompts) {
      expect(prompt.metrics!.assertPassCount + prompt.metrics!.assertFailCount).toBe(2);
    }
  },
);
