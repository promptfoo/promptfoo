const CHARACTER_NAMES: Record<number, string> = {
  0x00a0: 'NO-BREAK SPACE',
  0x00ad: 'SOFT HYPHEN',
  0x2007: 'FIGURE SPACE',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING',
  0x202d: 'LEFT-TO-RIGHT OVERRIDE',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x202f: 'NARROW NO-BREAK SPACE',
  0x2060: 'WORD JOINER',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE',
};

/** Descriptive metadata, separate from the original text and any grading verdict. */
export function formatCharacterFacts(
  text: string,
  maxOccurrences = 20,
  contextRadius = 20,
): string {
  if (typeof text !== 'string') {
    throw new TypeError('characterFacts expects a string; serialize structured values with dump');
  }
  if (!Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1) {
    throw new RangeError('characterFacts maxOccurrences must be a positive safe integer');
  }
  if (!Number.isSafeInteger(contextRadius) || contextRadius < 0) {
    throw new RangeError('characterFacts contextRadius must be a nonnegative safe integer');
  }

  const characters = Array.from(text);
  const entries: string[] = [];
  let total = 0;
  let line = 1;
  let column = 1;
  for (const [index, character] of characters.entries()) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > 0x7f && /[\p{White_Space}\p{Cf}]/u.test(character)) {
      total++;
      if (entries.length < maxOccurrences) {
        const context = characters
          .slice(Math.max(0, index - contextRadius), index + contextRadius + 1)
          .join('');
        // Escape UTF-16 units so supplementary code points become JSON surrogate pairs.
        const escapedContext = JSON.stringify(context).replace(
          /[^\x00-\x7f]/g,
          (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`,
        );
        const name = CHARACTER_NAMES[codePoint] ?? 'UNICODE WHITESPACE OR FORMAT CHARACTER';
        entries.push(
          `- line ${line}, column ${column}: U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} ${name}; escaped context: ${escapedContext}`,
        );
      }
    }
    if (character === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  if (entries.length === 0) {
    return '';
  }
  if (total > entries.length) {
    entries.push(`Omitted ${total - entries.length} additional matching characters.`);
  }
  return [
    'Character facts (descriptive metadata, not a grading verdict).',
    'Positions are one-based Unicode code points; lines are separated by LF.',
    ...entries,
  ].join('\n');
}
