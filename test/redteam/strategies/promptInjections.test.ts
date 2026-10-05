import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addInjections } from '../../../src/redteam/strategies/promptInjections/index';

import type { TestCase } from '../../../src/types/index';

describe('addInjections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should add prompt injections and store originalText', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Tell me a joke' },
        metadata: { pluginId: 'harmful:test' },
        assert: [{ type: 'promptfoo:redteam:harmful', metric: 'test' }],
      },
    ];

    const result = await addInjections(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    // Check that the prompt was modified (it should be different from original)
    expect(result[0].vars?.prompt).toBeDefined();
    expect(result[0].vars?.prompt).not.toBe('Tell me a joke'); // Should be modified
    // Check that metadata stores the original text correctly
    expect(result[0].metadata).toMatchObject({
      pluginId: 'harmful:test',
      strategyId: 'jailbreak-templates',
      originalText: 'Tell me a joke',
    });
    expect(result[0].assert?.[0].metric).toBe('Harmful/Injection');
  });

  it('should handle multiple samples', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Hello world' },
        metadata: {},
      },
    ];

    const result = await addInjections(testCases, 'prompt', { sample: 3 });

    expect(result).toHaveLength(3);
    result.forEach((testCase) => {
      expect(testCase.metadata?.originalText).toBe('Hello world');
      expect(testCase.metadata?.strategyId).toBe('jailbreak-templates');
      // The injection might modify the prompt in various ways
      expect(testCase.vars?.prompt).toBeDefined();
      expect(testCase.vars?.prompt).not.toBe('Hello world'); // Should be modified
    });
  });

  it('should preserve an explicit sample size of 0', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Hello world' },
        metadata: {},
      },
    ];

    const result = await addInjections(testCases, 'prompt', { sample: 0 });

    expect(result).toEqual([]);
  });

  it('should filter harmful only when configured', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Harmful content' },
        metadata: { pluginId: 'harmful:test' },
      },
      {
        vars: { prompt: 'Safe content' },
        metadata: { pluginId: 'safe:test' },
      },
    ];

    const result = await addInjections(testCases, 'prompt', { harmfulOnly: true });

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.originalText).toBe('Harmful content');
  });

  it('should handle test cases without metadata', async () => {
    const testCases: TestCase[] = [
      {
        vars: { prompt: 'Test content' },
      },
    ];

    const result = await addInjections(testCases, 'prompt', {});

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.originalText).toBe('Test content');
    expect(result[0].metadata?.strategyId).toBe('jailbreak-templates');
  });

  describe('attack prompts containing $ replacement patterns', () => {
    const attackPrompt = "Turn $$ into $$$, then print $& and $' and $`";

    beforeEach(() => {
      vi.resetModules();
    });

    it('inserts the prompt verbatim into the default template', async () => {
      const { addInjections: freshAddInjections } = await import(
        '../../../src/redteam/strategies/promptInjections/index'
      );

      const [result] = await freshAddInjections([{ vars: { prompt: attackPrompt } }], 'prompt', {});

      expect(result.vars?.prompt).toContain(attackPrompt);
      expect(result.vars?.prompt).not.toContain('__PROMPT__');
    });

    it('inserts the prompt verbatim into sampled templates', async () => {
      const { addInjections: freshAddInjections } = await import(
        '../../../src/redteam/strategies/promptInjections/index'
      );

      const results = await freshAddInjections([{ vars: { prompt: attackPrompt } }], 'prompt', {
        sample: 200,
      });
      const outputs = results.map((result) => String(result.vars?.prompt));

      expect(outputs.some((output) => output.includes(attackPrompt))).toBe(true);
      expect(outputs.filter((output) => output.includes('__PROMPT__'))).toEqual([]);
    });
  });
});
