import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { AssertionOrSet, TestCase, TestSuite } from '../../src/types/index';

const unsupportedTypes = ['max-score', 'select-best', 'assert-set'] as const;
const locations = ['tests', 'defaultTest', 'scenario tests', 'scenario defaults'] as const;

function createSuite(): TestSuite {
  return {
    providers: [mockApiProvider],
    prompts: [toPrompt('Test prompt')],
    tests: [{ assert: [{ type: 'contains', value: 'Test output' }] }],
    extensions: ['file://metric-only-extension.js'],
  };
}

function invalidAssertion(type: (typeof unsupportedTypes)[number]): AssertionOrSet {
  return {
    type,
    metricOnly: true,
    ...(type === 'assert-set' ? { assert: [{ type: 'contains', value: 'Test output' }] } : {}),
  } as unknown as AssertionOrSet;
}

describeEvaluator('metric-only assertion validation after extension hooks', () => {
  it.each(
    locations.flatMap((location) => unsupportedTypes.map((type) => [location, type] as const)),
  )('rejects beforeAll %s with metricOnly on %s before target calls', async (location, type) => {
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeAll') {
        return context;
      }
      const { suite } = context as { suite: TestSuite };
      const updated = { ...suite };
      const test = { assert: [invalidAssertion(type)] };
      switch (location) {
        case 'tests':
          updated.tests = [test];
          break;
        case 'defaultTest':
          updated.defaultTest = test;
          break;
        case 'scenario tests':
          updated.scenarios = [{ config: [{}], tests: [test] }];
          break;
        case 'scenario defaults':
          updated.scenarios = [{ config: [test], tests: [{}] }];
          break;
      }
      return { ...context, suite: updated };
    });
    const suite = createSuite();
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await expect(evaluate(suite, record, {})).rejects.toThrow('metricOnly');
    expect(mockApiProvider.callApi).not.toHaveBeenCalled();
  });

  it('rejects beforeAll mutating an explicitly disabled set flag before target calls', async () => {
    const suite = createSuite();
    const set: AssertionOrSet = {
      type: 'assert-set',
      metricOnly: false,
      assert: [{ type: 'contains', value: 'Test output' }],
    };
    suite.tests = [{ assert: [set] }];
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        (set as unknown as { metricOnly: boolean }).metricOnly = true;
      }
      return context;
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await expect(evaluate(suite, record, {})).rejects.toThrow('metricOnly');
    expect(mockApiProvider.callApi).not.toHaveBeenCalled();
  });

  it.each(unsupportedTypes)(
    'rejects beforeEach replacing a test with metricOnly on %s before target calls',
    async (type) => {
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
        if (hookName !== 'beforeEach') {
          return context;
        }
        const { test } = context as { test: TestCase };
        return { ...context, test: { ...test, assert: [invalidAssertion(type)] } };
      });
      const suite = createSuite();
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

      await expect(evaluate(suite, record, {})).rejects.toThrow('metricOnly');
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
    },
  );

  it.each(
    (['beforeAll', 'beforeEach'] as const).flatMap((hook) =>
      ([undefined, false] as const).map((metricOnly) => [hook, metricOnly] as const),
    ),
  )('preserves metric-only children from %s when the set flag is %s', async (hook, metricOnly) => {
    const set: AssertionOrSet = {
      type: 'assert-set',
      ...(metricOnly === undefined ? {} : { metricOnly }),
      assert: [
        { type: 'contains', value: 'Test output' },
        {
          type: 'contains',
          value: 'missing',
          metric: 'missing_counter',
          metricOnly: true,
          weight: 0,
        },
      ],
    };
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== hook) {
        return context;
      }
      return hook === 'beforeAll'
        ? {
            ...context,
            suite: { ...(context as { suite: TestSuite }).suite, tests: [{ assert: [set] }] },
          }
        : { ...context, test: { ...(context as { test: TestCase }).test, assert: [set] } };
    });
    const suite = createSuite();
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    const result = await evaluate(suite, record, {});
    const summary = await result.toEvaluateSummary();
    expect(mockApiProvider.callApi).toHaveBeenCalledOnce();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toMatchObject({
      success: true,
      score: 1,
      namedScores: { missing_counter: 0 },
    });
    expect(summary.results[0].testCase.assert).toEqual([set]);
  });
});
