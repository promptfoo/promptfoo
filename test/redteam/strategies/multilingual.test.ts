import { addMultilingual } from '../../../src/redteam/strategies/multilingual';
import type { TestCase } from '../../../src/types';

// Mock the translation function
jest.mock('some-translation-library', () => ({
  translate: jest.fn((text, lang) => Promise.resolve(`${text} in ${lang}`)),
}));

describe('addMultilingual', () => {
  const mockTestCases: TestCase[] = [
    {
      vars: { query: 'Hello, world!' },
      assert: [{ type: 'equals', value: 'Expected output', metric: 'Harmful' }],
    },
  ];

  it('should create translated versions of the test cases', async () => {
    const result = await addMultilingual(mockTestCases, 'query');
    expect(result).toHaveLength(3); // One for each language
    expect(result[0].vars?.query).toBe('Hello, world! in bn');
    expect(result[0].assert![0].metric).toBe('Harmful/Multilingual-BN');
    expect(result[1].vars?.query).toBe('Hello, world! in sw');
    expect(result[1].assert![0].metric).toBe('Harmful/Multilingual-SW');
    expect(result[2].vars?.query).toBe('Hello, world! in jv');
    expect(result[2].assert![0].metric).toBe('Harmful/Multilingual-JV');
  });
});
