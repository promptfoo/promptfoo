import { describe, expect, it } from 'vitest';
import { addBase64Encoding } from '../../../src/redteam/strategies/base64';

import type { TestCase } from '../../../src/types/index';

describe('addBase64Encoding', () => {
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
    const result = addBase64Encoding([testCase], 'prompt');

    expect(result).toEqual([
      {
        description: 'preserved',
        vars: { prompt: 'dHJ1ZQ==', untouched: 'value' },
        providerOutput: { output: 'cached' },
        assert: [
          { type: 'equals', value: 'expected', metric: 'Harmful/Base64' },
          { type: 'contains', value: 'empty metric', metric: '' },
          { type: 'contains', value: 'undefined metric', metric: undefined },
        ],
        metadata: {
          pluginId: 'test-plugin',
          strategyId: 'base64',
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
});
