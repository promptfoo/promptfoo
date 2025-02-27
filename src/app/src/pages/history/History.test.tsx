import { describe, it, expect } from 'vitest';
import { calculatePassRate, getSortedValues, getValue } from './History';
import type { PromptMetrics } from '@promptfoo/types';

describe('calculatePassRate', () => {
  it('should calculate pass rate correctly', () => {
    const metrics = {
      testPassCount: 8,
      testFailCount: 2
    };
    expect(calculatePassRate(metrics)).toBe('80.00');
  });

  it('should handle zero total tests', () => {
    const metrics = {
      testPassCount: 0,
      testFailCount: 0
    };
    expect(calculatePassRate(metrics)).toBe('NaN');
  });

  it('should handle undefined metrics', () => {
    expect(calculatePassRate(undefined)).toBe('-');
  });

  it('should handle metrics with null counts', () => {
    const metrics = {
      testPassCount: null as any,
      testFailCount: null as any
    };
    expect(calculatePassRate(metrics)).toBe('-');
  });
});

describe('getSortedValues', () => {
  it('should sort ascending', () => {
    expect(getSortedValues('asc', 1, 2)).toBe(-1);
    expect(getSortedValues('asc', 2, 1)).toBe(1);
    expect(getSortedValues('asc', 1, 1)).toBe(0);
  });

  it('should sort descending', () => {
    expect(getSortedValues('desc', 1, 2)).toBe(1);
    expect(getSortedValues('desc', 2, 1)).toBe(-1);
    expect(getSortedValues('desc', 1, 1)).toBe(0);
  });
});

describe('getValue', () => {
  it('should get value from metrics', () => {
    const metrics: PromptMetrics = {
      testPassCount: 5,
      testFailCount: 2,
      testErrorCount: 1,
      score: 0.8
    };
    expect(getValue(metrics, 'testPassCount')).toBe(5);
    expect(getValue(metrics, 'testFailCount')).toBe(2);
    expect(getValue(metrics, 'score')).toBe(0.8);
  });

  it('should return 0 for undefined metrics', () => {
    expect(getValue(undefined, 'testPassCount')).toBe(0);
  });

  it('should handle null values in metrics', () => {
    const metrics: PromptMetrics = {
      testPassCount: 0,
      testFailCount: 2,
      testErrorCount: 1,
      score: 0.8
    };
    expect(getValue(metrics, 'testPassCount')).toBe(0);
  });

  it('should return undefined for non-existent field', () => {
    const metrics: PromptMetrics = {
      testPassCount: 5,
      testFailCount: 2,
      testErrorCount: 1,
      score: 0.8
    };
    expect(getValue(metrics as any, 'nonExistentField')).toBeUndefined();
  });
});
