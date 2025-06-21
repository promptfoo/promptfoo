import { describe, it, expect } from '@jest/globals';
import { addSimulatedUser } from '../../../src/redteam/strategies/simulatedUser';
import type { TestCase } from '../../../src/types';

describe('Simulated User Strategy', () => {
  it('should add simulated user configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        vars: { instructions: 'hi' },
        assert: [{ type: 'contains', metric: 'exactMatch', value: 'expected' }],
      },
    ];

    const result = addSimulatedUser(testCases, 'instructions', { maxTurns: 3 });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:simulated-user',
      config: { injectVar: 'instructions', maxTurns: 3 },
    });
    expect(result[0].assert?.[0].metric).toBe('exactMatch/SimulatedUser');
    expect(result[0].metadata).toEqual({ strategyId: 'simulated-user' });
  });
});
