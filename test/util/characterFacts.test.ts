import { describe, expect, it } from 'vitest';
import { renderLlmRubricPrompt } from '../../src/matchers/rubric';
import { formatCharacterFacts } from '../../src/util/characterFacts';
import { getNunjucksEngine } from '../../src/util/templates';

describe('characterFacts', () => {
  it.each(['', ' 42 \t\r\n', 'café 中文 Ελληνικά 😀', String.raw`\u00a0`])(
    'does not annotate ordinary text or literal escape sequences: %s',
    (text) => expect(formatCharacterFacts(text)).toBe(''),
  );

  it.each([
    ['\u00a0', 'U+00A0 NO-BREAK SPACE'],
    ['\u202f', 'U+202F NARROW NO-BREAK SPACE'],
    ['\u200b', 'U+200B ZERO WIDTH SPACE'],
    ['\u2060', 'U+2060 WORD JOINER'],
    ['\ufeff', 'U+FEFF ZERO WIDTH NO-BREAK SPACE'],
    ['\u202e', 'U+202E RIGHT-TO-LEFT OVERRIDE'],
    ['\u2061', 'U+2061 UNICODE WHITESPACE OR FORMAT CHARACTER'],
  ])('identifies %s with escaped context', (character, expected) => {
    const facts = formatCharacterFacts(`😀a${character}b`);
    expect(facts).toContain(expected);
    expect(facts).not.toMatch(/[^\x00-\x7f]/);
    const context = facts.split('escaped context: ')[1];
    expect(JSON.parse(context)).toBe(`😀a${character}b`);
  });

  it('uses code-point columns and LF line boundaries', () => {
    const facts = formatCharacterFacts('😀\u00a0\r\n\u2028x\u200b');
    expect(facts).toContain('line 1, column 2: U+00A0');
    expect(facts).toContain('line 2, column 1: U+2028');
    expect(facts).toContain('line 2, column 3: U+200B');
  });

  it('bounds occurrences and context and reports omitted matches', () => {
    const facts = formatCharacterFacts('\u00a0'.repeat(10_000), 2, 0);
    expect(facts.match(/- line /g)).toHaveLength(2);
    expect(facts.match(/escaped context: "\\u00a0"/g)).toHaveLength(2);
    expect(facts).toContain('Omitted 9998 additional matching characters.');
    expect(facts.length).toBeLessThan(500);
  });

  it('bounds context in code points without splitting surrogate pairs', () => {
    const facts = formatCharacterFacts('outside😀a\u00a0b😀outside', 20, 2);
    const context = JSON.parse(facts.split('escaped context: ')[1]);
    expect(context).toBe('😀a\u00a0b😀');
    expect(facts).not.toContain('Omitted');
  });

  it.each([
    [0, 20],
    [-1, 20],
    [1.5, 20],
    [20, -1],
    [20, 1.5],
    [Infinity, 20],
  ])('rejects invalid limits %s, %s', (maxOccurrences, contextRadius) => {
    expect(() => formatCharacterFacts('', maxOccurrences, contextRadius)).toThrow(RangeError);
  });

  it('requires structured data to be explicitly serialized', () => {
    const env = getNunjucksEngine(undefined, false, true);
    expect(() => env.renderString('{{ value | characterFacts }}', { value: {} })).toThrow(
      'expects a string',
    );
    expect(
      env.renderString('{{ value | dump | characterFacts }}', { value: { text: '\u00a0' } }),
    ).toContain('U+00A0');
  });

  it('keeps original grader evidence intact and never renders runtime data as a template', async () => {
    const output = '{{env.OPENAI_API_KEY}}{% if true %}literal{% endif %}\nassert f("\u00a0")';
    const prompt = JSON.stringify([
      { role: 'user', content: '<output>{{ output }}</output>\n{{ output | characterFacts }}' },
    ]);
    const rendered = JSON.parse(await renderLlmRubricPrompt(prompt, { output }))[0].content;
    expect(rendered.startsWith(`<output>${output}</output>\nCharacter facts`)).toBe(true);
    expect(rendered).toContain('{{env.OPENAI_API_KEY}}');
    expect(rendered).toContain('{% if true %}literal{% endif %}');
    expect(rendered).toContain('line 2, column 11: U+00A0');
  });

  it('does not add facts to existing templates unless explicitly requested', async () => {
    const output = 'a\u00a0b';
    const rendered = await renderLlmRubricPrompt('{{ output }}', { output });
    expect(rendered).toBe(output);
  });
});
