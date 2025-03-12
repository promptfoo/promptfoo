import { addRot13 } from '../../../src/redteam/strategies/rot13';
import type { TestCase } from '../../../src/types';

describe('addRot13', () => {
  const mockTestCases: TestCase[] = [
    {
      vars: { query: 'Hello, world!' },
      assert: [{ type: 'equals', value: 'Expected output', metric: 'Harmful' }],
    },
    {
      vars: { userInput: 'Test input' },
      assert: [{ type: 'contains', value: 'test', metric: 'DebugAccess' }],
    },
  ];

  it('should encode the inject variable using ROT13', () => {
    const result = addRot13(mockTestCases, 'query');
    expect(result[0].vars?.query).toBe('Uryyb, jbeyq!');
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
