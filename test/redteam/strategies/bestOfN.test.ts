import { describe, expect, it } from 'vitest';
import { addBestOfNTestCases } from '../../../src/redteam/strategies/bestOfN';

import type { TestCaseWithPlugin } from '../../../src/types/index';

describe('addBestOfNTestCases', () => {
  it('should add best-of-n configuration to test cases with basic refusal', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', { useBasicRefusal: true });

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar: 'input',
        useBasicRefusal: true,
      },
    });
    expect(result[0].assert).toEqual([
      {
        type: 'is-refusal',
        metric: 'accuracy/BestOfN',
      },
    ]);
    expect(result[0].metadata).toEqual({
      pluginId: 'test-plugin',
      strategyId: 'best-of-n',
      originalText: 'test',
    });
  });

  it('preserves only safe-control rubrics when using basic refusal checks', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'safe request' },
        assert: [
          {
            type: 'llm-rubric',
            value: 'Safe requests should be answered',
            metric: 'Aegis',
            config: {
              redteamSafeControl: {
                context: {
                  purpose: 'support assistant',
                  prompt: 'safe request',
                },
              },
            },
          },
          {
            type: 'promptfoo:redteam:aegis',
            metric: 'Aegis',
          },
        ],
        metadata: {
          pluginId: 'promptfoo:redteam:aegis',
          isSafe: true,
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', { useBasicRefusal: true });

    expect(result[0].assert).toEqual([
      {
        type: 'llm-rubric',
        value: 'Safe requests should be answered',
        metric: 'Aegis/BestOfN',
        config: {
          redteamSafeControl: {
            context: {
              purpose: 'support assistant',
              prompt: 'safe request',
            },
          },
        },
      },
    ]);
  });

  it('keeps one basic refusal assertion for multiple ordinary assertions', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'unsafe request' },
        assert: [
          {
            type: 'promptfoo:redteam:aegis',
            metric: 'Aegis',
          },
          {
            type: 'llm-rubric',
            value: 'Unsafe requests should be refused',
            metric: 'AegisRubric',
          },
        ],
        metadata: {
          pluginId: 'promptfoo:redteam:aegis',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', { useBasicRefusal: true });

    expect(result[0].assert).toEqual([
      {
        type: 'is-refusal',
        metric: 'Aegis/BestOfN',
      },
    ]);
  });

  it('should add best-of-n configuration without basic refusal', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].assert).toEqual([
      {
        type: 'equals',
        value: 'expected',
        metric: 'accuracy/BestOfN',
      },
    ]);
  });

  it('should handle test cases without assertions', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].provider).toEqual({
      id: 'promptfoo:redteam:best-of-n',
      config: {
        injectVar: 'input',
      },
    });
    expect(result[0].assert).toBeUndefined();
  });

  it('should handle empty test cases array', async () => {
    const result = await addBestOfNTestCases([], 'input', {});
    expect(result).toEqual([]);
  });

  it('should preserve additional test case properties', async () => {
    const testCases: TestCaseWithPlugin[] = [
      {
        vars: { input: 'test' },
        description: 'Test description',
        assert: [
          {
            type: 'equals',
            value: 'expected',
            metric: 'accuracy',
          },
        ],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ];

    const result = await addBestOfNTestCases(testCases, 'input', {});

    expect(result[0].description).toBe('Test description');
    expect(result[0].vars).toEqual({ input: 'test' });
  });
});
