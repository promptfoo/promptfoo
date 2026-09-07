import { describe, expect, it } from 'vitest';
import { addRot13 } from '../../../src/redteam/strategies/rot13';

import type { TestCase } from '../../../src/types/index';

describe('addRot13', () => {
  it('should preserve exact test case mapping behavior', () => {
    const testCase: TestCase = {
      description: 'preserved',
      vars: { prompt: true, untouched: 'value' },
      providerOutput: { output: 'cached' },
      assert: [
        { type: 'equals', value: 'expected', metric: 'Harmful' },
        { type: 'contains', value: 'empty metric', metric: '' },
        { type: 'contains', value: 'undefined metric', metric: undefined },
      ],
      metadata: {
        pluginId: 'test-plugin',
        strategyId: 'existing-strategy',
        encodingType: 'existing-encoding',
        originalText: 'existing text',
        custom: 'preserved',
      },
    };
    const originalTestCase = structuredClone(testCase);
    const result = addRot13([testCase], 'prompt');

    expect(result).toEqual([
      {
        description: 'preserved',
        vars: { prompt: 'gehr', untouched: 'value' },
        providerOutput: { output: 'cached' },
        assert: [
          { type: 'equals', value: 'expected', metric: 'Harmful/Rot13' },
          { type: 'contains', value: 'empty metric', metric: '' },
          { type: 'contains', value: 'undefined metric', metric: undefined },
        ],
        metadata: {
          pluginId: 'test-plugin',
          strategyId: 'rot13',
          encodingType: 'existing-encoding',
          originalText: 'true',
          custom: 'preserved',
        },
      },
    ]);
    expect(result[0].vars).not.toBe(testCase.vars);
    expect(result[0].assert).not.toBe(testCase.assert);
    result[0].assert?.forEach((assertion, index) => {
      expect(assertion).not.toBe(testCase.assert?.[index]);
    });
    expect(result[0].providerOutput).toBe(testCase.providerOutput);
    expect(testCase).toEqual(originalTestCase);
  });

  it('should handle uppercase and lowercase letters', () => {
    const testCase: TestCase = {
      vars: { text: 'HELLO hello' },
      assert: [{ type: 'equals', value: 'Test', metric: 'Test' }],
    };
    const result = addRot13([testCase], 'text');
    expect(result[0].vars?.text).toBe('URYYB uryyb');
  });

  it('should not change non-alphabetic characters', () => {
    const testCase: TestCase = {
      vars: { text: 'Hello, World! 123' },
      assert: [{ type: 'equals', value: 'Test', metric: 'Test' }],
    };
    const result = addRot13([testCase], 'text');
    expect(result[0].vars?.text).toBe('Uryyb, Jbeyq! 123');
  });
});
