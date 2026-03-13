import { describe, expect, it } from 'vitest';
import { getMetricAverage, getMetricDisplayKind, getMetricDisplayKinds } from './metricDisplay';
import type { EvaluateTable } from '@promptfoo/types';

describe('metricDisplay', () => {
  it('classifies thresholdless cost and inverse cost metrics as value metrics', () => {
    const table: EvaluateTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [
        {
          description: 'row 1',
          outputs: [],
          test: {
            assert: [
              {
                type: 'cost',
                metric: 'total_cost',
              },
              {
                type: 'not-latency',
                metric: 'total_latency_ms',
              },
              {
                type: 'equals',
                value: 'ok',
                metric: 'accuracy',
              },
            ],
            vars: {},
          },
          testIdx: 0,
          vars: [],
        },
      ],
    };

    expect(getMetricDisplayKinds(table)).toEqual({
      accuracy: 'percentage',
      total_cost: 'value',
      total_latency_ms: 'value',
    });
  });

  it('resolves nunjucks metric templates before classifying them', () => {
    const table: EvaluateTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [
        {
          description: 'row 1',
          outputs: [],
          test: {
            assert: [
              {
                type: 'cost',
                metric: 'cost_{{ customer.tier | upper }}',
              },
            ],
            vars: {
              customer: {
                tier: 'pro',
              },
            },
          },
          testIdx: 0,
          vars: [],
        },
      ],
    };

    expect(getMetricDisplayKinds(table)).toEqual({
      cost_PRO: 'value',
    });
  });

  it('treats derived metrics without counts as value metrics', () => {
    expect(getMetricDisplayKind('avg_cost', {}, [undefined])).toBe('value');
  });

  it('computes value and percentage averages correctly', () => {
    expect(getMetricAverage('value', 1, 4)).toBe(0.25);
    expect(getMetricAverage('percentage', 3, 4)).toBe(75);
  });
});
