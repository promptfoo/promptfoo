import { addLeetspeak } from '../../../src/redteam/strategies/leetspeak';
import type { TestCase } from '../../../src/types';

describe('addLeetspeak', () => {
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

  it('should convert the inject variable to leetspeak', () => {
    const result = addLeetspeak(mockTestCases, 'query');
    expect(result[0].vars?.query).toBe('H3110, w0r1d!');
  });

  it('should handle uppercase and lowercase letters', () => {
    const testCase: TestCase = {
      vars: { text: 'HELLO hello' },
      assert: [{ type: 'equals', value: 'Test', metric: 'Test' }],
    };
    const result = addLeetspeak([testCase], 'text');
    expect(result[0].vars?.text).toBe('H3110 h3110');
  });
});
