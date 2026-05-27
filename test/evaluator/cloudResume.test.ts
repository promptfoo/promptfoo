import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { type TestSuite } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator cloud resume', () => {
  it('uses cloud-completed pairs without reading local completed results', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Skipped prompt {{value}}'), toPrompt('Remaining prompt {{value}}')],
      tests: [{ vars: { value: 'one' } }, { vars: { value: 'two' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const completedPairsSpy = vi.spyOn(EvalResult, 'getCompletedIndexPairs');

    cliState.resume = true;
    cliState.cloudCompletedPairs = new Set(['0:0', '1:0']);

    await evaluate(testSuite, evalRecord, {});

    expect(completedPairsSpy).not.toHaveBeenCalled();
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(mockApiProvider.callApi).toHaveBeenNthCalledWith(
      1,
      'Remaining prompt one',
      expect.any(Object),
      undefined,
    );
    expect(mockApiProvider.callApi).toHaveBeenNthCalledWith(
      2,
      'Remaining prompt two',
      expect.any(Object),
      undefined,
    );
  });

  it('streams each completed result through resultStreamCallback', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{value}}')],
      tests: [{ vars: { value: 'one' } }, { vars: { value: 'two' } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const resultStreamCallback = vi.fn().mockResolvedValue(undefined);

    await evaluate(testSuite, evalRecord, { resultStreamCallback });

    expect(resultStreamCallback).toHaveBeenCalledTimes(2);
    expect(resultStreamCallback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        response: expect.objectContaining({ output: 'Test output' }),
        success: true,
      }),
    );
    expect(resultStreamCallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        response: expect.objectContaining({ output: 'Test output' }),
        success: true,
      }),
    );
  });

  it('does not fail evaluation when result streaming fails', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ vars: {} }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const resultStreamCallback = vi.fn().mockRejectedValue(new Error('stream failed'));

    await evaluate(testSuite, evalRecord, { resultStreamCallback });
    const summary = await evalRecord.toEvaluateSummary();

    expect(resultStreamCallback).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.errors).toBe(0);
  });
});
