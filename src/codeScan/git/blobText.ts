// If a sample cuts a UTF-8 character, include the complete character when decoding.
// A lead byte can precede the cut by at most three bytes.
function utf8Boundary(bytes: Buffer, offset: number, edge: 'start' | 'end'): number {
  if (offset === 0 || offset === bytes.length) {
    return offset;
  }
  if (edge === 'start' && (bytes[offset] & 0xc0) !== 0x80) {
    return offset;
  }
  for (let i = Math.max(0, offset - 3); i < offset; i++) {
    const lead = bytes[i];
    let width = 1;
    if ((lead & 0xf8) === 0xf0) {
      width = 4;
    } else if ((lead & 0xf0) === 0xe0) {
      width = 3;
    } else if ((lead & 0xe0) === 0xc0) {
      width = 2;
    }
    if (i + width > offset) {
      return edge === 'start' ? i : i + width;
    }
  }
  return offset;
}

export function isTextBlob(bytes: Buffer): boolean {
  const size = 24;
  const middle = Math.floor(bytes.length / 2);
  return [0, middle - size, bytes.length - size].every((offset) => {
    const sampleStart = Math.max(0, offset);
    const start = utf8Boundary(bytes, sampleStart, 'start');
    const end = utf8Boundary(bytes, Math.min(sampleStart + size, bytes.length), 'end');
    // Buffer decodes malformed UTF-8 as U+FFFD. Tabs, newlines and CR are valid text.
    return end <= bytes.length && !/[\x00-\x08\uFFFD]/u.test(bytes.toString('utf8', start, end));
  });
}
