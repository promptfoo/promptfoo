import { describe, expect, it } from 'vitest';
import { isTextBlob } from '../../../src/codeScan/git/blobText';

describe('Git blob text detection', () => {
  it('accepts empty content, whitespace and Unicode at sample boundaries', () => {
    expect(isTextBlob(Buffer.alloc(0))).toBe(true);
    expect(isTextBlob(Buffer.from('a\tb\r\nc'))).toBe(true);
    for (const character of ['é', '中', '😀']) {
      for (const prefix of ['', 'a', 'ab', 'abc']) {
        expect(isTextBlob(Buffer.from(prefix + character.repeat(64)))).toBe(true);
      }
    }
  });

  it.each([0, 40, 127])('rejects binary markers in a sample at byte %i', (offset) => {
    for (const byte of [0, 8, 0x80, 0xff]) {
      const bytes = Buffer.alloc(128, 65);
      bytes[offset] = byte;
      expect(isTextBlob(bytes)).toBe(false);
    }
  });

  it('checks the entire trailing sample when it starts inside a Unicode character', () => {
    const bytes = Buffer.alloc(128, 65);
    bytes.write('😀', 101);
    expect(isTextBlob(bytes)).toBe(true);
    bytes[127] = 0;
    expect(isTextBlob(bytes)).toBe(false);
  });

  it('recognizes a replacement character and a truncated multibyte sequence', () => {
    expect(isTextBlob(Buffer.from('abc\uFFFD'))).toBe(false);
    expect(isTextBlob(Buffer.from([0xf0, 0x9f, 0x98]))).toBe(false);
  });

  it('samples the beginning, middle and end of long files', () => {
    const bytes = Buffer.alloc(128, 65);
    bytes[24] = 0;
    bytes[64] = 0;
    expect(isTextBlob(bytes)).toBe(true);
  });
});
