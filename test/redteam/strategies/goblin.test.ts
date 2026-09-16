import { describe, expect, it } from 'vitest';
import { addGoblin } from '../../../src/redteam/strategies/goblin';

import type { TestCase } from '../../../src/types/index';

describe('addGoblin', () => {
  it('adds the Goblin provider, metric suffix, and strategy metadata', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { input: 'test input' },
        assert: [{ type: 'contains', metric: 'exactMatch', value: 'expected output' }],
      },
    ];

    const result = addGoblin(testCases, 'input', { maxTurns: 5, stateful: false });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toMatchObject({
      id: 'promptfoo:redteam:goblin',
      config: {
        injectVar: 'input',
        maxTurns: 5,
        stateful: false,
        scanId: expect.any(String),
      },
    });
    expect(result[0].metadata).toMatchObject({
      strategyId: 'jailbreak:goblin',
      originalText: 'test input',
    });
    expect(result[0].assert).toEqual([
      {
        type: 'contains',
        metric: 'exactMatch/Goblin',
        value: 'expected output',
      },
    ]);
  });

  it('shares one scan id across a generated batch', () => {
    const result = addGoblin(
      [{ vars: { input: 'first' } }, { vars: { input: 'second' } }],
      'input',
      {},
    );

    expect((result[0].provider as any)?.config?.scanId).toBe(
      (result[1].provider as any)?.config?.scanId,
    );
  });
});
