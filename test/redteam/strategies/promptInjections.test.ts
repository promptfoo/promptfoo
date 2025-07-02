import { addInjections } from '../../../src/redteam/strategies/promptInjections';
import type { TestCase } from '../../../src/types';

describe('addInjections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      strategyId: 'prompt-injection',
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
      expect(testCase.metadata?.strategyId).toBe('prompt-injection');
      // The injection might modify the prompt in various ways
      expect(testCase.vars?.prompt).toBeDefined();
      expect(testCase.vars?.prompt).not.toBe('Hello world'); // Should be modified
    });
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
    expect(result[0].metadata?.strategyId).toBe('prompt-injection');
  });
});
