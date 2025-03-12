import { describe, expect, it } from 'vitest';
import { getStrategyIdFromTest, getPluginIdFromResult } from './shared';
import type { EvaluateResult } from '@promptfoo/types';
import { categoryAliases } from '@promptfoo/redteam/constants';

describe('getStrategyIdFromTest', () => {
  it('should return strategyId from metadata', () => {
    const test = {
      metadata: {
        strategyId: 'test-strategy'
      }
    };
    expect(getStrategyIdFromTest(test)).toBe('test-strategy');
  });

  it('should return strategyId from result.testCase.metadata', () => {
    const test = {
      result: {
        testCase: {
          metadata: {
            strategyId: 'nested-strategy'
          }
        }
      }
    };
    expect(getStrategyIdFromTest(test)).toBe('nested-strategy');
  });

  it('should return basic as default when no strategyId found', () => {
    const test = {};
    expect(getStrategyIdFromTest(test)).toBe('basic');
  });
});

describe('getPluginIdFromResult', () => {
  it('should return pluginId from metadata', () => {
    const result: EvaluateResult = {
      metadata: {
        pluginId: 'test-plugin'
      },
      vars: {},
      prompt: '',
      response: ''
    };
    expect(getPluginIdFromResult(result)).toBe('test-plugin');
  });

  it('should return pluginId from harmCategory in vars', () => {
    const result: EvaluateResult = {
      vars: {
        harmCategory: 'Hate'
      },
      metadata: {},
      prompt: '',
      response: ''
    };
    expect(getPluginIdFromResult(result)).toBe('harmful:hate');
  });

  it('should return pluginId from harmCategory in metadata', () => {
    const result: EvaluateResult = {
      vars: {},
      metadata: {
        harmCategory: 'Hate'
      },
      prompt: '',
      response: ''
    };
    expect(getPluginIdFromResult(result)).toBe('harmful:hate');
  });

  it('should return pluginId from metric names', () => {
    const result: EvaluateResult = {
      gradingResult: {
        pass: true,
        componentResults: [
          {
            assertion: {
              metric: 'Hate/SomeMetric'
            }
          }
        ]
      },
      vars: {},
      prompt: '',
      response: '',
      metadata: {}
    };
    expect(getPluginIdFromResult(result)).toBe('harmful:hate');
  });

  it('should return null when no plugin id can be determined', () => {
    const result: EvaluateResult = {
      vars: {},
      prompt: '',
      response: '',
      metadata: {}
    };
    expect(getPluginIdFromResult(result)).toBeNull();
  });

  it('should skip invalid metrics', () => {
    const result: EvaluateResult = {
      gradingResult: {
        pass: true,
        componentResults: [
          {
            assertion: {
              metric: undefined
            }
          }
        ]
      },
      vars: {},
      prompt: '',
      response: '',
      metadata: {}
    };
    expect(getPluginIdFromResult(result)).toBeNull();
  });

  it('should handle invalid category', () => {
    const result: EvaluateResult = {
      gradingResult: {
        pass: true,
        componentResults: [
          {
            assertion: {
              metric: 'INVALID_CATEGORY/Test'
            }
          }
        ]
      },
      vars: {},
      prompt: '',
      response: '',
      metadata: {}
    };
    expect(getPluginIdFromResult(result)).toBeNull();
  });
});
