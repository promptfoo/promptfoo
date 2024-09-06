import { addBase64Encoding } from '../../../src/redteam/strategies/base64';
import type { TestCase } from '../../../src/types';

describe('addBase64Encoding', () => {
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

  it('should encode the inject variable to base64', () => {
    const result = addBase64Encoding(mockTestCases, 'query');
    expect(result[0].vars?.query).toBe('SGVsbG8sIHdvcmxkIQ==');
  });
});
