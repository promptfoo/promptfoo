import { describe, expect, it } from 'vitest';
import {
  collectAssertedComponentResults,
  collectCountableComponentResults,
} from '../../src/assertions/componentResults';

import type { Assertion, GradingResult } from '../../src/types/index';

describe('componentResults helpers', () => {
  it('collectAssertedComponentResults skips anonymous leaves and wrappers', () => {
    const assertedLeaf: GradingResult = {
      pass: true,
      score: 1,
      reason: 'asserted leaf',
      assertion: { type: 'equals', value: 'ok' } as Assertion,
    };
    const anonymousLeaf: GradingResult = {
      pass: false,
      score: 0,
      reason: 'anonymous leaf',
    };
    const anonymousWrapper: GradingResult = {
      pass: false,
      score: 0,
      reason: 'anonymous wrapper',
      componentResults: [assertedLeaf, anonymousLeaf],
    };

    expect(collectAssertedComponentResults([anonymousWrapper])).toEqual([assertedLeaf]);
  });

  it('collectCountableComponentResults includes anonymous leaves but skips wrappers', () => {
    const assertedLeaf: GradingResult = {
      pass: true,
      score: 1,
      reason: 'asserted leaf',
      assertion: { type: 'contains', value: 'ok' } as Assertion,
    };
    const anonymousLeaf: GradingResult = {
      pass: false,
      score: 0,
      reason: 'anonymous leaf',
    };
    const anonymousWrapper: GradingResult = {
      pass: false,
      score: 0,
      reason: 'anonymous wrapper',
      componentResults: [assertedLeaf, anonymousLeaf],
    };

    expect(collectCountableComponentResults([anonymousWrapper])).toEqual([
      assertedLeaf,
      anonymousLeaf,
    ]);
  });
});
