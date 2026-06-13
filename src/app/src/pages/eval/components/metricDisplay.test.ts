import { describe, expect, it } from 'vitest';
import {
  formatRawMetricValue,
  getMetricAverage,
  getMetricDisplayKind,
  getMetricDisplayKinds,
} from './metricDisplay';
import type { EvaluateTable, UnifiedConfig } from '@promptfoo/types';

describe('formatRawMetricValue', () => {
  it('preserves significant digits for small nonzero values', () => {
    expect(formatRawMetricValue(0.00000465)).toBe('0.000004650');
    expect(formatRawMetricValue(-0.00000465)).toBe('-0.000004650');
    expect(formatRawMetricValue(0)).toBe('0.00');
    expect(formatRawMetricValue(0.25)).toBe('0.25');
    expect(formatRawMetricValue(null)).toBe('0');
  });
});

describe('metricDisplay', () => {
  it('classifies thresholdless cost as value and inverse types as percentage', () => {
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
                type: 'latency',
                metric: 'total_latency_ms',
              },
              {
                type: 'not-latency',
                threshold: 500,
                metric: 'latency_check',
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
      latency_check: 'percentage',
    });
  });

  it('does not classify thresholdless not-cost/not-latency as value metrics', () => {
    const table: EvaluateTable = {
      head: { prompts: [], vars: [] },
      body: [
        {
          description: 'row 1',
          outputs: [],
          test: {
            assert: [
              { type: 'not-cost', metric: 'cost_guard' },
              { type: 'not-latency', metric: 'latency_guard' },
            ],
            vars: {},
          },
          testIdx: 0,
          vars: [],
        },
      ],
    };

    expect(getMetricDisplayKinds(table)).toEqual({
      cost_guard: 'percentage',
      latency_guard: 'percentage',
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

  it('classifies defaultTest metric templates for hidden rows using config test vars', () => {
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
                metric: 'cost_PRO',
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
    const config: Partial<UnifiedConfig> = {
      defaultTest: {
        assert: [
          {
            type: 'cost',
            metric: 'cost_{{ customer.tier | upper }}',
          },
        ],
      },
      tests: [
        {
          vars: {
            customer: {
              tier: 'pro',
            },
          },
        },
        {
          vars: {
            customer: {
              tier: 'enterprise',
            },
          },
        },
      ],
    };

    expect(getMetricDisplayKinds(table, config)).toEqual({
      cost_ENTERPRISE: 'value',
      cost_PRO: 'value',
    });
  });

  it('handles file-backed test configs when collecting default metric kinds', () => {
    const table: EvaluateTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [],
    };
    const config: Partial<UnifiedConfig> = {
      defaultTest: {
        assert: [
          {
            type: 'cost',
            metric: 'total_cost',
          },
        ],
      },
      tests: [
        {
          path: 'file://tests.py:generate_tests',
          config: {
            dataset: 'sample',
          },
        },
      ],
    };

    expect(getMetricDisplayKinds(table, config)).toEqual({
      total_cost: 'value',
    });
  });

  it('treats derived metrics without counts as value metrics', () => {
    expect(getMetricDisplayKind('avg_cost', {}, [undefined])).toBe('value');
  });

  it('preserves explicitly classified percentage metrics when counts are missing', () => {
    expect(getMetricDisplayKind('accuracy', { accuracy: 'percentage' }, [undefined])).toBe(
      'percentage',
    );
  });

  it('computes value and percentage averages correctly', () => {
    expect(getMetricAverage('value', 1, 4)).toBe(0.25);
    expect(getMetricAverage('percentage', 3, 4)).toBe(75);
  });
});
