import type { TestCase } from '../../types/index';

/**
 * Convert text to Morse code
 */
export function toMorseCode(text: string): string {
  const morseMap: Record<string, string> = {
    a: '.-',
    b: '-...',
    c: '-.-.',
    d: '-..',
    e: '.',
    f: '..-.',
    g: '--.',
    h: '....',
    i: '..',
    j: '.---',
    k: '-.-',
    l: '.-..',
    m: '--',
    n: '-.',
    o: '---',
    p: '.--.',
    q: '--.-',
    r: '.-.',
    s: '...',
    t: '-',
    u: '..-',
    v: '...-',
    w: '.--',
    x: '-..-',
    y: '-.--',
    z: '--..',
    '0': '-----',
    '1': '.----',
    '2': '..---',
    '3': '...--',
    '4': '....-',
    '5': '.....',
    '6': '-....',
    '7': '--...',
    '8': '---..',
    '9': '----.',
    '.': '.-.-.-',
    ',': '--..--',
    '?': '..--..',
    "'": '.----.',
    '!': '-.-.--',
    '/': '-..-.',
    '(': '-.--.',
    ')': '-.--.-',
    '&': '.-...',
    ':': '---...',
    ';': '-.-.-.',
    '=': '-...-',
    '+': '.-.-.',
    '-': '-....-',
    _: '..--.-',
    '"': '.-..-.',
    $: '...-..-',
    '@': '.--.-.',
  };

  return text
    .toLowerCase()
    .split('')
    .map((char) => {
      if (char === ' ') {
        return '/';
      }
      return morseMap[char] || char;
    })
    .join(' ');
}

/**
 * Convert one alphanumeric run to Pig Latin.
 */
function pigLatinWord(word: string): string {
  if (!/^[a-zA-Z]/.test(word)) {
    return word;
  }

  if (/^[aeiouAEIOU]/.test(word)) {
    return word + 'way';
  }

  const vowelIndex = word.search(/[aeiouAEIOU]/i);

  if (vowelIndex === -1) {
    return word + 'ay';
  }

  const prefix = word.substring(0, vowelIndex);
  const suffix = word.substring(vowelIndex);
  return suffix + prefix + 'ay';
}

/**
 * Convert text to Pig Latin while preserving punctuation in place.
 */
export function toPigLatin(text: string): string {
  return text.replace(/[a-zA-Z0-9]+/g, (run) => pigLatinWord(run));
}

/**
 * Convert text to camelCase
 */
export function toCamelCase(text: string): string {
  const trimmedText = text.trim();
  const words = trimmedText.split(/\s+/); // Split on any whitespace
  return words
    .map((word, index) => {
      const match = word.match(/^([a-zA-Z0-9]+)(.*)$/);
      if (!match) {
        return word;
      }
      const baseWord = match[1];
      const punctuation = match[2];
      const transformed =
        index === 0
          ? baseWord.toLowerCase()
          : baseWord.charAt(0).toUpperCase() + baseWord.slice(1).toLowerCase();
      return transformed + punctuation;
    })
    .join('');
}

/**
 * Encode UTF-8 text using variation selector smuggling.
 * Each byte is mapped to an invisible Unicode variation selector and
 * appended to a base emoji which acts as a carrier.
 */
export function toEmojiEncoding(text: string, baseEmoji = '😊'): string {
  const bytes = Buffer.from(text, 'utf8');
  let payload = '';
  for (const byte of bytes) {
    const codePoint = byte < 16 ? 0xfe00 + byte : 0xe0100 + (byte - 16);
    payload += String.fromCodePoint(codePoint);
  }
  return baseEmoji + payload;
}

export const EncodingType = {
  MORSE: 'morse',
  PIG_LATIN: 'piglatin',
  CAMEL_CASE: 'camelcase',
  EMOJI: 'emoji',
} as const;

export type EncodingType = (typeof EncodingType)[keyof typeof EncodingType];

/**
 * Apply the specified encoding transformation to test cases
 */
export function addOtherEncodings(
  testCases: TestCase[],
  injectVar: string,
  encodingType: EncodingType = EncodingType.MORSE,
): TestCase[] {
  // Choose the transformation based on encoding type
  const transformer = (() => {
    switch (encodingType) {
      case EncodingType.MORSE:
        return toMorseCode;
      case EncodingType.PIG_LATIN:
        return toPigLatin;
      case EncodingType.CAMEL_CASE:
        return toCamelCase;
      case EncodingType.EMOJI:
        return (text: string) => toEmojiEncoding(text);
      default:
        return toMorseCode; // Default to Morse code
    }
  })();

  // Get a display name for the encoding
  const encodingName = (() => {
    switch (encodingType) {
      case EncodingType.MORSE:
        return 'Morse';
      case EncodingType.PIG_LATIN:
        return 'PigLatin';
      case EncodingType.CAMEL_CASE:
        return 'CamelCase';
      case EncodingType.EMOJI:
        return 'Emoji';
      default:
        return encodingType;
    }
  })();

  return testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/${encodingName}`,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: transformer(originalText),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: encodingType,
        encodingType,
        originalText,
      },
    };
  });
}
