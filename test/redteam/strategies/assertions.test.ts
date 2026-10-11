import { describe, expect, it } from 'vitest';
import {
  appendMetricSuffix,
  appendPluginMetricSuffix,
} from '../../../src/redteam/strategies/assertions';

import type { TestCase } from '../../../src/types/index';

describe('strategy assertion metrics', () => {
  it.each([appendMetricSuffix, appendPluginMetricSuffix])(
    '%s preserves missing and empty assertion lists',
    (project) => {
      expect(project({ vars: { prompt: 'test' } }, 'Strategy')).toBeUndefined();
      expect(project({ assert: [] }, 'Strategy')).toEqual([]);
    },
  );

  it('suffixes named metrics without creating names for empty or absent metrics', () => {
    const testCase: TestCase = {
      assert: [
        { type: 'equals', value: 'expected', metric: 'Accuracy' },
        { type: 'contains', value: 'expected', metric: '' },
        { type: 'icontains', value: 'expected' },
      ],
    };
    const original = structuredClone(testCase);

    const result = appendMetricSuffix(testCase, 'Strategy');

    expect(result).toStrictEqual([
      { type: 'equals', value: 'expected', metric: 'Accuracy/Strategy' },
      { type: 'contains', value: 'expected', metric: '' },
      { type: 'icontains', value: 'expected', metric: undefined },
    ]);
    expect(testCase).toStrictEqual(original);
    expect(result).not.toBe(testCase.assert);
    result?.forEach((assertion, index) => {
      expect(assertion).not.toBe(testCase.assert?.[index]);
    });
  });

  it('uses redteam plugin names while retaining unrelated assertion metrics', () => {
    const testCase: TestCase = {
      assert: [
        { type: 'promptfoo:redteam:policy', metric: 'CustomPolicyMetric' },
        { type: 'equals', value: 'expected', metric: 'Accuracy' },
        { type: 'contains', value: 'expected' },
      ],
    };
    const original = structuredClone(testCase);

    const result = appendPluginMetricSuffix(testCase, 'Strategy');

    expect(result).toStrictEqual([
      { type: 'promptfoo:redteam:policy', metric: 'policy/Strategy' },
      { type: 'equals', value: 'expected', metric: 'Accuracy' },
      { type: 'contains', value: 'expected', metric: undefined },
    ]);
    expect(testCase).toStrictEqual(original);
    expect(result).not.toBe(testCase.assert);
    result?.forEach((assertion, index) => {
      expect(assertion).not.toBe(testCase.assert?.[index]);
    });
  });
});
