import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

function score(outputString: string, renderedValue: string | string[]) {
  return handleMeteorAssertion({
    assertion: { type: 'meteor' },
    outputString,
    renderedValue,
  } as AssertionParams);
}

describe('METEOR whitespace tokenization', () => {
  it.each([
    ['  hello world\n', 'hello world'],
    ['hello world', '\thello world  '],
    ['  hello world\n', '\thello world  '],
    ['hello\t\nworld', 'hello world'],
    ['  hello world\n', ['unrelated', '\thello world  ']],
  ])(
    'preserves the score with whitespace around or between words: %j',
    async (output, reference) => {
      const result = await score(output, reference);
      expect(result.score).toBe(0.9375);
      expect(result.pass).toBe(true);
    },
  );

  it.each([
    ['   ', ''],
    ['\t\n', '  '],
    ['hello world', ''],
    ['   ', 'hello world'],
  ])('scores tokenless text as zero: %j', async (output, reference) => {
    const result = await score(output, reference);
    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('preserves rejection of an empty output string', async () => {
    await expect(score('', 'hello world')).rejects.toThrow('Invalid inputs');
  });

  it('strips trailing periods without changing periods inside a token', async () => {
    const result = await score('  version..one...\tend. ', 'version..one end');
    expect(result.score).toBe(0.9375);
    expect(result.pass).toBe(true);
  });

  it('handles long runs of periods before a non-period suffix', async () => {
    const word = `${'.'.repeat(100_000)}suffix`;
    const result = await score(`${word}...`, word);
    expect(result.score).toBe(0.5);
    expect(result.pass).toBe(true);
  });
});
