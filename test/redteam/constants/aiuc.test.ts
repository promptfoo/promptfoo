import { describe, expect, it } from 'vitest';
import { AIUC_1_MAPPING, ALL_PLUGINS, COLLECTIONS } from '../../../src/redteam/constants';
import { RedteamConfigSchema } from '../../../src/validators/redteam';

describe('AIUC-1 preset', () => {
  it('filters reports independently of test selection', () => {
    const result = RedteamConfigSchema.parse({ frameworks: ['aiuc:1'], plugins: ['contracts'] });
    expect(result.frameworks).toEqual(['aiuc:1']);
    expect(result.plugins).toEqual([{ id: 'contracts' }]);
    expect(RedteamConfigSchema.parse({ plugins: ['aiuc:1'] }).frameworks).toBeUndefined();
    expect(RedteamConfigSchema.safeParse({ frameworks: ['aiuc:1:a009'] }).success).toBe(false);
  });

  it.each([
    ['a009', 'prompt-extraction'],
    ['b001', 'coding-agent:generated-vulnerability'],
    ['c010', 'harmful:self-harm'],
    ['d004', 'rag-source-attribution'],
    ['f001', 'harmful:cybercrime'],
    ['f002', 'harmful:indiscriminate-weapons'],
  ])('expands %s to its own runnable plugins', (control, representative) => {
    const id = 'aiuc:1:' + control;
    const result = RedteamConfigSchema.parse({ plugins: [id], strategies: ['basic'] });
    const ids = result.plugins!.map((p) => p.id);
    expect(ids).toContain(representative);
    expect(new Set(ids)).toEqual(new Set(AIUC_1_MAPPING[id].plugins));
    for (const plugin of ids) {
      expect(ALL_PLUGINS).toContain(plugin);
      expect(COLLECTIONS).not.toContain(plugin);
    }
    expect(result.strategies).toEqual([]); // basic runs implicitly
  });

  it('rejects unknown and unsupported control aliases instead of running unrelated tests', () => {
    expect(RedteamConfigSchema.safeParse({ plugins: ['aiuc:1:a000'] }).success).toBe(false);
    expect(() => RedteamConfigSchema.parse({ plugins: ['aiuc:1:e018'] })).toThrow(
      /no built-in tests/,
    );
  });

  it('keeps configured variants without scheduling a bare copy across overlapping frameworks', () => {
    const variants = ['document', 'email'].map((indirectInjectionVar) => ({
      id: 'indirect-prompt-injection',
      config: { indirectInjectionVar },
      numTests: 1,
    }));
    const result = RedteamConfigSchema.parse({
      plugins: [...variants, 'aiuc:1:b001', 'owasp:llm:01'],
    });
    expect(result.plugins?.filter((p) => p.id === 'indirect-prompt-injection')).toEqual(variants);
  });

  it.each([false, true])(
    'prefers explicit plugins over controls over the preset (reversed: %s)',
    (reverse) => {
      const fixture = {
        id: 'indirect-prompt-injection',
        config: { indirectInjectionVar: 'document' },
        severity: 'high',
        numTests: 2,
      };
      const plugins = ['aiuc:1', { id: 'aiuc:1:b001', numTests: 3 }, fixture, 'pii'];
      const result = RedteamConfigSchema.parse({
        plugins: reverse ? plugins.reverse() : plugins,
        numTests: 1,
        strategies: ['basic', { id: 'jailbreak:meta', config: { numTests: 1 } }, 'crescendo'],
      });
      const expected = new Set(Object.values(AIUC_1_MAPPING).flatMap((c) => c.plugins));
      expect(result.plugins).toHaveLength(expected.size);
      expect(new Set(result.plugins!.map((p) => p.id))).toEqual(expected);
      expect(result.plugins).toContainEqual(fixture);
      expect(result.plugins).toContainEqual({ id: 'bola', numTests: 3 });
      expect(result.plugins).toContainEqual({ id: 'pii:direct', numTests: 1 });
      expect(result.strategies).toEqual([
        { id: 'crescendo' },
        { id: 'jailbreak:meta', config: { numTests: 1 } },
      ]);
    },
  );
});
