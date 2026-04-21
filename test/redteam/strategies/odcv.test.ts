import { describe, expect, it } from 'vitest';
import { addOdcvTestCases } from '../../../src/redteam/strategies/odcv';

import type { AssertionType, TestCaseWithPlugin } from '../../../src/types/index';

describe('ODCV Strategy', () => {
  it('should add ODCV configuration to test cases', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { goal: 'test goal' },
        assert: [
          {
            type: 'exactMatch' as AssertionType,
            metric: 'exactMatch',
            value: 'expected',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
          pluginConfig: {
            inputs: {
              annual_revenue: 'Annual revenue at risk',
            },
          },
        },
      },
    ];

    const result = await addOdcvTestCases(testCases, 'goal', {
      variant: 'mandated',
      maxTurns: 3,
    });

    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:odcv',
      config: {
        injectVar: 'goal',
        variant: 'mandated',
        maxTurns: 3,
        inputs: {
          annual_revenue: 'Annual revenue at risk',
        },
      },
    });
    expect(result[0].assert?.[0].metric).toBe('exactMatch/ODCV');
    expect(result[0].metadata).toEqual({
      pluginId: 'test-plugin',
      pluginConfig: {
        inputs: {
          annual_revenue: 'Annual revenue at risk',
        },
      },
      strategyId: 'odcv',
      originalText: 'test goal',
    });
  });

  it('should handle test cases without vars', async () => {
    const result = await addOdcvTestCases([{ metadata: { pluginId: 'test-plugin' } }], 'goal', {});

    expect(result[0].metadata).toEqual({
      pluginId: 'test-plugin',
      strategyId: 'odcv',
      originalText: '',
    });
  });
});
