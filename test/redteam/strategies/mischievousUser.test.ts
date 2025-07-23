import { describe, expect, it } from '@jest/globals';
import { addMischievousUser } from '../../../src/redteam/strategies/mischievousUser';

import type { TestCase } from '../../../src/types';

describe('Mischievous User Strategy', () => {
  it('should add mischievous user configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        vars: { instructions: 'hi' },
        assert: [{ type: 'contains', metric: 'exactMatch', value: 'expected' }],
      },
    ];

    const result = addMischievousUser(testCases, 'instructions', { maxTurns: 3 });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:mischievous-user',
      config: { injectVar: 'instructions', maxTurns: 3 },
    });
    expect(result[0].assert?.[0].metric).toBe('exactMatch/MischievousUser');
    expect(result[0].metadata).toEqual({ strategyId: 'mischievous-user' });
  });
});
