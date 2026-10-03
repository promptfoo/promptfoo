import { describe, expect, it } from 'vitest';
import { addBase64Encoding } from '../../../src/redteam/strategies/base64';
import { addHexEncoding } from '../../../src/redteam/strategies/hex';
import { addHomoglyphs } from '../../../src/redteam/strategies/homoglyph';
import { addLeetspeak } from '../../../src/redteam/strategies/leetspeak';
import { addRot13 } from '../../../src/redteam/strategies/rot13';

import type { TestCase } from '../../../src/types/index';

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

  it.each([
    [addBase64Encoding, 'base64', 'Base64'],
    [addHexEncoding, 'hex', 'Hex'],
    [addHomoglyphs, 'homoglyph', 'Homoglyph'],
    [addLeetspeak, 'leetspeak', 'Leetspeak'],
    [addRot13, 'rot13', 'Rot13'],
  ] as const)('preserves fields for %s', (encode, strategyId, suffix) => {
    const [result] = encode(mockTestCases, 'query');
    expect(result.assert?.[0].metric).toBe(`Harmful/${suffix}`);
    expect(result.metadata).toEqual({ strategyId, originalText: 'Hello, world!' });
    expect(mockTestCases[0].assert?.[0].metric).toBe('Harmful');
    expect(result.vars).not.toBe(mockTestCases[0].vars);
  });

  it('should encode the inject variable to base64', () => {
    const result = addBase64Encoding(mockTestCases, 'query');
    expect(result[0].vars?.query).toBe('SGVsbG8sIHdvcmxkIQ==');
    expect(result[0].metadata).toEqual({
      strategyId: 'base64',
      originalText: 'Hello, world!',
    });
  });
});
