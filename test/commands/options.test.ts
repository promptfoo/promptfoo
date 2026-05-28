import { InvalidArgumentError } from 'commander';
import { describe, expect, it } from 'vitest';
import { collectKeyValueOption, normalizeTagOption } from '../../src/commands/options';

describe('collectKeyValueOption', () => {
  it('parses a key=value pair into a record', () => {
    expect(collectKeyValueOption('--tag', 'env=ci', undefined)).toEqual({ env: 'ci' });
  });

  it('merges onto the previous accumulator (repeatable option)', () => {
    expect(collectKeyValueOption('--tag', 'run=123', { env: 'ci' })).toEqual({
      env: 'ci',
      run: '123',
    });
  });

  it('keeps everything after the first "=" so values may contain "="', () => {
    expect(collectKeyValueOption('--tag', 'token=a=b=c', undefined)).toEqual({ token: 'a=b=c' });
  });

  it('lets a later occurrence of the same key override an earlier one', () => {
    const first = collectKeyValueOption('--tag', 'build=first', undefined);
    expect(collectKeyValueOption('--tag', 'build=second', first)).toEqual({ build: 'second' });
  });

  it('accepts an explicitly empty value (key=)', () => {
    expect(collectKeyValueOption('--tag', 'empty=', undefined)).toEqual({ empty: '' });
  });

  it.each(['invalid', '=value'])('throws InvalidArgumentError for malformed input %p', (value) => {
    expect(() => collectKeyValueOption('--tag', value, undefined)).toThrow(InvalidArgumentError);
    expect(() => collectKeyValueOption('--tag', value, undefined)).toThrow(
      '--tag must be specified in key=value format.',
    );
  });

  it('includes the option name in the error message', () => {
    expect(() => collectKeyValueOption('--var', 'nope', undefined)).toThrow(
      '--var must be specified in key=value format.',
    );
  });

  it('stores a "__proto__" key as a harmless own property without polluting Object.prototype', () => {
    const result = collectKeyValueOption('--tag', '__proto__=evil', { a: '1' });

    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe('evil');
    // The prototype chain must remain untouched.
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).evil).toBeUndefined();
  });
});

describe('normalizeTagOption', () => {
  it('rewrites the Commander "tag" alias to the canonical "tags" field', () => {
    const result = normalizeTagOption({ tag: { env: 'ci' } });

    expect(result).toEqual({ tags: { env: 'ci' } });
    expect(result).not.toHaveProperty('tag');
  });

  it('passes through an existing "tags" field when no "tag" alias is present', () => {
    expect(normalizeTagOption({ tags: { env: 'ci' } })).toEqual({ tags: { env: 'ci' } });
  });

  it('prefers the CLI "tag" alias over a pre-existing "tags" field', () => {
    const result = normalizeTagOption({ tag: { env: 'cli' }, tags: { env: 'config' } });

    expect(result).toEqual({ tags: { env: 'cli' } });
    expect(result).not.toHaveProperty('tag');
  });

  it('adds no "tags" key when neither "tag" nor "tags" is present', () => {
    const input: { config: string; tag?: Record<string, string>; tags?: Record<string, string> } = {
      config: 'promptfooconfig.yaml',
    };
    const result = normalizeTagOption(input);

    expect(result).toEqual({ config: 'promptfooconfig.yaml' });
    expect(result).not.toHaveProperty('tags');
    expect(result).not.toHaveProperty('tag');
  });

  it('preserves unrelated options and does not mutate the input', () => {
    const input = { config: 'a.yaml', verbose: true, tag: { env: 'ci' } };
    const result = normalizeTagOption(input);

    expect(result).toEqual({ config: 'a.yaml', verbose: true, tags: { env: 'ci' } });
    // Input is left untouched.
    expect(input).toEqual({ config: 'a.yaml', verbose: true, tag: { env: 'ci' } });
  });
});
