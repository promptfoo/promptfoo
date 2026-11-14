import { describe, expect, it } from 'vitest';
import { Strategies } from '../../../src/redteam/strategies/index';
import { addPosteriorAttack } from '../../../src/redteam/strategies/posterior';

describe('posterior', () => {
  it('uses the registered local strategy and preserves the input and metric', async () => {
    const input = {
      vars: { query: 'fixture café' },
      assert: [{ type: 'contains' as const, metric: 'Fixture' }],
    };
    const strategy = Strategies.find(({ id }) => id === 'posterior')!;
    const [result] = await strategy.action([input], 'query', {});
    expect(result.vars?.query).toContain('fixture café');
    expect(result.metadata).toMatchObject({
      strategyId: 'posterior',
      originalText: 'fixture café',
    });
    expect(result.assert?.[0]?.metric).toBe('Fixture/Posterior');
    expect(input.vars.query).toBe('fixture café');
  });

  it('rejects generated multi-input cases and missing injection variables', () => {
    expect(() =>
      addPosteriorAttack([{ metadata: { pluginConfig: { inputs: { a: 'value' } } } }], 'query'),
    ).toThrow('does not support multi-input');
    expect(() => addPosteriorAttack([{}], 'query')).toThrow('contain a string');
  });
});
