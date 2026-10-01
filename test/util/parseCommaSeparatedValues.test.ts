import { describe, expect, it } from 'vitest';
import { parseCommaSeparatedValues } from '../../src/util/parseCommaSeparatedValues';

describe('parseCommaSeparatedValues', () => {
  it.each([
    ['', []],
    ['   ', []],
    ['"hello, world",foo', ['hello, world', 'foo']],
    [String.raw`"say \"hi\"",b`, ['say "hi"', 'b']],
    ['a ""quoted"" value, plain', ['a ""quoted"" value', 'plain']],
    ['alpha, , beta,, ', ['alpha', 'beta']],
    ['  spaced  ,  next  ', ['spaced', 'next']],
    ['"only one"', ['only one']],
    ['no-quotes-at-all', ['no-quotes-at-all']],
    ['"trailing"   ', ['trailing']],
    ['a,b,c', ['a', 'b', 'c']],
    ['""', ['']],
    ['" ",x', [' ', 'x']],
    ['x,"y,z"', ['x', 'y,z']],
    ['"a","b"', ['a', 'b']],
    ['"a" , "b"', ['a', 'b']],
    [String.raw`"\n",x`, [String.raw`\n`, 'x']],
    [String.raw`"\\",x`, ['\\', 'x']],
    ['a,', ['a']],
    [',a', ['a']],
    [',,,', []],
    ['"comma,inside","another, one"', ['comma,inside', 'another, one']],
    ['mix,"quoted, field",bare', ['mix', 'quoted, field', 'bare']],
    ['"a""b""c"', ['a"b"c']],
    ['"你好，世界",café', ['你好，世界', 'café']],
  ] as const)('parses %j as %j', (input, expected) => {
    expect(parseCommaSeparatedValues(input)).toEqual(expected);
  });

  it.each([
    ['"a"b,c', 'Expected comma after quoted field in contains assertion value'],
    ['"unterminated', 'Unterminated quoted field in contains assertion value'],
  ])('rejects %j with the existing error', (input, error) => {
    expect(() => parseCommaSeparatedValues(input)).toThrow(`Invariant failed: ${error}`);
  });
});
