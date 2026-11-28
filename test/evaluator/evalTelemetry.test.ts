import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import telemetry from '../../src/telemetry';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

function createSuite(label: unknown): TestSuite {
  const provider: ApiProvider = {
    id: () => 'echo',
    // Node API callers can hand the evaluator a provider whose label is not a string.
    label: label as string,
    callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({ output: 'Hello world' }),
  };
  return {
    providers: [provider],
    prompts: [toPrompt('Hello {{name}}')],
    tests: [{ vars: { name: 'world' }, assert: [{ type: 'contains', value: 'world' }] }],
  };
}

async function runAndReload(suite: TestSuite) {
  const evalRecord = await Eval.create({}, suite.prompts, { id: randomUUID() });
  await evaluate(suite, evalRecord, {});
  const saved = await Eval.findById(evalRecord.id);
  return { evalRecord, saved };
}

function lastEvalRanProperties(recordSpy: { mock: { calls: unknown[][] } }) {
  return recordSpy.mock.calls.filter(([event]) => event === 'eval_ran').at(-1)?.[1];
}

describeEvaluator('evaluator telemetry', () => {
  it.each([2.5, 3, true, { name: 'not-a-string' }])(
    'finishes and saves the eval when a provider label is %j',
    async (label) => {
      const recordSpy = vi.spyOn(telemetry, 'record');
      try {
        const { evalRecord, saved } = await runAndReload(createSuite(label));

        expect(evalRecord.getStats().successes).toBe(1);
        expect(lastEvalRanProperties(recordSpy)).toMatchObject({
          numPasses: 1,
          usesExampleProvider: false,
        });
        // save() runs after telemetry, so a stored duration proves finalization completed.
        expect(saved?.durationMs).toEqual(expect.any(Number));
      } finally {
        recordSpy.mockRestore();
      }
    },
  );

  it('still reports providers whose string label names an example', async () => {
    const recordSpy = vi.spyOn(telemetry, 'record');
    try {
      await runAndReload(createSuite('My Example Target'));

      expect(lastEvalRanProperties(recordSpy)).toMatchObject({ usesExampleProvider: true });
    } finally {
      recordSpy.mockRestore();
    }
  });

  it('finishes and saves the eval when recording telemetry throws', async () => {
    const recordSpy = vi.spyOn(telemetry, 'record').mockImplementation((event) => {
      if (event === 'eval_ran') {
        throw new Error('telemetry fixture failure');
      }
    });
    try {
      const { evalRecord, saved } = await runAndReload(createSuite('label'));

      expect(recordSpy).toHaveBeenCalledWith('eval_ran', expect.any(Object));
      expect(evalRecord.getStats().successes).toBe(1);
      expect(saved?.durationMs).toEqual(expect.any(Number));
    } finally {
      recordSpy.mockRestore();
    }
  });
});
