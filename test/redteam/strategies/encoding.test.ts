import { describe, expect, it, vi } from 'vitest';
import { addBase64Encoding } from '../../../src/redteam/strategies/base64';
import { mapEncodingTestCases } from '../../../src/redteam/strategies/encoding';
import { addHexEncoding } from '../../../src/redteam/strategies/hex';
import { addLeetspeak } from '../../../src/redteam/strategies/leetspeak';
import { addOtherEncodings, EncodingType } from '../../../src/redteam/strategies/otherEncodings';
import { addRot13 } from '../../../src/redteam/strategies/rot13';

import type { TestCase } from '../../../src/types/index';

const helperOptions = {
  transform: (text: string) => `encoded:${text}`,
  metricSuffix: 'Encoded',
  metadata: { strategyId: 'encoding' },
};

describe('mapEncodingTestCases', () => {
  it('preserves the exact shared mapping contract', () => {
    const transform = vi.fn((text: string) => `encoded:${text}`);
    const testCase: TestCase = {
      vars: { prompt: false, untouched: 'value' },
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
      },
    };
    const originalTestCase = structuredClone(testCase);

    const result = mapEncodingTestCases([testCase], 'prompt', {
      ...helperOptions,
      transform,
      metadata: {
        strategyId: 'encoding',
        encodingType: 'encoding',
        originalText: 'metadata text',
      },
    });

    expect(result).toStrictEqual([
      {
        vars: { prompt: 'encoded:false', untouched: 'value' },
        providerOutput: { output: 'cached' },
        assert: [
          { type: 'equals', value: 'expected', metric: 'Harmful/Encoded' },
          { type: 'contains', value: 'empty metric', metric: '' },
          { type: 'contains', value: 'undefined metric', metric: undefined },
        ],
        metadata: {
          pluginId: 'test-plugin',
          strategyId: 'encoding',
          encodingType: 'encoding',
          originalText: 'false',
        },
      },
    ]);
    expect(transform).toHaveBeenCalledWith('false');
    expect(result[0]).not.toBe(testCase);
    expect(result[0].vars).not.toBe(testCase.vars);
    expect(result[0].assert).not.toBe(testCase.assert);
    result[0].assert?.forEach((assertion, index) => {
      expect(assertion).not.toBe(testCase.assert?.[index]);
    });
    expect(result[0].metadata).not.toBe(testCase.metadata);
    expect(result[0].providerOutput).toBe(testCase.providerOutput);
    expect(testCase).toStrictEqual(originalTestCase);
  });

  it('preserves the error when vars are absent', () => {
    expect(() =>
      mapEncodingTestCases([{ description: 'missing vars' }], 'prompt', helperOptions),
    ).toThrow(TypeError);
  });

  it('coerces an absent injection key and adds its encoded value', () => {
    const result = mapEncodingTestCases(
      [{ vars: { untouched: 'value' } }],
      'prompt',
      helperOptions,
    );

    expect(result).toStrictEqual([
      {
        vars: { untouched: 'value', prompt: 'encoded:undefined' },
        assert: undefined,
        metadata: { strategyId: 'encoding', originalText: 'undefined' },
      },
    ]);
  });
});

const originalText = 'Hello, world!';
type ApplyEncoding = (testCases: TestCase[], injectVar: string) => TestCase[];
type PublicStrategyCase = [string, ApplyEncoding, string, string, Record<string, string>];

const publicStrategies: PublicStrategyCase[] = [
  ['base64', addBase64Encoding, 'SGVsbG8sIHdvcmxkIQ==', 'Base64', { strategyId: 'base64' }],
  ['hex', addHexEncoding, '48 65 6C 6C 6F 2C 20 77 6F 72 6C 64 21', 'Hex', { strategyId: 'hex' }],
  ['rot13', addRot13, 'Uryyb, jbeyq!', 'Rot13', { strategyId: 'rot13' }],
  ['leetspeak', addLeetspeak, 'H3110, w0r1d!', 'Leetspeak', { strategyId: 'leetspeak' }],
  [
    'morse',
    (cases, injectVar) => addOtherEncodings(cases, injectVar, EncodingType.MORSE),
    '.... . .-.. .-.. --- --..-- / .-- --- .-. .-.. -.. -.-.--',
    'Morse',
    { strategyId: 'morse', encodingType: 'morse' },
  ],
  [
    'piglatin',
    (cases, injectVar) => addOtherEncodings(cases, injectVar, EncodingType.PIG_LATIN),
    'elloHay, orldway!',
    'PigLatin',
    { strategyId: 'piglatin', encodingType: 'piglatin' },
  ],
  [
    'camelcase',
    (cases, injectVar) => addOtherEncodings(cases, injectVar, EncodingType.CAMEL_CASE),
    'hello,World!',
    'CamelCase',
    { strategyId: 'camelcase', encodingType: 'camelcase' },
  ],
];

describe('public encoding strategies', () => {
  it.each(publicStrategies)(
    '%s wires its transform, metric suffix, and metadata',
    (_name, apply, encodedPrompt, metricSuffix, strategyMetadata) => {
      const result = apply(
        [
          {
            vars: { prompt: originalText },
            assert: [{ type: 'equals', value: 'expected', metric: 'Harmful' }],
            metadata: { pluginId: 'test-plugin' },
          },
        ],
        'prompt',
      );

      expect(result).toStrictEqual([
        {
          vars: { prompt: encodedPrompt },
          assert: [{ type: 'equals', value: 'expected', metric: `Harmful/${metricSuffix}` }],
          metadata: {
            pluginId: 'test-plugin',
            ...strategyMetadata,
            originalText,
          },
        },
      ]);
    },
  );

  it('emoji uses valid variation selectors that round-trip complex UTF-8', () => {
    const prompt = 'Hello, 世界! 👋\n café';
    const result = addOtherEncodings(
      [
        {
          vars: { prompt },
          assert: [{ type: 'equals', value: 'expected', metric: 'Harmful' }],
          metadata: { pluginId: 'test-plugin' },
        },
      ],
      'prompt',
      EncodingType.EMOJI,
    );
    const chars = Array.from(result[0].vars?.prompt as string);

    expect(chars[0]).toBe('😊');
    expect(chars).toHaveLength(Buffer.byteLength(prompt, 'utf8') + 1);
    const bytes = chars.slice(1).map((char) => {
      const codePoint = char.codePointAt(0)!;
      expect(
        (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
          (codePoint >= 0xe0100 && codePoint <= 0xe01ef),
      ).toBe(true);
      return codePoint <= 0xfe0f ? codePoint - 0xfe00 : codePoint - 0xe0100 + 16;
    });
    expect(Buffer.from(bytes).toString('utf8')).toBe(prompt);
    expect(result[0].assert).toStrictEqual([
      { type: 'equals', value: 'expected', metric: 'Harmful/Emoji' },
    ]);
    expect(result[0].metadata).toStrictEqual({
      pluginId: 'test-plugin',
      strategyId: 'emoji',
      encodingType: 'emoji',
      originalText: prompt,
    });
  });
});
