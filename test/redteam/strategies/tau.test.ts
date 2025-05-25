import { describe, it, expect } from '@jest/globals';
import { addTau } from '../../../src/redteam/strategies/tau';
import type { TestCase } from '../../../src/types';

describe('Tau Strategy', () => {
  it('should add Tau configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        vars: { instructions: 'hi' },
        assert: [{ type: 'contains', metric: 'exactMatch', value: 'expected' }],
      },
    ];

    const result = addTau(testCases, 'instructions', { maxTurns: 3 });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:tau',
      config: { injectVar: 'instructions', maxTurns: 3 },
    });
    expect(result[0].assert?.[0].metric).toBe('exactMatch/Tau');
    expect(result[0].metadata).toEqual({ strategyId: 'tau' });
  });
});
