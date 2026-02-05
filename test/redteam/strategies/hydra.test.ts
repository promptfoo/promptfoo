import { describe, expect, it } from 'vitest';
import { addHydra } from '../../../src/redteam/strategies/hydra';

import type { TestCase } from '../../../src/types/index';

describe('addHydra', () => {
  it('should add hydra configuration to test cases', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case 1',
        vars: { input: 'test input' },
        assert: [
          {
            type: 'contains',
            metric: 'exactMatch',
            value: 'expected output',
          },
        ],
      },
    ];

    const injectVar = 'input';
    const config = { maxTurns: 5, stateful: false };

    const result = addHydra(testCases, injectVar, config);

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Test case 1');
    expect(result[0].vars).toEqual({ input: 'test input' });
    expect(result[0].provider).toMatchObject({
      id: 'promptfoo:redteam:hydra',
      config: {
        injectVar: 'input',
        maxTurns: 5,
        stateful: false,
        scanId: expect.any(String),
      },
    });
    expect(result[0].metadata).toMatchObject({
      strategyId: 'jailbreak:hydra',
      originalText: 'test input',
    });
    expect(result[0].assert).toEqual([
      {
        type: 'contains',
        metric: 'exactMatch/Hydra',
        value: 'expected output',
      },
    ]);
  });

  it('should handle test cases without assertions', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case without assertions',
        vars: { input: 'test input' },
      },
    ];

    const result = addHydra(testCases, 'input', {});

    expect(result).toHaveLength(1);
    expect(result[0].assert).toBeUndefined();
    expect(result[0].provider).toMatchObject({
      id: 'promptfoo:redteam:hydra',
      config: {
        injectVar: 'input',
        scanId: expect.any(String),
      },
    });
    expect(result[0].metadata).toMatchObject({
      strategyId: 'jailbreak:hydra',
      originalText: 'test input',
    });
  });

  it('should handle empty test cases array', () => {
    const result = addHydra([], 'inject', {});
    expect(result).toEqual([]);
  });

  it('should preserve other test case properties', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { input: 'test' },
        provider: { id: 'original-provider' },
        assert: [{ type: 'contains', metric: 'test', value: 'value' }],
        otherProp: 'should be preserved',
      } as TestCase & { otherProp: string },
    ];

    const result = addHydra(testCases, 'input', {});

    expect(result[0]).toMatchObject({
      description: 'Test case',
      vars: { input: 'test' },
      otherProp: 'should be preserved',
      provider: {
        id: 'promptfoo:redteam:hydra',
        config: {
          injectVar: 'input',
          scanId: expect.any(String),
        },
      },
      metadata: {
        strategyId: 'jailbreak:hydra',
        originalText: 'test',
      },
    });
  });

  it('should use same scanId for all test cases in a batch', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case 1',
        vars: { input: 'test 1' },
      },
      {
        description: 'Test case 2',
        vars: { input: 'test 2' },
      },
      {
        description: 'Test case 3',
        vars: { input: 'test 3' },
      },
    ];

    const result = addHydra(testCases, 'input', {});

    expect(result).toHaveLength(3);

    // Extract scanIds from all test cases
    const scanId1 = (result[0].provider as any)?.config?.scanId;
    const scanId2 = (result[1].provider as any)?.config?.scanId;
    const scanId3 = (result[2].provider as any)?.config?.scanId;

    // All should be the same
    expect(scanId1).toBe(scanId2);
    expect(scanId2).toBe(scanId3);
    expect(scanId1).toBeDefined();
  });

  it('should pass through custom config options', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { query: 'test query' },
      },
    ];

    const customConfig = {
      maxTurns: 15,
      maxBacktracks: 5,
      stateful: true,
    };

    const result = addHydra(testCases, 'query', customConfig);

    expect((result[0].provider as any)?.config).toMatchObject({
      injectVar: 'query',
      maxTurns: 15,
      maxBacktracks: 5,
      stateful: true,
      scanId: expect.any(String),
    });
  });

  it('should handle non-string vars by converting to string', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test with number',
        vars: { input: 123 as any },
      },
      {
        description: 'Test with object',
        vars: { input: { nested: 'value' } as any },
      },
    ];

    const result = addHydra(testCases, 'input', {});

    expect(result[0].metadata?.originalText).toBe('123');
    expect(result[1].metadata?.originalText).toBe('[object Object]');
  });

  it('should preserve existing metadata fields', () => {
    const testCases: TestCase[] = [
      {
        description: 'Test case',
        vars: { input: 'test' },
        metadata: {
          pluginId: 'harmful:violent-crime',
          goal: 'Test goal',
          existingField: 'should be preserved',
        },
      },
    ];

    const result = addHydra(testCases, 'input', {});

    expect(result[0].metadata).toEqual({
      pluginId: 'harmful:violent-crime',
      goal: 'Test goal',
      existingField: 'should be preserved',
      strategyId: 'jailbreak:hydra',
      originalText: 'test',
    });
  });

  describe('Privacy protection - excludeTargetOutputFromAgenticAttackGeneration', () => {
    it('should pass privacy flag through to provider config when enabled', () => {
      const testCases: TestCase[] = [
        {
          description: 'Test case with privacy enabled',
          vars: { input: 'test input' },
        },
      ];

      const config = {
        maxTurns: 5,
        stateful: false,
        excludeTargetOutputFromAgenticAttackGeneration: true,
      };

      const result = addHydra(testCases, 'input', config);

      expect(result).toHaveLength(1);
      expect(
        (result[0].provider as any)?.config?.excludeTargetOutputFromAgenticAttackGeneration,
      ).toBe(true);
    });

    it('should pass privacy flag when disabled', () => {
      const testCases: TestCase[] = [
        {
          description: 'Test case with privacy disabled',
          vars: { input: 'test input' },
        },
      ];

      const config = {
        maxTurns: 5,
        stateful: false,
        excludeTargetOutputFromAgenticAttackGeneration: false,
      };

      const result = addHydra(testCases, 'input', config);

      expect(result).toHaveLength(1);
      expect(
        (result[0].provider as any)?.config?.excludeTargetOutputFromAgenticAttackGeneration,
      ).toBe(false);
    });

    it('should default to undefined when privacy flag not specified', () => {
      const testCases: TestCase[] = [
        {
          description: 'Test case without privacy flag',
          vars: { input: 'test input' },
        },
      ];

      const config = {
        maxTurns: 5,
        stateful: false,
      };

      const result = addHydra(testCases, 'input', config);

      expect(result).toHaveLength(1);
      const privacyFlag = (result[0].provider as any)?.config
        ?.excludeTargetOutputFromAgenticAttackGeneration;
      expect(privacyFlag).toBeFalsy();
    });

    it('should pass privacy flag alongside other config options', () => {
      const testCases: TestCase[] = [
        {
          description: 'Test case with full config',
          vars: { query: 'test query' },
        },
      ];

      const config = {
        maxTurns: 15,
        maxBacktracks: 5,
        stateful: true,
        excludeTargetOutputFromAgenticAttackGeneration: true,
      };

      const result = addHydra(testCases, 'query', config);

      expect((result[0].provider as any)?.config).toMatchObject({
        injectVar: 'query',
        maxTurns: 15,
        maxBacktracks: 5,
        stateful: true,
        excludeTargetOutputFromAgenticAttackGeneration: true,
        scanId: expect.any(String),
      });
    });

    it('should apply privacy flag to all test cases in a batch', () => {
      const testCases: TestCase[] = [
        {
          description: 'Test case 1',
          vars: { input: 'test 1' },
        },
        {
          description: 'Test case 2',
          vars: { input: 'test 2' },
        },
        {
          description: 'Test case 3',
          vars: { input: 'test 3' },
        },
      ];

      const config = {
        excludeTargetOutputFromAgenticAttackGeneration: true,
      };

      const result = addHydra(testCases, 'input', config);

      expect(result).toHaveLength(3);

      // All test cases should have privacy flag set
      result.forEach((testCase) => {
        expect(
          (testCase.provider as any)?.config?.excludeTargetOutputFromAgenticAttackGeneration,
        ).toBe(true);
      });
    });
  });
});
