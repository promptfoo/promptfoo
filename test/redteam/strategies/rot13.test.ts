import { describe, expect, it } from 'vitest';
import { addRot13 } from '../../../src/redteam/strategies/rot13';

import type { TestCase } from '../../../src/types/index';

describe('addRot13', () => {
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
