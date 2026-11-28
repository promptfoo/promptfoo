import { mapEncodingTestCases } from './encoding';

type StrategyTestCases = Parameters<typeof mapEncodingTestCases>[0];

/**
 * Convert printable ASCII characters (0x21-0x7E) to their fullwidth Unicode
 * equivalents (U+FF01-U+FF5E) and ASCII spaces (0x20) to ideographic spaces (U+3000).
 */
export function toFullwidth(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x20) {
      result += '\u3000';
    } else if (code >= 0x21 && code <= 0x7e) {
      result += String.fromCharCode(code + 0xfee0);
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * Add fullwidth Unicode encoding to test cases
 */
export function addFullwidth(testCases: StrategyTestCases, injectVar: string): StrategyTestCases {
  return mapEncodingTestCases(testCases, injectVar, {
    transform: toFullwidth,
    metricSuffix: 'Fullwidth',
    metadata: { strategyId: 'fullwidth' },
  });
}
