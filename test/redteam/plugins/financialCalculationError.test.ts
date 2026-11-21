import { describe, expect, it, vi } from 'vitest';
import { runEval } from '../../../src/evaluator';
import {
  FINANCIAL_CALCULATION,
  gradeFinancialReference,
} from '../../../src/redteam/grading/financialReference';
import { FinancialCalculationErrorPluginGrader } from '../../../src/redteam/plugins/financial/financialCalculationError';

import type { Assertion, AtomicTestCase } from '../../../src/types';

const reference = { type: 'numeric', expected: { amount: '1.00' }, absoluteTolerance: '0.01' };
const assertion: Assertion = { type: FINANCIAL_CALCULATION, value: reference };

describe('exact financial references', () => {
  it.each([
    ['1.01', true],
    ['0.99', true],
    ['1.0100000000000001', false],
    ['0.989999999999999999', false],
    ['"1"', false],
    ['null', false],
    ['1e999', false],
    ['1e-400', false],
    ['1.' + '0'.repeat(500), false],
  ] as const)('checks %s', (amount, pass) => {
    expect(gradeFinancialReference('{"amount":' + amount + '}', reference)).toMatchObject({
      pass,
      score: Number(pass),
    });
  });

  it('preserves large integers and inclusive relative tolerance', () => {
    const value = {
      type: 'numeric',
      expected: { amount: '9007199254740993', ratio: '-4' },
      relativeTolerance: '0.25',
    };
    expect(gradeFinancialReference('{"amount":9007199254740993,"ratio":-5}', value).pass).toBe(
      true,
    );
    expect(
      gradeFinancialReference('{"amount":9007199254740992,"ratio":-4}', {
        ...value,
        relativeTolerance: 0,
      }).pass,
    ).toBe(false);
  });

  it('rejects malformed references and non-text responses', async () => {
    for (const expected of [{}, { amount: 1e20 }, { amount: 0.01 }, { amount: ' 1' }]) {
      expect(() => gradeFinancialReference('{}', { ...reference, expected })).toThrow(
        'Invalid financial',
      );
    }
    const grader = new FinancialCalculationErrorPluginGrader();
    await expect(
      grader.getResult('test', '{"amount":1}', {}, undefined, reference, undefined, undefined, {
        providerResponse: { output: { amount: 1 } },
      }),
    ).rejects.toThrow('raw JSON text');
  });

  async function run(test: AtomicTestCase) {
    const provider = {
      id: () => 'fixture',
      callApi: vi.fn(async () => ({ output: '{"amount":2}' })),
    };
    const [row] = await runEval({
      delay: 0,
      repeatIndex: 0,
      promptIdx: 0,
      testIdx: 0,
      isRedteam: false,
      conversations: {},
      registers: {},
      test,
      provider,
      prompt: { label: 'test', raw: 'Example' },
    });
    return { provider, row };
  }

  it('respects assertion set thresholds in direct evaluations', async () => {
    const { row } = await run({
      assert: [{ type: 'assert-set', threshold: 0.5, assert: [assertion, { type: 'is-json' }] }],
    });
    expect(row.success).toBe(true);
    expect(row.score).toBe(0.5);
  });

  it('rejects iterative strategies before the first target call', async () => {
    const { row, provider } = await run({
      metadata: { strategyId: 'hydra' },
      assert: [{ type: 'assert-set', assert: [assertion] }],
    });
    expect(provider.callApi).not.toHaveBeenCalled();
    expect(row.error).toContain('requires a direct provider');
  });
});
